/*
 * [INPUT]: 本地目录/ZIP、公开 HTTPS/GitHub 或经过重读的商店下载目标。
 * [OUTPUT]: 不执行源码的临时技能树、规范来源身份、可携带 URL 校验、确定 commit 和兼容提示；本地安装目标禁止员工归属。
 * [POS]: Skills 来源准备适配器；供同一预览/安装/更新管道使用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { ScanSkillSourceInput, SkillScan, SkillSource } from '../../../shared/domain/skills'
import type { SkillMarketplaceDetailRequest, SkillMarketplaceItem } from '../../../shared/domain/skill-marketplace'
import { restrictedPath } from '../../modules/workspaces/file-access'
import { archivePath, extractSkillArchive } from './archive'
import { downloadBytes, downloadUrl, SKILL_DOWNLOAD_LIMITS, type DownloadTransport } from './download'

const sourceText = z.string().trim().min(1).max(8000)
export const scanSkillSchema = z.object({ source: sourceText, kind: z.enum(['folder', 'zip', 'url', 'github', 'marketplace']).optional(), target: z.literal('local').optional(), ownerAgentId: z.string().min(1).max(200).optional(), requestId: z.string().min(1).max(200).optional(), provider: z.enum(['skills-sh', 'clawhub', 'skillhub']).optional(), ref: z.string().trim().min(1).max(200).optional(), subpath: z.string().trim().max(2000).optional() }).strict().superRefine((input, context) => {
  if (input.target === 'local' && input.ownerAgentId) context.addIssue({ code: 'custom', message: '本地技能安装不指定员工' })
  if (input.kind === 'marketplace' && !input.provider) context.addIssue({ code: 'custom', message: '请选择技能商店来源' })
  if (input.kind !== 'marketplace' && input.provider) context.addIssue({ code: 'custom', message: '此来源不能指定商店' })
  if (input.kind !== 'github' && (input.ref || input.subpath)) context.addIssue({ code: 'custom', message: 'ref 和子目录只适用于 GitHub 来源' })
})
export interface PreparedSkillSource {
  root: string
  temporary?: string
  warnings: string[]
  expectedName?: string
  singleCandidateAllowed?: boolean
  library?: SkillScan['library']
  hints?(path: string): { hash: string; warnings: string[]; error?: string; collection?: { favorite: boolean; group?: string } }
  source(path: string): SkillSource
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const childPath = (root: string, path: string) => relative(root, path).split(sep).join('/') || '.'

export function githubRepository(value: string) {
  const normalized = value.replace(/\.git\/?$/i, '')
  const url = normalized.startsWith('https://') ? downloadUrl(normalized) : new URL(`https://github.com/${normalized}`)
  if (url.hostname !== 'github.com' || url.search || url.hash || !/^\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/?$/i.test(url.pathname)) throw new Error('请填写公开 GitHub 仓库地址；分支和子目录请分别填写')
  return `https://github.com/${url.pathname.split('/').filter(Boolean).join('/').toLowerCase()}`
}
export function portableUrl(value: string) {
  const url = downloadUrl(value)
  return [...url.searchParams.keys()].some(key => /token|secret|password|signature|credential|authorization|api.?key|^sig$|^expires$|^x-amz-/i.test(key)) ? undefined : url.href
}

export class SkillSources {
  readonly staging: string
  constructor(dataPath: string, private readonly options: { transport?: DownloadTransport; marketplace: (request: SkillMarketplaceDetailRequest, signal: AbortSignal) => Promise<SkillMarketplaceItem> }) { this.staging = join(dataPath, 'skill-staging') }
  async clearStaging() {
    try { await restrictedPath([resolve(this.staging, '..')], this.staging); await rm(this.staging, { recursive: true }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  private async readArchive(path: string, signal: AbortSignal) {
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.nlink > 1 || stat.size > SKILL_DOWNLOAD_LIMITS.bytes) throw new Error('请选择不超过 100 MB 的普通 ZIP 文件')
      const stream = handle.createReadStream({ autoClose: false, signal }), chunks: Buffer[] = []
      let size = 0
      for await (const chunk of stream) { size += chunk.length; if (size > SKILL_DOWNLOAD_LIMITS.bytes) throw new Error('ZIP 输入超过 100 MB 上限'); chunks.push(chunk) }
      return Buffer.concat(chunks)
    } finally { await handle.close() }
  }
  private download(url: string, signal: AbortSignal, maxBytes?: number) { return downloadBytes(url, { signal, maxBytes, transport: this.options.transport }) }
  async prepare(input: ScanSkillSourceInput, signal: AbortSignal): Promise<PreparedSkillSource> {
    signal.throwIfAborted()
    const kind = input.kind ?? 'folder'
    if (kind === 'folder') {
      if (!isAbsolute(input.source) || !(await lstat(input.source)).isDirectory()) throw new Error('请选择技能目录的绝对路径')
      const root = resolve(input.source)
      await restrictedPath([root], root)
      return { root, warnings: [], source: path => ({ kind: 'local', identity: hash(resolve(path)) }) }
    }
    if (kind === 'marketplace') {
      const item = await this.options.marketplace({ provider: input.provider!, id: input.source }, signal)
      if (!item.install) throw new Error('此商店条目未提供可安装的来源')
      const prepared = await this.prepare({ source: item.install.source, kind: item.install.kind === 'git' ? 'github' : 'url' }, signal)
      const original = prepared.source
      prepared.expectedName = item.install.slug
      prepared.singleCandidateAllowed = item.install.kind === 'url'
      prepared.source = path => {
        const upstream = original(path)
        return { kind: 'marketplace', identity: hash(JSON.stringify([item.provider, item.id])), provider: item.provider, providerItemId: item.id, skillPath: childPath(prepared.root, path), ...(upstream.kind === 'git' ? { resolvedCommit: upstream.resolvedCommit } : {}) }
      }
      if (item.suspicious) prepared.warnings.push('提供方已标记此技能存在风险，请仔细检查内容。安装不会授权执行。')
      return prepared
    }
    if (kind === 'github') {
      const repository = githubRepository(input.source), ref = input.ref ?? 'HEAD'
      if (/[\x00-\x1f]/.test(ref)) throw new Error('GitHub ref 无效')
      const repoPath = new URL(repository).pathname
      const resolved = await this.download(`https://api.github.com/repos${repoPath}/commits/${encodeURIComponent(ref)}`, signal, 1024 * 1024)
      const commit = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }).parse(JSON.parse(resolved.bytes.toString('utf8'))).sha
      const downloaded = await this.download(`https://codeload.github.com${repoPath}/zip/${commit}`, signal)
      const extracted = await extractSkillArchive(downloaded.bytes, this.staging, signal)
      try {
        const names = await readdir(extracted.directory)
        if (names.length !== 1) throw new Error('GitHub 归档根目录格式无效')
        const repositoryRoot = join(extracted.directory, names[0])
        if (!(await lstat(repositoryRoot)).isDirectory()) throw new Error('GitHub 归档没有仓库目录')
        const root = input.subpath ? join(repositoryRoot, archivePath(input.subpath)) : repositoryRoot
        await restrictedPath([repositoryRoot], root)
        return { root, temporary: extracted.directory, warnings: [], source: path => {
          const skillPath = childPath(repositoryRoot, path)
          return { kind: 'git', repository, ref, resolvedCommit: commit, skillPath, identity: hash(JSON.stringify([repository, ref, skillPath])) }
        } }
      } catch (error) { await rm(extracted.directory, { recursive: true, force: true }); throw error }
    }
    const local = kind === 'zip'
    if (local && !isAbsolute(input.source)) throw new Error('请选择 ZIP 文件的绝对路径')
    const bytes = local ? await this.readArchive(input.source, signal) : (await this.download(input.source, signal)).bytes
    const extracted = await extractSkillArchive(bytes, this.staging, signal)
    const url = local ? undefined : portableUrl(input.source), identity = local ? hash(resolve(input.source)) : url ?? hash(bytes)
    return { root: extracted.directory, temporary: extracted.directory, warnings: !local && !url ? ['此下载地址含临时凭据，仅保存内容快照，不保存地址或提供自动更新。'] : [], source: path => {
      const skillPath = childPath(extracted.directory, path)
      return url ? { kind: 'url', url, skillPath, identity: hash(JSON.stringify([identity, skillPath])) } : { kind: local ? 'local' : 'snapshot', identity: hash(JSON.stringify([identity, skillPath])), ...(!local ? { reason: '临时下载来源不可更新' } : {}) }
    } }
  }
}
