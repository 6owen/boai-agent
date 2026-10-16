/*
 * [INPUT]: Shell 页面活跃状态与右侧任务详情。
 * [OUTPUT]: 全局及会话右侧任务共用空面板占位，等待任务功能重构，不读取聊天派生 Work。
 * [POS]: 任务主页面与右侧任务占位；现有定时任务仍由 schedules 管理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { IllustratedEmpty } from '@/components/common/illustrated-empty'

export function TasksPlaceholder() {
  return <section className="flex h-full min-h-0 flex-1 flex-col" aria-label="任务面板"><IllustratedEmpty kind="schedules" title="任务功能即将更新" /></section>
}

export function TasksPage({ active }: { active: boolean }) {
  return <main hidden={!active} className={active ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col' : 'hidden'} aria-label="全局任务"><div className="flex min-h-13 items-center px-4"><h2 className="m-0 text-sm font-medium">任务</h2></div><TasksPlaceholder /></main>
}
