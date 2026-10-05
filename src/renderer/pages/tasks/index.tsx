/*
 * [INPUT]: Shell页面活跃状态、应用快照与任务只读导航回调。
 * [OUTPUT]: 全局真实Work总览；看板/列表共用会话和员工任务组件，不复用自动化计划列表。
 * [POS]: 任务主导航页面，业务处理回原员工聊天。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { WorkView, type WorkViewProps } from '@/components/work-views/work-view'
export function TasksPage(props: WorkViewProps) {
  return <main hidden={!props.active} className={props.active ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col' : 'hidden'} aria-label="全局任务"><div className="flex min-h-13 items-center px-4"><h2 className="m-0 text-sm font-medium">任务</h2></div><WorkView {...props} /></main>
}
