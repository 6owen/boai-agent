/*
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: 文件展示不再附加版号，预览/修改沿文件身份办理。
 * [OUTPUT]: 2026-10-10 交付文件仅保留预览，不显示采用/要求修改/稍后处理栏；旧未决请求仍可核对与恢复。
 * [INPUT]: 原员工交付消息中的成果身份、当前聊天与持久采用/修订/待验收请求。
 * [OUTPUT]: 紧凑文件卡只负责预览；旧未知请求在原聊天只读核对，固定版本修订使用同一composer。
 * [POS]: 聊天交付交互，不将人工处理搬入右侧预览，不根据文件名推断新版本。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { ErrorToast } from '@/components/common/error-feedback'
import type { Artifact } from '@shared/domain'
import type { ArtifactRevisionInput } from '@shared/domain/artifacts'
import { artifactPendingKey, type ArtifactPending } from '@/components/detail-panel/artifact-state'
import { Button } from '@/components/ui/button'
import { ArtifactList } from './artifact-list'
import type { ChatArtifacts } from '../use-chat-artifacts'

export function ChatArtifactCard({ artifact, onOpenPath, onPreview }: {
  artifact: Artifact; onOpenPath(path: string): void; onPreview(artifact: Artifact): void
}) {
  return <section data-chat-artifact-id={artifact.id} aria-label={`交付文件 ${artifact.name}`} className="flex min-w-0 flex-col gap-1">
    <ArtifactList artifacts={[artifact]} onOpenPath={onOpenPath} onPreview={onPreview} />
  </section>
}

export function PendingArtifactActions({ pending, artifacts, actions, active, onRestoreRevision }: { pending: ArtifactPending; artifacts: Artifact[]; actions: ChatArtifacts; active: boolean; onRestoreRevision(input: ArtifactRevisionInput, logicalArtifactId: string): void }) {
  const key = artifactPendingKey(pending.scope, pending.conversationId, pending.logicalArtifactId)
  const labels = { revision: '修改', adoption: '采用', acceptance: '待验收' }
  return <section className="soft-card flex flex-col gap-2 p-3" data-artifact-pending-key={key} aria-label="未决成果请求">
    {(['revision', 'adoption', 'acceptance'] as const).map(kind => {
      const request = pending[kind]
      if (!request) return null
      const artifact = artifacts.find(value => value.id === request.input.artifactId)
      const label = labels[kind], busy = !active || actions.busy.has(key) || request.status === 'pending'
      return <div key={kind} className="flex flex-col gap-1" role="region" aria-label={`未决${label}请求`}>
        <strong>{label} · {artifact?.name ?? '原文件已不可用'}</strong>
        {kind === 'revision' && <p className="whitespace-pre-wrap break-words">{pending.revision!.input.content}</p>}
        <p className="field-hint">{request.status === 'not_accepted' ? '已确认原请求尚未受理。' : '保留原文件和请求，核对后继续。'}</p>
        <div className="button-row flex-wrap"><Button size="sm" variant="secondary" disabled={busy} onClick={() => void actions.execute(pending, kind)}>{request.status === 'unknown' ? `核对${label}结果` : request.status === 'pending' ? '正在提交…' : `重试原${label}请求`}</Button>
        {request.status === 'not_accepted' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (actions.discard(pending, kind) && kind === 'revision') onRestoreRevision(pending.revision!.input, pending.logicalArtifactId) }}>{kind === 'revision' ? '放弃未受理请求并编辑文件' : `放弃未受理${label}`}</Button>}</div>
      </div>
    })}
    {actions.errors[key] && <ErrorToast>{actions.errors[key]}</ErrorToast>}
  </section>
}
