/*
 * [INPUT]: 工作结果、会话产物领域类型与统一 UI 基础组件。
 * [OUTPUT]: 群聊按真实父子工作呈现目标、证据状态与产物；单群成果共用固定版本应用内预览/外开入口，保留单聊进度、依赖、停止和接续信息。
 * [POS]: src/renderer/pages/conversations/-components/activity-detail.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import type { Artifact, ConversationDetail, Snapshot, WorkItem } from '@shared/domain'
import { Avatar } from '@/components/common/index'
import { workDisplayState } from '../group-chat'
import { ArtifactList } from './artifact-list'

import { workDispositionLabels } from '../presentation'
const workStatusLabels: Record<WorkItem['status'], string> = { ready: '等待接续', running: '正在处理', delivered: '已交付', waiting: '等待输入或依赖', blocked: '需要处理', failed: '执行失败', cancelled: '已停止', interrupted: '已中断，需明确恢复' }
export function ActivityDetail({ detail, snapshot, busy, onOpenPath, onPreviewArtifact, onStopWork }: { detail: ConversationDetail; snapshot: Snapshot; busy: boolean; onOpenPath: (path: string) => void; onPreviewArtifact?: (artifact: Artifact) => void; onStopWork: (id: string) => void }) {
  if (detail.conversation.kind === 'group') {
    const works = detail.workItems ?? [], visited = new Set<string>()
    const renderWork = (work: WorkItem, depth = 0): React.ReactNode => {
      if (visited.has(work.id)) return null
      visited.add(work.id)
      const owner = snapshot.agents.find(agent => agent.id === work.ownerAgentId)
      const state = workDisplayState(work, detail, snapshot.approvals)
      return <div className={depth ? 'work-child' : 'work-family'} key={work.id}>
        <section className="group-work" data-work-id={work.id}>
          {!depth && <p className="work-eyebrow">工作目标</p>}
          <div className="work-title"><strong>{work.deliverable}</strong><span className="work-state" data-tone={state.tone}>{state.label}</span></div>
          <div className="work-owner"><Avatar name={owner?.name ?? '已移除员工'} seed={work.ownerAgentId} avatar={owner?.avatar} color={owner?.color} small /><span>{owner?.name ?? '已移除员工'}</span>{owner?.role && <small>{owner.role}</small>}</div>
          <details className="work-context" open={work.status !== 'delivered'}><summary>工作详情</summary>
            {work.parentWorkId && <p>所属工作：{works.find(parent => parent.id === work.parentWorkId)?.deliverable ?? work.parentWorkId}</p>}
            {!!work.requiredResults.length && <p>等待结果：{work.requiredResults.map(result => `${works.find(item => item.id === result.workId)?.deliverable ?? result.workId}（第 ${result.resultVersion} 版起）`).join('、')}</p>}
            {work.nextStep && <p>接续步骤：{work.nextStep}</p>}
            {work.outcome && <><p>本次工作结果：{workDispositionLabels[work.outcome.disposition]}</p><p>{work.outcome.summary}</p></>}
            {detail.workWakes?.filter(wake => wake.workId === work.id && (wake.kind === 'blocked' || wake.status === 'interrupted')).slice(-1).map(wake => <p className="historical-note" key={wake.id}>{wake.reason ?? '接续中断，请核对已有结果后发出明确的新请求。'}</p>)}
          </details>
          {['ready', 'running', 'waiting', 'blocked'].includes(work.status) && <Button className="work-stop" variant="ghost" size="sm" disabled={busy} onClick={() => onStopWork(work.id)}>停止此工作及子工作</Button>}
        </section>
        {works.filter(child => child.parentWorkId === work.id).map(child => renderWork(child, depth + 1))}
      </div>
    }
    // Orphaned or cyclic historical records remain visible without inventing a parent.
    const families = works.filter(work => !work.parentWorkId || !works.some(parent => parent.id === work.parentWorkId)).map(work => renderWork(work))
    const remaining = works.filter(work => !visited.has(work.id)).map(work => renderWork(work))
    return <div className="detail-section activity-detail group-activity">
      <div className="activity-section-heading"><h3>工作进度</h3><small>{works.length} 项工作</small></div>
      {families}{remaining}
      {!works.length && <p className="field-hint">暂无工作任务。明确的工作目标会显示在这里。</p>}
      <div className="activity-section-heading artifacts-heading"><h3>会话全部产物</h3><small>{detail.artifacts.length}</small></div>
      <ArtifactList artifacts={detail.artifacts} onOpenPath={onOpenPath} onPreview={onPreviewArtifact} dates />
      {!detail.artifacts.length && <p className="field-hint">生成并发布的文件将在这里显示。</p>}
    </div>
  }
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
    <h4>会话全部产物 · {detail.artifacts.length}</h4><ArtifactList artifacts={detail.artifacts} onOpenPath={onOpenPath} onPreview={onPreviewArtifact} dates />{!detail.artifacts.length && <p className="field-hint">生成并发布的文件将在这里显示。</p>}
  </div>
}
