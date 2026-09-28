/*
 * [INPUT]: 工作结果、会话产物领域类型与统一 UI 基础组件。
 * [OUTPUT]: 仅呈现真实工作目标、负责人、交付/依赖状态、停止工作树及会话产物。
 * [POS]: src/renderer/pages/conversations/-components/activity-detail.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { FileText, FolderOpen } from '@/components/icons/index'
import type { ConversationDetail, Snapshot, WorkItem } from '@shared/domain'
import { sizeText } from '@/components/common/index'

import { workDispositionLabels } from '../presentation'
const workStatusLabels: Record<WorkItem['status'], string> = { ready: '等待接续', running: '正在处理', delivered: '已交付', waiting: '等待输入或依赖', blocked: '需要处理', failed: '执行失败', cancelled: '已停止', interrupted: '已中断，需明确恢复' }
export function ActivityDetail({ detail, snapshot, busy, onOpenPath, onStopWork }: { detail: ConversationDetail; snapshot: Snapshot; busy: boolean; onOpenPath: (path: string) => void; onStopWork: (id: string) => void }) {
  return <div className="detail-section activity-detail">
    {!!detail.workItems?.length && <details className="round-history" open><summary>工作进度 · {detail.workItems.length}</summary>{detail.workItems.map(work => <section className="run-card soft-card" key={work.id} data-work-id={work.id}>
      <strong>{work.deliverable}</strong><p className="field-hint">负责人：{snapshot.agents.find(agent => agent.id === work.ownerAgentId)?.name ?? '已移除员工'} · {workStatusLabels[work.status]}</p>
      {work.parentWorkId && <p className="field-hint">所属工作：{detail.workItems?.find(parent => parent.id === work.parentWorkId)?.deliverable ?? work.parentWorkId}</p>}
      {work.requiredResults.length > 0 && <p className="field-hint">等待结果：{work.requiredResults.map(result => `${detail.workItems?.find(item => item.id === result.workId)?.deliverable ?? result.workId}（第 ${result.resultVersion} 版起）`).join('、')}</p>}
      {work.nextStep && <p className="field-hint">接续步骤：{work.nextStep}</p>}
      {work.outcome && <><p className="field-hint">本次工作结果：{workDispositionLabels[work.outcome.disposition]}</p><p className="field-hint">{work.outcome.summary}</p></>}
      {detail.workWakes?.filter(wake => wake.workId === work.id && (wake.kind === 'blocked' || wake.status === 'interrupted')).slice(-1).map(wake => <p className="historical-note" key={wake.id}>{wake.reason ?? '接续中断，请核对已有结果后发出明确的新请求。'}</p>)}
      {['ready', 'running', 'waiting', 'blocked'].includes(work.status) && <Button variant="secondary" size="sm" disabled={busy} onClick={() => onStopWork(work.id)}>停止此工作及子工作</Button>}
    </section>)}</details>}
    {!detail.workItems?.length && <p className="field-hint">暂无工作任务。明确的工作目标会显示在这里。</p>}
    <h4>会话全部产物 · {detail.artifacts.length}</h4>{detail.artifacts.map(artifact => <Button variant="surface" size="content" className="artifact-item" key={artifact.path} onClick={() => onOpenPath(artifact.path)}><FileText size={18} /><span><strong>{artifact.name}</strong><small>{sizeText(artifact.size)}</small></span><FolderOpen size={15} /></Button>)}{!detail.artifacts.length && <p className="field-hint">生成并发布的文件将在这里显示。</p>}
  </div>
}
