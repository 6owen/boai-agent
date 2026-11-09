/*
 * [INPUT]: 固定材料/成果/知识资料身份、原运行时读取与已安装应用适配器。
 * [OUTPUT]: 核对当前原件后默认/指定应用打开或定位；无扩展名材料使用带原文件名的只读临时副本，退出仅清理未修改副本。
 * [POS]: 两类文件面板的Main外部打开边界，不接受任意宿主路径或建立目录授权。
 * [PROTOCOL]: 变化同步Header与main/.folder.md。
 */
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { DesktopApi } from '@boai/shared/ipc'
import { materialDirectory, readMaterialOriginal } from '@boai/shared/node/material-files'
import { WorkspaceApplications } from './workspace-applications'

const id = z.string().min(1).max(200), hash = z.string().regex(/^[a-f0-9]{64}$/)
const inputSchema = z.object({
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('material'), conversationId: id, id, contentHash: hash, revision: z.number().int().positive() }).strict(),
    z.object({ kind: z.literal('artifact'), conversationId: id, id, contentHash: hash }).strict(),
    z.object({ kind: z.literal('knowledge'), agentId: id, resourceId: id, contentHash: hash.optional(), revision: z.number().int().nonnegative().optional() }).strict(),
  ]),
  action: z.enum(['open', 'reveal']).default('open'), applicationId: id.optional(),
}).strict()
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export class FileOpening {
  private pending = new Set<Promise<void>>()
  private copies = new Map<string, { file: string; hash: string }>()
  constructor(private request: DesktopApi['request'], private applications: WorkspaceApplications, private dataPath: string) {}

  open(input: unknown) {
    const result = this.openChecked(input).finally(() => this.pending.delete(result))
    this.pending.add(result)
    return result
  }
  private async openChecked(input: unknown) {
    const { target, action, applicationId } = inputSchema.parse(input)
    // Complete the potentially slow application scan before rechecking the source.
    if (applicationId && applicationId !== 'system') await this.applications.list()
    let path: string
    if (target.kind === 'knowledge') {
      const view = await this.request('getEmployeeKnowledgeFiles', { agentId: target.agentId, resourceId: target.resourceId })
      if (target.contentHash !== undefined && target.contentHash !== view.contentHash || target.revision !== undefined && target.revision !== view.revision) throw new Error('知识资料已变化，请刷新后重新打开')
      path = await realpath(view.resource.path)
    } else if (target.kind === 'artifact') {
      const preview = await this.request('getArtifactPreview', { id: target.id, expectedHash: target.contentHash })
      if (preview.artifact.conversationId !== target.conversationId || preview.artifact.contentHash !== target.contentHash) throw new Error('成果来源已变化，请刷新后重新打开')
      path = await realpath(preview.artifact.path)
    } else {
      const { material } = await this.request('getMaterialPreview', { id: target.id, expectedRevision: target.revision })
      if (material.conversationId !== target.conversationId || material.contentHash !== target.contentHash || !material.messageId) throw new Error('材料来源已变化，请刷新后重新打开')
      const actual = await readMaterialOriginal(this.dataPath, target.conversationId, target.id, target.contentHash)
      if (action === 'reveal') path = join(materialDirectory(await realpath(this.dataPath), target.conversationId, target.id), 'original')
      else {
        const directory = await realpath(await mkdtemp(join(tmpdir(), 'boai-file-open-')))
        const name = material.name.replace(/[\\/\x00-\x1f]/g, '_')
        path = join(directory, !name || name === '.' || name === '..' ? '附件' : name)
        this.copies.set(directory, { file: path, hash: actual.contentHash })
        await writeFile(path, actual.bytes, { flag: 'wx', mode: 0o400 })
      }
    }
    await this.applications.open(path, action, applicationId)
  }
  async close() {
    await Promise.allSettled([...this.pending])
    await Promise.all([...this.copies].map(async ([directory, copy]) => {
      try {
        if (await realpath(directory) !== directory || (await lstat(copy.file)).isSymbolicLink()) { this.copies.delete(directory); return }
        const bytes = await readFile(copy.file)
        // Editors may replace even a read-only file. Preserve any user changes.
        if (digest(bytes) !== copy.hash) { this.copies.delete(directory); return }
        await unlink(copy.file)
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      try { await rmdir(directory) } catch (error) { if (!['ENOENT', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error }
      this.copies.delete(directory)
    }))
  }
}
