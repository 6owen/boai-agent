/*
 * [OUTPUT]: 提示词标签携带所选正文快照，与成员/固定技能文件引用分开；发送正文展开沿原消息事务。
 * [OUTPUT]: 行内技能/文件标签保留固定来源，普通成员点名仍单独发送。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 内部讨论草稿冻结渠道原消息引用，普通草稿/未知发送沿原隔离。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 当前网页引用附于原消息草稿；固定实例/页面版本随发送回执持久，标题URL只展示宿主核验来源，原附件工具栏保持。
 * [INPUT]: 成员投递、轮次与工作结果领域类型。
 * [OUTPUT]: 会话/工作结果文案、正文内成员标签/材料草稿和明确原问题/成果修订关联、普通/ACP稳定发送请求和未知回执状态的草稿合同及展示辅助函数。
 * [POS]: src/renderer/pages/conversations/presentation.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AgentDelivery, TurnStatus, WorkDisposition } from '@shared/domain'
import type { MaterialSelection } from '@shared/domain/materials'
import type { MaterialDraftItem } from './-components/material-draft'
import type { ChatQuestionTarget } from './question-state'
import type { ChatArtifactRevisionTarget } from './use-chat-artifacts'

export const runLabels = { queued: '排队中', running: '正在处理', waiting_approval: '等待授权', completed: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' }
export const workDispositionLabels: Record<WorkDisposition, string> = { delivered: '已交付', progress: '已有进展', waiting: '等待输入或依赖', blocked: '需要处理', no_progress: '尚无交付结论' }
export const deliveryLabels: Record<AgentDelivery['status'], string> = { pending: '待处理', evaluating: '正在判断', ready: '等待发言', waiting: '等待前序结果', passed: '本次不发言', responding: '正在回复', completed: '已处理', failed: '处理失败', cancelled: '已取消', interrupted: '已中断', skipped: '未参与' }
export const turnLabels: Record<TurnStatus, string> = { queued: '下一轮排队中', evaluating: '成员正在判断', responding: '成员正在回复', executing: '正在执行任务', waiting_user: '等待补充信息', completed: '本轮已完成', cancelled: '本轮已停止', failed: '本轮失败', interrupted: '本轮中断', budget_exhausted: '本轮已达到限额' }
export const liveTurn = (status: TurnStatus) => ['queued', 'evaluating', 'responding', 'executing'].includes(status)
export interface DraftMention { resource?: import('@shared/domain/composer-references').ComposerReference; prompt?: import('@shared/domain/prompt-templates').PromptTemplateReference; id: string; label: string; start: number; end: number }
export interface ChatDraft {
  channelReference?: import('@shared/domain/channels').ChannelMessageReference
  browserReference?: import('@shared/ipc/browser').BrowserPageReference
  text: string; mentionIds: string[]; mentions?: DraftMention[]; replyId?: string
  questionReply?: ChatQuestionTarget
  artifactRevision?: ChatArtifactRevisionTarget
  materialEdit?: { reference: import('@shared/domain/materials').MaterialReadRef; name: string; targetAgentId: string; annotation?: import('@shared/domain/file-edit').FileEditAnnotation }
  materials?: MaterialDraftItem[]
  submission?: {
    kind?: 'external'
    requestId: string; status: 'pending' | 'unknown' | 'not_accepted'; fingerprint: string
    input: { composerReferences?: import('@shared/domain/composer-references').ComposerReference[]; channelReference?: import('@shared/domain/channels').ChannelMessageReference; materialReference?: import('@shared/domain/materials').MaterialReadRef; browserReference?: Pick<import('@shared/ipc/browser').BrowserPageReference,'instanceId'|'pageVersion'>; content: string; mentionIds: string[]; materialSelections?: MaterialSelection[]; replyToMessageId?: string; stopPrevious?: boolean }
  }
}

export function latestMemberDeliveries(deliveries: AgentDelivery[]) {
  const latest = new Map<string, AgentDelivery>()
  for (const delivery of deliveries) {
    const previous = latest.get(delivery.agentId)
    if (!previous || delivery.observedThroughSequence > previous.observedThroughSequence ||
      (delivery.observedThroughSequence === previous.observedThroughSequence && delivery.updatedAt >= previous.updatedAt)) latest.set(delivery.agentId, delivery)
  }
  return latest
}
export function failureSummary(error: string) {
  if (/api.?key|unauthorized|authentication|401|403/i.test(error)) return '模型连接认证失败，请检查连接设置。'
  if (/rate.?limit|quota|429|insufficient/i.test(error)) return '模型服务暂时受限，请稍后重试或检查额度。'
  if (/timeout|timed.?out|超时/i.test(error)) return '模型响应超时，可以重新尝试。'
  if (/JSON|schema|structured|parse|NoObjectGenerated|Type validation/i.test(error)) return '模型返回的内容不符合要求，可以重新尝试。'
  if (/ECONN|ENOTFOUND|fetch failed|network/i.test(error)) return '暂时无法连接模型服务，请检查连接后重试。'
  if (error.length < 160 && /[\u3400-\u9fff]/.test(error) && !/[{}\n]/.test(error)) return error
  return '处理过程中出现问题，请在运行记录中查看详情或重试。'
}
