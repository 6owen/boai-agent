/*
 * [INPUT]: 打开、激活、排序、关闭与显隐动作，带稳定身份的详情目标。
 * [OUTPUT]: 保序去重的详情标签状态；移动保留选中项，关闭选中项后选择相邻标签。
 * [POS]: detail-panel 的纯状态转换，不依赖页面路由或持久化。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export type DetailTarget = { type: 'agent'; id: string; conversationId?: string } | { type: 'group' | 'activity' | 'resource'; id: string } | { type: 'schedule' }
export interface DetailTab { key: string; target: DetailTarget }
export interface DetailTabsState { tabs: DetailTab[]; activeKey: string | null; shown: boolean }
export type DetailTabsAction = { type: 'open'; target: DetailTarget } | { type: 'select' | 'close'; key: string } | { type: 'visibility'; shown: boolean } | { type: 'move'; key: string; targetKey: string; placement: 'before' | 'after' }
export const emptyDetailTabs: DetailTabsState = { tabs: [], activeKey: null, shown: false }
export function detailTargetKey(target: DetailTarget): string {
  return target.type === 'schedule' ? 'schedule' : `${target.type}:${target.id}${target.type === 'agent' ? `:${target.conversationId ?? ''}` : ''}`
}
export function detailTabsReducer(state: DetailTabsState, action: DetailTabsAction): DetailTabsState {
  if (action.type === 'visibility') return { ...state, shown: action.shown && state.tabs.length > 0 }
  if (action.type === 'open') {
    const key = detailTargetKey(action.target)
    return { tabs: state.tabs.some(tab => tab.key === key) ? state.tabs : [...state.tabs, { key, target: action.target }], activeKey: key, shown: true }
  }
  const index = state.tabs.findIndex(tab => tab.key === action.key)
  if (index < 0) return state
  if (action.type === 'move') {
    if (action.key === action.targetKey || !state.tabs.some(tab => tab.key === action.targetKey)) return state
    const tabs = state.tabs.filter(tab => tab.key !== action.key)
    const destination = tabs.findIndex(tab => tab.key === action.targetKey) + (action.placement === 'after' ? 1 : 0)
    tabs.splice(destination, 0, state.tabs[index]!)
    return { ...state, tabs }
  }
  if (action.type === 'select') return { ...state, activeKey: action.key, shown: true }
  const tabs = state.tabs.filter(tab => tab.key !== action.key)
  return { tabs, activeKey: state.activeKey === action.key ? tabs[Math.min(index, tabs.length - 1)]?.key ?? null : state.activeKey, shown: state.shown && tabs.length > 0 }
}
