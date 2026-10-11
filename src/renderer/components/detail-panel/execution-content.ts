/*
 * [INPUT]: BOAI执行正文分页IPC与固定证据版本。
 * [OUTPUT]: 完整正文的逐块核读，不混合正在更新的版本。
 * [POS]: Rovai按需呈现接线。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import type { DesktopApi } from '@shared/ipc'
import type { AgentRun } from '@shared/domain'
import type { ExecutionEvidence } from '@shared/domain/execution'

export async function readExecutionEvidence(api: DesktopApi, run: AgentRun, evidence: ExecutionEvidence): Promise<ExecutionEvidence> {
  if (!evidence.deferred) return evidence
  let content = '', offset = 0
  for (;;) {
    const page = await api.request('getExecutionContent', { conversationId: run.conversationId, runId: run.id, evidenceId: evidence.id, offset })
    if (page.revision !== evidence.revision) throw new Error('内容仍在更新，请读取最新执行记录')
    content += page.content
    if (page.next === undefined) return JSON.parse(content) as ExecutionEvidence
    offset = page.next
  }
}

