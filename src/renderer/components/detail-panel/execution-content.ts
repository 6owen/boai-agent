/*
 * [INPUT]: BOAI执行正文分页IPC与证据身份。
 * [OUTPUT]: 固定版本逐块核读；流式正文可从最新版本重读，版本竞争不会混拼JSON或伪装正文损坏。
 * [POS]: Rovai按需呈现接线。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import type { DesktopApi } from '@shared/ipc'
import type { AgentRun } from '@shared/domain'
import type { ExecutionEvidence } from '@shared/domain/execution'

export class ExecutionContentUpdating extends Error {
  constructor() { super('执行正文仍在更新'); this.name = 'ExecutionContentUpdating' }
}

export async function readExecutionEvidence(api: DesktopApi, run: AgentRun, evidence: ExecutionEvidence, followUpdates = false): Promise<ExecutionEvidence> {
  if (!evidence.deferred) return evidence
  const minimumRevision = evidence.revision ?? 0
  // A fresh read starts at zero. Never join pages belonging to different revisions.
  for (let attempt = 0; attempt < (followUpdates ? 3 : 1); attempt++) {
    let content = '', offset = 0, revision = minimumRevision
    for (;;) {
      const page = await api.request('getExecutionContent', { conversationId: run.conversationId, runId: run.id, evidenceId: evidence.id, offset })
      if (followUpdates && offset === 0 && page.revision >= minimumRevision) revision = page.revision
      if (page.revision !== revision) break
      content += page.content
      if (page.next === undefined) {
        const full = JSON.parse(content) as ExecutionEvidence
        if (full.id !== evidence.id || full.runId !== run.id || full.conversationId !== run.conversationId || full.revision !== revision) throw new Error('执行正文与原记录不匹配')
        return full
      }
      if (page.next <= offset) throw new Error('执行正文分页位置无效')
      offset = page.next
    }
  }
  throw new ExecutionContentUpdating()
}
