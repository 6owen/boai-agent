/*
 * [INPUT]: 本地资源目录、SKILL.md YAML 与受管数据根。
 * [OUTPUT]: 历史/活动成果枚举排除宿主团队文件归属标记，不进入用户列表或启动历史登记；本机展示兼容名称与受管导入严格名称规则分离；有界普通文件树/hash、统一技能元数据解析、复制导入和产物列表。
 * [POS]: resources 的文件校验与复制边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { cp, lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseDocument } from 'yaml'
import type { Artifact, Resource } from '@boai/shared/domain'
import type { SkillFile } from '@boai/shared/domain/skills'
import { boundedRead, restrictedPath } from '../workspaces/file-access'

export const RESOURCE_LIMITS = { entries: 2000, bytes: 100 * 1024 * 1024, depth: 32 } as const

export function isWithin(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return !rel || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

export async function inspectResourceTree(root: string, signal?: AbortSignal): Promise<{ hash: string; files: SkillFile[]; bytes: number; entries: number }> {
  const files: SkillFile[] = []
  let count = 0, bytes = 0
  const visit = async (file: string, depth: number): Promise<void> => {
    signal?.throwIfAborted()
    if (++count > RESOURCE_LIMITS.entries || depth > RESOURCE_LIMITS.depth) throw new Error('资源包最多包含 2000 个文件和目录，深度最多 32 层')
    const stat = await lstat(file)
    if (stat.isSymbolicLink()) throw new Error('资源包不能包含符号链接')
    await restrictedPath([root], file)
    if (stat.isDirectory()) {
      for (const name of (await readdir(file)).sort()) await visit(join(file, name), depth + 1)
    } else if (stat.isFile()) {
      if (stat.nlink > 1) throw new Error('资源包不能包含硬链接')
      const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        const before = await handle.stat()
        if (!before.isFile() || before.nlink > 1) throw new Error('资源包只能包含普通文件')
        const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024)
        let size = 0
        for (;;) {
          signal?.throwIfAborted()
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
          if (!bytesRead) break
          size += bytesRead; bytes += bytesRead
          if (bytes > RESOURCE_LIMITS.bytes) throw new Error('资源包不能超过 100 MB')
          hash.update(buffer.subarray(0, bytesRead))
        }
        const after = await handle.stat()
        if (before.size !== size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('资源内容已变更，请重新扫描')
        files.push({ path: relative(root, file).split(sep).join('/') || basename(file), size, hash: hash.digest('hex') })
      } finally { await handle.close() }
    } else throw new Error('资源包只能包含普通文件和目录')
  }
  await visit(root, 0)
  return { files, bytes, entries: count, hash: createHash('sha256').update(JSON.stringify(files)).digest('hex') }
}

export function parseSkillDocument(text: string, { strictName = true }: { strictName?: boolean } = {}) {
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error('SKILL.md 缺少 YAML frontmatter')
  const document = parseDocument(match[1])
  if (document.errors.length) throw new Error('SKILL.md YAML 无效：' + document.errors[0].message)
  const metadata: unknown = document.toJS({ maxAliasCount: 20 })
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('SKILL.md 元数据必须为字段对象')
  const fields = metadata as Record<string, unknown>
  const name = typeof fields.name === 'string' ? fields.name.trim() : ''
  if (strictName && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error('SKILL.md 的 name 必须为小写英文、数字和连字符组成的简单目录名，最多 64 字符')
  if (!name || name.length > 200) throw new Error('SKILL.md 的 name 必须为 1–200 个字符')
  if (fields.description !== undefined && typeof fields.description !== 'string') throw new Error('SKILL.md description 必须为文本')
  const description = (fields.description as string | undefined)?.trim() ?? ''
  if (description.length > 10000) throw new Error('Skill 说明过长')
  const warnings = Object.keys(fields).filter(key => !['name', 'description', 'license', 'compatibility', 'metadata'].includes(key)).map(key => `声明 ${key} 仅保留为说明，不自动改变员工权限或工具。`)
  if (!description) warnings.push('此 Skill 未填写 description。')
  return { name, description, warnings }
}

export async function importLocalResource(dataPath: string, kind: Resource['kind'], source: string, resourceId: string = randomUUID()): Promise<Resource> {
  if (!isAbsolute(source)) throw new Error('请选择资源的绝对路径')
  const stat = await lstat(source)
  if (stat.isSymbolicLink()) throw new Error('不能导入符号链接')
  if (kind === 'skill' && !stat.isDirectory()) throw new Error('Skill 必须是包含 SKILL.md 的目录')
  if (kind === 'knowledge' && (!stat.isFile() || !['.md', '.txt'].includes(extname(source).toLowerCase()))) throw new Error('当前知识库支持 Markdown 和 TXT 文件')
  await inspectResourceTree(source)
  const { name, description } = kind === 'skill' ? parseSkillDocument(await boundedRead(join(source, 'SKILL.md'))) : { name: basename(source), description: '本地知识文档' }
  const id = resourceId
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('无效的受管资源标识')
  const parent = join(dataPath, kind === 'skill' ? 'skills' : 'knowledge')
  const destination = join(parent, id)
  if (isWithin(source, destination)) throw new Error('不能将资源复制到它自身的子目录')
  const temporary = join(parent, `.import-${id}`)
  await mkdir(parent, { recursive: true })
  try {
    await mkdir(temporary)
    if (kind === 'skill') await cp(source, join(temporary, name), { recursive: true, errorOnExist: true, force: false, dereference: false })
    else await cp(source, join(temporary, basename(source)), { errorOnExist: true, force: false })
    // Recheck the copied tree to reject symlinks introduced during the copy.
    await inspectResourceTree(temporary)
    await rename(temporary, destination)
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error }
  return { id, kind, name, description, path: join(destination, kind === 'skill' ? name : basename(source)), createdAt: new Date().toISOString() }
}

export async function listArtifacts(workspace: string): Promise<Artifact[]> {
  const artifacts: Artifact[] = []
  const root = await realpath(workspace)
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (artifacts.length >= 2000) return
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink() || entry.name === '.team-creation.json') continue
      const resolved = await realpath(path)
      if (!isWithin(root, resolved)) continue
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) {
        const stat = await lstat(path)
        const name = relative(root, path)
        artifacts.push({ name, path: join(workspace, name), size: stat.size })
      }
    }
  }
  await walk(root)
  return artifacts.sort((a, b) => a.name.localeCompare(b.name))
}
