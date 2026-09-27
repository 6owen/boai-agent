/*
 * [INPUT]: 成员投递与轮次领域类型。
 * [OUTPUT]: 会话状态文案、草稿类型与展示辅助函数。
 * [POS]: src/renderer/pages/conversations/presentation.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AgentDelivery, TurnStatus } from '@shared/domain'

export const runLabels = { queued: '排队中', running: '正在处理', waiting_approval: '等待授权', completed: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' }
export const deliveryLabels: Record<AgentDelivery['status'], string> = { pending: '待处理', evaluating: '正在判断', ready: '等待发言', waiting: '等待前序结果', passed: '本次不发言', responding: '正在回复', completed: '已处理', failed: '处理失败', cancelled: '已取消', interrupted: '已中断', skipped: '未参与' }
export const turnLabels: Record<TurnStatus, string> = { queued: '下一轮排队中', evaluating: '成员正在判断', responding: '成员正在回复', executing: '正在执行任务', waiting_user: '等待补充信息', completed: '本轮已完成', cancelled: '本轮已停止', failed: '本轮失败', interrupted: '本轮中断', budget_exhausted: '本轮已达到限额' }
export const liveTurn = (status: TurnStatus) => ['queued', 'evaluating', 'responding', 'executing'].includes(status)
export interface ChatDraft { text: string; mentionIds: string[]; replyId?: string }

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

