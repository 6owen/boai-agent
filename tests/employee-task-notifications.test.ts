/*
 * [INPUT]: 员工任务结果 IPC 事件与 Sonner、导航回调。
 * [OUTPUT]: 一轮一次通知、同任务重复运行、人工状态文案与通知导航/卸载验证。
 * [POS]: 全局任务结果提示合同，不挂载桌面或调用模型。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { AppEvent } from '../packages/shared/src/ipc'
import { subscribeEmployeeTaskResults } from '../apps/electron/src/renderer/components/app-shell/employee-task-notifications'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const listeners = new Set<(event: AppEvent) => void>()
  const openTask = vi.fn()
  const unsubscribe = subscribeEmployeeTaskResults({ subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } } }, openTask)
  return { openTask, unsubscribe, emit: (event: AppEvent) => { for (const listener of listeners) listener(event) } }
}
const result: Extract<AppEvent, { type: 'employee-task:result' }> = { type: 'employee-task:result', occurrenceId: 'round-1', taskId: 'weather', employeeId: 'ds', employeeName: 'DS', title: '查询天气', status: 'in_review' }

it('notifies once per execution globally and opens the owning employee task', () => {
  const f = setup()
  f.emit({ type: 'changed' }); f.emit(result); f.emit(result)
  expect(toast.success).toHaveBeenCalledTimes(1)
  expect(toast.success).toHaveBeenCalledWith('DS · 查询天气：本轮已完成', expect.objectContaining({ id: 'employee-task:round-1', description: '结果已就绪，待你确认' }))
  const options = vi.mocked(toast.success).mock.calls[0][1]!
  const action = options.action as unknown as { onClick: () => void }
  action.onClick()
  expect(f.openTask).toHaveBeenCalledWith({ type: 'employee-tasks', id: 'ds', taskId: 'weather', requestId: expect.any(String) })
  f.emit({ ...result, occurrenceId: 'round-2' })
  expect(toast.success).toHaveBeenCalledTimes(2)
  f.unsubscribe(); f.emit({ ...result, occurrenceId: 'round-3' })
  expect(toast.success).toHaveBeenCalledTimes(2)
})

it('reports the result without claiming a manually changed card is awaiting review', () => {
  const f = setup()
  f.emit({ ...result, status: 'closed' })
  expect(vi.mocked(toast.success).mock.calls[0][1]).not.toHaveProperty('description')
  f.unsubscribe()
})
