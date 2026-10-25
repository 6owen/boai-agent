/*
 * [INPUT]: 已通过文件边界检查的 boai-skill-library v1、旧 meta.ts 字面量与可选 JSON 来源/收藏附录。
 * [OUTPUT]: 离线包校验、可携带来源和按包内条目关联的收藏恢复提示；兼容旧库缺失收藏附录，不指示已移除的“我的”选项；不执行 TypeScript 或访问网络。
 * [POS]: Skills 便携库格式适配；管理提交和员工授权由 resources 用例负责。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { z } from 'zod'
import type { SkillFile, SkillSource } from '@boai/shared/domain/skills'
import { inspectResourceTree } from '../../modules/resources/local-resources'
import { boundedRead, restrictedPath } from '../../modules/workspaces/file-access'
import { archivePath } from './archive'
import { githubRepository, portableUrl, type PreparedSkillSource } from './source'

const text = z.string().min(1).max(2000), digest = z.string().regex(/^[a-f0-9]{64}$/)
const slug = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/i)
const entryKey = z.string().regex(/^skills\/[a-z0-9][a-z0-9._-]{0,199}$/i)
const safePath = text.refine(value => { try { return value === '.' || archivePath(value) === value } catch { return false } }, '技能库相对路径无效')
export const libraryManifestSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('boai-skill-library'), name: text, exportedAt: z.number().nonnegative(), skillsPath: z.literal('skills'), vendorPath: z.literal('vendor'), sourcesPath: z.literal('sources') }).strict()
const lockEntry = z.object({ kind: z.enum(['local', 'vendor', 'source', 'snapshot']), checksum: digest.optional(), sourceId: slug.optional(), revision: text.optional(), installedAt: text.optional(), updatedAt: text.optional(), snapshot: z.boolean().optional() }).strict()
export const libraryLockSchema = z.object({ schemaVersion: z.literal(1), exportedAt: z.number().nonnegative(), skills: z.record(text, lockEntry) }).strict()
const gitSourceSchema = z.object({ kind: z.literal('git'), repository: text, ref: z.string().min(1).max(200).regex(/^[^\x00-\x1f]+$/), skillPath: safePath, resolvedCommit: z.string().regex(/^[a-f0-9]{40}$/).optional() }).strict()
const portableSourceSchema = z.discriminatedUnion('kind', [gitSourceSchema, z.object({ kind: z.literal('url'), url: z.string().min(1).max(8000), skillPath: safePath }).strict(), z.object({ kind: z.literal('marketplace'), provider: z.enum(['skills-sh', 'clawhub', 'skillhub']), providerItemId: text, skillPath: safePath, resolvedCommit: z.string().regex(/^[a-f0-9]{40}$/).optional() }).strict(), z.object({ kind: z.literal('snapshot') }).strict()])
export type PortableSkillSource = z.infer<typeof portableSourceSchema>
export const librarySourcesSchema = z.object({ schemaVersion: z.literal(1), entries: z.record(entryKey, z.object({ contentHash: digest, source: portableSourceSchema }).strict()) }).strict()
const groupKey = z.string().regex(/^[a-z0-9-]{1,100}$/)
export const libraryCollectionsSchema = z.object({ schemaVersion: z.literal(1), groups: z.array(z.object({ key: groupKey, name: z.string().trim().min(1).max(40) }).strict()).max(100), entries: z.record(entryKey, z.object({ favorite: z.boolean(), group: groupKey.optional() }).strict()) }).strict()
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const snapshotSource = (contentHash: string): SkillSource => ({ kind: 'snapshot', identity: hash(JSON.stringify(['boai-skill-library', contentHash])), reason: '技能库中的离线内容快照' })

/** Recompute identity; imported machine IDs and paths are never trusted as source authority. */
export function restoreLibrarySource(value: PortableSkillSource, contentHash: string): SkillSource {
  if (value.kind === 'snapshot') return snapshotSource(contentHash)
  if (value.kind === 'git') {
    const repository = githubRepository(value.repository)
    return { ...value, repository, identity: hash(JSON.stringify([repository, value.ref, value.skillPath])) }
  }
  if (value.kind === 'url') {
    const url = portableUrl(value.url)
    if (!url) throw new Error('来源地址含临时凭据')
    return { ...value, url, identity: hash(JSON.stringify([url, value.skillPath])) }
  }
  // Provider IDs carry identity only; fetching later still goes through the provider's validated detail API.
  if (/[\\\x00-\x1f]/.test(value.providerItemId) || value.providerItemId.includes('://')) throw new Error('商店来源标识无效')
  return { ...value, identity: hash(JSON.stringify([value.provider, value.providerItemId])) }
}

export function portableLibrarySource(source: SkillSource | undefined, contentHash: string): PortableSkillSource {
  if (!source || source.kind === 'local' || source.kind === 'snapshot') return { kind: 'snapshot' }
  const { identity: _identity, ...value } = source
  const parsed = portableSourceSchema.parse(value)
  restoreLibrarySource(parsed, contentHash)
  return parsed
}

export async function readLibraryBytes(root: string, file: SkillFile, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const path = await restrictedPath([root], join(root, archivePath(file.path)))
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.nlink > 1 || before.size !== file.size) throw new Error('技能库文件已变更，请重新预览')
    const buffer = Buffer.alloc(file.size + 1)
    let size = 0
    while (size < buffer.length) {
      signal?.throwIfAborted()
      const result = await handle.read(buffer, size, Math.min(64 * 1024, buffer.length - size), null)
      if (!result.bytesRead) break
      size += result.bytesRead
    }
    const after = await handle.stat(), bytes = buffer.subarray(0, size)
    if (size !== file.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || createHash('sha256').update(bytes).digest('hex') !== file.hash) throw new Error('技能库文件已变更，请重新预览')
    return bytes
  } finally { await handle.close() }
}
export function legacyLibraryChecksum(files: { path: string; bytes: Uint8Array }[]) {
  const checksum = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) checksum.update(file.path).update('\0').update(Buffer.from(file.bytes).toString('base64')).update('\0')
  return checksum.digest('hex')
}

type AstLiteral = { type: string; value?: unknown; name?: string; properties?: AstLiteral[]; key?: AstLiteral; computed?: boolean; shorthand?: boolean }
/** The old exporter emits only string/object literals for vendors. Other code is never evaluated. */
function readLegacyVendors(source: string) {
  if (source.length > 256 * 1024) throw new Error('meta.ts 过大')
  const program = parse(source, { sourceType: 'module', plugins: ['typescript'], attachComment: false }).program
  const declarations = program.body.flatMap(statement => statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration' && statement.declaration.kind === 'const' ? statement.declaration.declarations : [])
  const vendors = declarations.filter(declaration => declaration.id.type === 'Identifier' && declaration.id.name === 'vendors')
  if (vendors.length !== 1) throw new Error('meta.ts 没有唯一的 vendors 字面量')
  let count = 0
  const literal = (node: AstLiteral | undefined, depth: number): unknown => {
    if (++count > 10000 || depth > 6) throw new Error('meta.ts 声明超限')
    if (node?.type === 'StringLiteral') return node.value
    if (node?.type !== 'ObjectExpression' || !Array.isArray(node.properties)) throw new Error('meta.ts 来源声明包含动态表达式')
    const result: Record<string, unknown> = Object.create(null)
    for (const property of node.properties) {
      const key = property.key?.type === 'Identifier' ? property.key.name : property.key?.type === 'StringLiteral' ? property.key.value : undefined
      if (property.type !== 'ObjectProperty' || property.computed || property.shorthand || typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(result, key)) throw new Error('meta.ts 来源属性无效或重复')
      result[key] = literal(property.value as AstLiteral, depth + 1)
    }
    return result
  }
  return z.record(slug, z.object({ source: text, skillsPath: safePath.optional(), skills: z.record(safePath, slug) }).strict()).parse(literal(vendors[0].init as AstLiteral, 0))
}
async function optionalText(root: string, name: string) {
  try { return await boundedRead(await restrictedPath([root], join(root, name))) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}

export async function prepareSkillLibrary(prepared: PreparedSkillSource, signal: AbortSignal): Promise<PreparedSkillSource> {
  const manifestText = await optionalText(prepared.root, 'boai.json')
  if (manifestText === undefined) return prepared
  const manifest = libraryManifestSchema.parse(JSON.parse(manifestText))
  // Applies the same aggregate bounds to directory imports as ZIP imports, including metadata and unused scaffolding.
  await inspectResourceTree(prepared.root, signal)
  const lock = libraryLockSchema.parse(JSON.parse(await optionalText(prepared.root, 'boai.lock.json') ?? 'null'))
  const warnings = [...prepared.warnings, '恢复包内保存的技能内容；不会运行库中的 CLI、meta.ts、安装脚本或 Git 命令。']
  const sourcesText = await optionalText(prepared.root, 'boai-agent.sources.json')
  const sources = sourcesText === undefined ? undefined : librarySourcesSchema.parse(JSON.parse(sourcesText))
  const collectionsText = await optionalText(prepared.root, 'boai-agent.collections.json')
  const collections = collectionsText === undefined ? undefined : libraryCollectionsSchema.parse(JSON.parse(collectionsText))
  if (!collections) warnings.push('此旧技能库未保存收藏分组。')
  const groups = new Map(collections?.groups.map(group => [group.key, group.name.trim().replace(/\s+/g, ' ')]) ?? [])
  if (groups.size !== (collections?.groups.length ?? 0) || new Set([...groups.values()].map(name => name.toLowerCase())).size !== groups.size) throw new Error('技能库包含重复分组')
  const locked = new Map<string, z.infer<typeof lockEntry>>()
  for (const [key, entry] of Object.entries(lock.skills)) {
    const parts = key.split(':')
    if (parts.length !== 2 || !parts[0] || !slug.safeParse(parts[1]).success || archivePath(parts[1]) !== parts[1] || locked.has(parts[1])) throw new Error('技能库 lock 包含无效或重复条目')
    locked.set(parts[1], entry)
  }
  const root = await restrictedPath([prepared.root], join(prepared.root, manifest.skillsPath))
  const names = await readdir(root)
  if (!names.length || names.length !== locked.size || names.some(name => !locked.has(name))) throw new Error('技能库 lock 与 skills 目录不一致')
  for (const key of [...Object.keys(sources?.entries ?? {}), ...Object.keys(collections?.entries ?? {})]) if (!locked.has(key.slice('skills/'.length))) throw new Error('技能库附录引用了不存在的技能')
  for (const value of Object.values(collections?.entries ?? {})) if (value.group && (!value.favorite || !groups.has(value.group))) throw new Error('技能库收藏分组引用无效')
  let vendors: ReturnType<typeof readLegacyVendors> = {}
  const meta = await optionalText(prepared.root, 'meta.ts')
  if (meta !== undefined && !sources) {
    try { vendors = readLegacyVendors(meta) }
    catch { warnings.push('旧库来源声明无法静态验证，相关技能保留为内容快照。') }
  }
  const entries = new Map<string, { source: SkillSource; hash: string; warnings: string[]; error?: string; collection?: { favorite: boolean; group?: string } }>()
  for (const name of names.sort()) {
    signal.throwIfAborted()
    const path = join(root, name), key = `skills/${name}`, entry = locked.get(name)!
    if (!(await lstat(path)).isDirectory()) throw new Error('技能库 skills 中只能包含技能目录')
    const tree = await inspectResourceTree(path, signal)
    if (!tree.files.some(file => file.path === 'SKILL.md')) throw new Error(`技能库条目 ${name} 缺少 SKILL.md`)
    const value: { source: SkillSource; hash: string; warnings: string[]; error?: string; collection?: { favorite: boolean; group?: string } } = { source: snapshotSource(tree.hash), hash: tree.hash, warnings: [] }
    if (entry.checksum) {
      const files = []
      for (const file of tree.files) files.push({ path: file.path, bytes: await readLibraryBytes(path, file, signal) })
      if (legacyLibraryChecksum(files) !== entry.checksum) value.error = '技能内容与旧库 checksum 不一致，请核对原包'
    }
    const portable = sources?.entries[key]
    if (portable) {
      if (portable.contentHash !== tree.hash) value.error = '技能内容与来源附录 hash 不一致，请重新导出'
      else try { value.source = restoreLibrarySource(portable.source, tree.hash) } catch { value.warnings.push('来源信息不可携带，已保留为离线快照。') }
    } else if (!entry.snapshot && entry.sourceId && vendors[entry.sourceId]) {
      try {
        const vendor = vendors[entry.sourceId], paths = Object.entries(vendor.skills).filter(([, target]) => target === name)
        if (paths.length !== 1) throw new Error('来源映射不唯一')
        const skillPath = [vendor.skillsPath, paths[0][0]].filter(part => part && part !== '.').join('/') || '.'
        value.source = restoreLibrarySource(gitSourceSchema.parse({ kind: 'git', repository: vendor.source, ref: 'HEAD', skillPath, ...(/^[a-f0-9]{40}$/.test(entry.revision ?? '') ? { resolvedCommit: entry.revision } : {}) }), tree.hash)
        value.warnings.push('旧库未记录更新分支，后续检查使用默认分支；本次仍只恢复包内内容。')
      } catch { value.warnings.push('旧 GitHub 来源无法验证，已保留为离线快照。') }
    }
    if (value.source.kind === 'snapshot') value.warnings.push('来源或版本不可还原，保留内容快照，不自动更新。')
    const collection = collections?.entries[key]
    if (collection) value.collection = { favorite: collection.favorite, ...(collection.group ? { group: groups.get(collection.group)! } : {}) }
    entries.set(path, value)
  }
  return { ...prepared, root, warnings, library: { name: manifest.name, groups: [...groups.values()], favoriteCount: Object.values(collections?.entries ?? {}).filter(value => value.favorite).length }, source: path => entries.get(path)!.source, hints: path => {
    const entry = entries.get(path)
    if (!entry) throw new Error('技能不属于库的 lock 清单')
    return entry
  } }
}
