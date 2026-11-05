/*
 * [INPUT]: 宿主已提交的员工任务本轮结果事件与员工任务导航入口。
 * [OUTPUT]: 全局 Sonner 结果通知，按执行去重并直接打开所属员工的任务会话；不回放历史。
 * [POS]: AppShell 员工任务通知订阅。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import type { EmployeeTaskTarget } from './employee-task-navigation'

export function subscribeEmployeeTaskResults(api: Pick<DesktopApi, 'subscribe'>, openTask: (target: EmployeeTaskTarget) => void) {
  const seen = new Set<string>()
  return api.subscribe(event => {
    if (event.type !== 'employee-task:result' || seen.has(event.occurrenceId)) return
    seen.add(event.occurrenceId)
    toast.success(`${event.employeeName} · ${event.title}：本轮已完成`, {
      id: `employee-task:${event.occurrenceId}`,
      ...(event.status === 'in_review' ? { description: '结果已就绪，待你确认' } : {}),
      action: { label: '查看', onClick: () => openTask({ type: 'employee-tasks', id: event.employeeId, taskId: event.taskId, requestId: crypto.randomUUID() }) },
    })
  })
}
