/*
 * [INPUT]: 宿主授权的聊天、已发布产物记录、可信数据根及其系统别名、取消信号与可选来源复核回调。
 * [OUTPUT]: 指定同名 JSON 的唯一最新发布版本、已登记 hash 一致与可检查证据；仅可信根规范化，打开前/读取后复核来源，拒绝外改、歧义、子路径链接、越界和读取中变化。
 * [POS]: 监控的本地产物读取适配；不运行技能或模型，不修改源文件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { Artifact, Conversation } from '../../../shared/domain'
import type { AutomationMonitorPolicy, AutomationMonitorRead } from '../../../shared/domain/automations'
import { restrictedPath } from '../workspaces/file-access'

const MAX_BYTES = 128 * 1024
type PublishedArtifact = Artifact & { id: string; conversationId: string }
export async function readMonitorArtifact(dataPath: string, conversation: Conversation, artifacts: PublishedArtifact[], source: AutomationMonitorPolicy['source'], signal: AbortSignal, verifySelected?: (artifact: PublishedArtifact) => Promise<void>): Promise<AutomationMonitorRead> {
  signal.throwIfAborted()
  if (!/^[^\\/:\0]+\.json$/i.test(source.name)) throw new Error('监控来源必须使用明确的 JSON 文件名')
  if (source.conversationId !== conversation.id || !/^[a-zA-Z0-9_-]{1,200}$/.test(conversation.id)) throw new Error('监控来源不属于指定聊天')
  const candidates = artifacts.filter(a => a.conversationId === conversation.id && a.name === source.name)
  if (!candidates.length) throw new Error('未找到该聊天已发布的 JSON 文件')
  if (candidates.some(a => !a.publishedAt || !z.iso.datetime().safeParse(a.publishedAt).success)) throw new Error('同名产物缺少可信发布时间，请重新发布')
  candidates.sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
  const selected = candidates[0]!
  if (candidates[1] && Date.parse(selected.publishedAt!) === Date.parse(candidates[1].publishedAt!)) throw new Error('同名最新产物的发布时间相同，无法确定数据版本')
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(selected.id)) throw new Error('产物身份无效')
  await verifySelected?.(selected); signal.throwIfAborted()
  // Only the host-selected data root may be canonicalized; descendants still reject every link.
  const canonicalData = await realpath(resolve(dataPath)), roots = [resolve(dataPath), canonicalData].map(root => join(root, 'workspaces', conversation.id))
  const expectedPaths = roots.map(root => join(root, 'artifacts', `${selected.id}-${source.name}`)), expected = expectedPaths[1]!
  if (!roots.includes(resolve(conversation.workspacePath)) || !expectedPaths.includes(resolve(selected.path))) throw new Error('产物路径不属于受管发布位置')
  const path = await restrictedPath([canonicalData], expected), initial = await lstat(path)
  if (!initial.isFile() || initial.nlink !== 1 || initial.size > MAX_BYTES) throw new Error('监控来源必须是 128 KiB 以内的普通 JSON 文件')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.nlink !== 1 || before.size > MAX_BYTES || before.ino !== initial.ino || before.dev !== initial.dev) throw new Error('产物在打开时已变化')
    const buffer = Buffer.alloc(before.size + 1)
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      signal.throwIfAborted()
      const read = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
      if (!read.bytesRead) break
      bytesRead += read.bytesRead
    }
    const after = await handle.stat(), current = await lstat(await restrictedPath([canonicalData], expected))
    if (bytesRead !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.nlink !== 1 || current.ino !== before.ino || current.dev !== before.dev || !current.isFile() || current.nlink !== 1 || current.size !== before.size || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs) throw new Error('产物在读取时已变化，本次不推进检查点')
    signal.throwIfAborted()
    const bytes = buffer.subarray(0, bytesRead), fileHash = createHash('sha256').update(bytes).digest('hex')
    if (selected.contentHash !== undefined && selected.contentHash !== fileHash) throw new Error('产物已被外部修改，本次不推进检查点')
    await verifySelected?.(selected); signal.throwIfAborted()
    return { observation: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), evidence: { artifactId: selected.id, name: selected.name, publishedAt: selected.publishedAt!, fileHash } }
  } finally { await handle.close() }
}
