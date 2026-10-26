/*
 * [INPUT]: 共用计划频率、时区与开始日期。
 * [OUTPUT]: 定时任务列表、计划卡片及员工只读列表的统一日程摘要。
 * [POS]: schedules 纯展示投影。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { AutomationInput } from '@boai/shared/domain'
export function scheduleSummary(d: AutomationInput) {
  if (d.frequency === 'manual') return '手动执行'
  if (d.frequency === 'hourly') return `每小时 ${Number(d.time.slice(-2))} 分`
  if (d.frequency === 'monthly') return `每月 ${d.dayOfMonth ?? Number(d.startsOn?.slice(8) ?? 1)} 日 ${d.time}`
  if (d.frequency === 'daily') return `每天 ${d.time}`
  const days = d.daysOfWeek ?? [d.weekday]
  return `${JSON.stringify(days) === '[1,2,3,4,5]' ? '工作日' : `每周${days.map(day => ['日', '一', '二', '三', '四', '五', '六'][day]).join('、')}`} ${d.time}`
}
