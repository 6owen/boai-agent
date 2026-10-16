/*
 * [INPUT]: 计划创建数据、已保存计划投影与共用bobo创建会话。
 * [OUTPUT]: 定时任务会话与真实保存卡片，发送和未知回执沿CreationAssistant。
 * [POS]: 计划页业务投影，不另启草稿模型。
 * [PROTOCOL]: 变化同步Header与.folder.md。
 */
import type { AutomationDefinition, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { CreationAssistant } from '@/components/common/creation-assistant'
import { Button } from '@/components/ui/button'
import { Clock } from '@/components/icons'
import { scheduleSummary } from './schedule-presentation'

export function AutomationAssistant({ api, snapshot, active, definitions, onOpen }: { api: DesktopApi; snapshot: Snapshot; active: boolean; definitions: AutomationDefinition[]; onOpen(id: string): void }) {
  return <CreationAssistant api={api} snapshot={snapshot} active={active} kind="automation" renderResults={conversationId => definitions.filter(plan => conversationId && plan.creationSource?.conversationId === conversationId).map(plan => <div className="schedule-chat-plan" key={plan.id}><Clock /><div><strong>{plan.name}</strong><p>{scheduleSummary(plan)} · {snapshot.agents.find(a => a.id === plan.employeeIds?.[0])?.name ?? '员工'}</p></div><Button variant="secondary" size="sm" onClick={() => onOpen(plan.id)}>打开</Button></div>)} />
}
