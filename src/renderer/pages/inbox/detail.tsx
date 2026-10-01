/*
 * [INPUT]: 固定原事项 ID、实时权威详情与原审批/问题 API、精确会话/工作/执行/成果/自动化导航。
 * [OUTPUT]: 独立标签的只读来源核对、原审批动作与定向补充；来源解决/失效显性显示，隐藏不读取，旧动作不绕过门禁。
 * [POS]: inbox 详情数据边界；不建立独立完成状态，不自动执行失败工作、采用文件或补充自动化。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { InboxItem } from '@shared/domain/inbox'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { inboxKindLabels } from './index'
import { InboxQuestionReply } from './question-reply'
import type { InboxQuestionRequest } from './question-state'
const workLabels: Record<NonNullable<InboxItem['work']>['status'], string> = { ready: '等待接续', running: '正在处理', delivered: '已交付', waiting: '等待输入或依赖', blocked: '需要处理', failed: '执行失败', cancelled: '已停止', interrupted: '已中断' }

export function InboxDetail({ api, id, active, pending, storageError, onPending, onSubmitted, onConversation, onWork, onTrace, onOccurrence, onArtifact }: {
  api: DesktopApi; id: string; active: boolean; pending?: InboxQuestionRequest; storageError: string
  onPending(value?: InboxQuestionRequest, expectedRequestId?: string): boolean; onSubmitted(): Promise<void>
  onConversation(id: string, messageId?: string): void; onWork(conversationId: string, workId: string): void
  onTrace(item: InboxItem): void; onOccurrence(id: string): void; onArtifact(item: InboxItem): void
}) {
  const [item, setItem] = useState<InboxItem | null>(), [loading, setLoading] = useState(false), [readError, setReadError] = useState(''), [revision, setRevision] = useState(0)
  const { busy, error, run } = useMutation()
  useEffect(() => {
    if (!active) return
    let current = true, token = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const sequence = ++token; setLoading(true); setReadError(''); setItem(undefined)
      try { const result = await api.request('getInboxItem', { id }); if (current && sequence === token) { if (result && result.id !== id) throw new Error('待处理来源身份不一致，请重新核对。'); setItem(result) } }
      catch (cause) { if (current && sequence === token) { setItem(undefined); setReadError(errorText(cause)) } }
      finally { if (current && sequence === token) setLoading(false) }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if (event.type !== 'changed' && event.type !== 'conversation:cleared' && event.type !== 'conversation:deleted') return
      token++; setItem(undefined)
      if (!timer) timer = setTimeout(() => { timer = undefined; if (current) void load() }, 120)
    })
    return () => { current = false; unsubscribe(); clearTimeout(timer) }
  }, [api, id, active, revision])
  const submitted = () => { setRevision(value => value + 1); void onSubmitted().catch(cause => setReadError(`操作已提交，列表刷新未完成：${errorText(cause)}`)) }
  const approve = (approved: boolean) => void run(async () => {
    const latest = await api.request('getInboxItem', { id })
    if (!latest || latest.kind !== 'approval' || !latest.approvalId || latest.approvalId !== item?.approvalId) { submitted(); throw new Error('原审批已处理或来源变化，请核对当前记录。') }
    await api.request('approve', { id: latest.approvalId, approved }); submitted()
  })
  return <div className="detail-section flex min-h-0 flex-1 flex-col gap-3" data-inbox-id={id}>
    {error && <Banner>{error}</Banner>}{readError && <><Banner>{readError}</Banner><Button variant="secondary" size="sm" onClick={() => setRevision(value => value + 1)}>重新核对事项</Button></>}
    {loading && <Loading>正在核对原事项…</Loading>}
    {item === null && <p role="status" className="field-hint">原事项已处理或不再需要介入。保留此标签以便核对，不会自动打开下一项。</p>}
    {item && <><h3>{inboxKindLabels[item.kind]}</h3><p className="whitespace-pre-wrap break-words">{item.summary}</p><p className="field-hint">{item.conversationTitle}{item.agentName ? ` · ${item.agentName}` : ''} · {new Date(item.time).toLocaleString('zh-CN')}</p>{item.reason && <p className="whitespace-pre-wrap">{item.reason}</p>}
      {item.question && <section className="soft-card p-3" aria-label="原问题"><strong>原问题</strong><p className="whitespace-pre-wrap">{item.question.content}</p>{!item.question.canReply && <p className="field-hint">{item.question.unavailableReason ?? '当前不能直接补充，请核对原来源。'}</p>}</section>}
      {item.approval && <section className="soft-card flex flex-col gap-2 p-3" aria-label="原命令审批"><strong>{item.agentName ?? '员工'} 申请运行命令</strong><pre className="whitespace-pre-wrap break-all">{item.approval.command}</pre><p className="field-hint">工作目录：{item.approval.cwd}</p><p className="field-hint">命令使用应用的主机权限，请核对实际操作范围。</p><div className="button-row"><Button variant="secondary" size="sm" disabled={busy || !active} onClick={() => approve(false)}>拒绝</Button><Button size="sm" disabled={busy || !active} onClick={() => approve(true)}>允许这次执行</Button></div></section>}
      {item.work && <p className="field-hint">原工作版本 {item.work.version} · {workLabels[item.work.status]}</p>}
      {item.artifact && <><p className="field-hint">明确成果：第 {item.artifact.contentVersion} 版</p><p className="resource-path break-all">{item.artifact.contentHash}</p><Button size="sm" variant="secondary" onClick={() => onArtifact(item)}>查看此版本并验收</Button></>}
      <div className="button-row flex-wrap"><Button variant="link" size="sm" onClick={() => onConversation(item.conversationId, item.question?.messageId ?? item.messageId)}>{item.question || item.messageId ? '定位原消息' : '打开来源会话'}</Button>{item.workId && <Button variant="link" size="sm" onClick={() => onWork(item.conversationId, item.workId!)}>定位原工作</Button>}{item.runId && <Button variant="link" size="sm" onClick={() => onTrace(item)}>查看原执行过程</Button>}{item.occurrenceId && <Button variant="secondary" size="sm" onClick={() => onOccurrence(item.occurrenceId!)}>{item.kind === 'question' ? '查看本次运行并补充' : '查看本次运行'}</Button>}</div>
    </>}
    <InboxQuestionReply api={api} id={id} item={item ?? undefined} active={active} pending={pending} storageError={storageError} onPending={onPending} onSubmitted={submitted} />
  </div>
}
