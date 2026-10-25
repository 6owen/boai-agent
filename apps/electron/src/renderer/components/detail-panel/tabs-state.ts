/*
 * [OUTPUT]: 旧terminal目标仅保留类型兼容，拒绝重建已移除的交互终端标签。
 * [OUTPUT]: 会话终端与预览复用同一右侧标签，明确重开切换目标视图。
 * [OUTPUT]: 已发布知识引用按宿主实际读取身份打开原全局预览；明确重开更新定位，失效不跳到新内容。
 * [OUTPUT]: 员工知识预览标签保留员工身份，旧共享资源不串到其他员工的授权范围。
 * [OUTPUT]: 员工文件标签可明确切至知识视图，沿同一标签身份复用，不新增知识库导航。
 * [OUTPUT]: 通讯录固定Run的过程标签按conversationId/runId去重，与普通会话历史标签分开。
 * [OUTPUT]: 单次执行删除事件关闭所有页面对应的只读执行面板，其他标签与草稿保持。
 * [OUTPUT]: 数据源按固定ID复用右侧标签，明确重开刷新请求，页面与其他类型标签独立。
 * [OUTPUT]: 定时任务执行记录按occurrence身份复用当前页面右侧标签，不改变主区计划或搜索。
 * [OUTPUT]: 本机技能按稳定id复用右侧标签，再次打开更新读取请求；目录页面保持。
 * [OUTPUT]: 任务/文件按员工或会话独立去重标签，与主聊天并行；复用右侧显隐/关闭/跨页隔离状态。
 * [OUTPUT]: 渠道明确发送携带原内容身份，编辑草稿按具体消息/文件隔离。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 内部讨论/明确渠道发布/文件汇总均为同一渠道标签内的替换视图，不增加嵌套容器。
 * [OUTPUT]: 渠道根标签只持有一个非渠道详情视图；连续打开替换该视图，返回清空，不递归嵌套或新增同级标签。
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [OUTPUT]: 员工渠道按员工身份复用右侧标签，明确会话/消息定位更新目标；主聊天路由独立。
 * [INPUT]: sidebar 页面作用域、打开/激活/排序/关闭与显隐动作，带稳定身份的详情目标。
 * [OUTPUT]: 聊天原问题不创建独立事项详情标签，明确 workId/requestId 重开更新工作定位；成果按聊天/逻辑家族复用标签，仅明确打开版本更新所审身份/hash；材料按会话/稳定材料身份复用独立标签，重开更新版本与来源行定位；员工配置请求复用同一标签并更新内部导航请求，不重建编辑器；定时任务创建模式复用同一新建标签；每个 sidebar 页面独立的标签/选中/显隐状态与命名空间；技能更新使用唯一常驻详情标签；商店标签按提供商和条目身份去重；执行过程标签按会话/轮次/员工去重，图标重开重新定位；移动保留选中项，关闭选中项后选择相邻标签。
 * [POS]: detail-panel 的纯状态转换，不依赖页面路由或持久化。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { SkillMarketplaceProvider } from '@boai/shared/domain/skill-marketplace'

export type DetailTarget = { type: 'workspace'; id: string; employeeId: string; view: 'terminal' | 'preview' } | { type: 'automation-occurrence'; id: string } | { type: 'source'; id: string; name: string; requestId: string } | { type: 'local-skill'; id: string; name: string; requestId: string } | { type: 'files' | 'tasks'; owner: 'employee' | 'conversation'; id: string; view?: 'files' | 'knowledge'; requestId?: string } | { type: 'channel-discussion'; id: string; agentId: string; requestId: string; focusMessage?: { id: string; requestId: string } } | { type: 'channel-publish'; id: string; originMessageId?: string; sourceMessageId?: string; content?: string; artifact?: import('@boai/shared/domain/channels').ChannelArtifactReference; requestId: string } | { type: 'channel-files'; id: string } | { type: 'channels'; id: string; conversationId?: string; requestId: string; focusMessage?: { id: string; requestId: string }; focusApproval?: { id: string; requestId: string } } | { type: 'agent'; id: string; conversationId?: string; configurationRequest?: string } | { type: 'group'; id: string } | { type: 'resource'; id: string; agentId?: string; citation?: import('@boai/shared/domain/knowledge').KnowledgeCitationInput & { requestId: string } } | { type: 'activity'; id: string; workId?: string; requestId?: string } | { type: 'artifact'; id: string; logicalArtifactId: string; conversationId: string; name: string; contentHash: string; contentVersion?: number; requestId: string } | { type: 'material'; id: string; conversationId: string; name: string; revision: number; line?: number; requestId: string } | { type: 'trace'; runId?: string; title?: string; requestId?: string; id: string; messageId?: string; turnId?: string; agentId?: string } | { type: 'marketplace'; provider: SkillMarketplaceProvider; id: string; name: string } | { type: 'automation-editor'; id?: string; name?: string; mode?: 'manual' | 'assistant' | 'monitor' } | { type: 'schedule' } | { type: 'skill-updates' }
export interface DetailTab { key: string; target: DetailTarget; detail?: Exclude<DetailTarget, { type: 'channels' }> }
export interface DetailTabsState { tabs: DetailTab[]; activeKey: string | null; shown: boolean }
export type DetailTabsAction = { type: 'open'; target: DetailTarget; withinKey?: string } | { type: 'select' | 'close' | 'back'; key: string } | { type: 'visibility'; shown: boolean } | { type: 'move'; key: string; targetKey: string; placement: 'before' | 'after' }
export const emptyDetailTabs: DetailTabsState = { tabs: [], activeKey: null, shown: false }
export function detailTargetKey(target: DetailTarget): string {
  if (target.type === 'resource' && target.agentId) return `resource:${target.id}:${target.agentId}`
  if (target.type === 'files' || target.type === 'tasks') return `${target.type}:${target.owner}:${target.id}`
  if (target.type === 'skill-updates') return 'skill-updates'
  if (target.type === 'automation-editor') return `automation-editor:${target.id ?? 'new'}`
  if (target.type === 'marketplace') return `marketplace:${target.provider}:${target.id}`
  if (target.type === 'trace') return `trace:${target.id}${target.runId ? `:${target.runId}` : ''}`
  if (target.type === 'material') return `material:${target.conversationId}:${target.id}`
  if (target.type === 'artifact') return `artifact:${target.conversationId}:${target.logicalArtifactId}`
  return target.type === 'schedule' ? 'schedule' : `${target.type}:${target.id}${target.type === 'agent' ? `:${target.conversationId ?? ''}` : ''}`
}
export function detailTabsReducer(state: DetailTabsState, action: DetailTabsAction, scope?: string): DetailTabsState {
  if (action.type === 'visibility') return { ...state, shown: action.shown && state.tabs.length > 0 }
  if (action.type === 'open') {
    if (action.target.type === 'workspace' && action.target.view === 'terminal') return state
    if (action.withinKey) {
      const owner = state.tabs.find(tab => tab.key === action.withinKey)
      if (owner?.target.type !== 'channels' || action.target.type === 'channels') return state
      const detail = action.target
      return { ...state, tabs: state.tabs.map(tab => tab === owner ? { ...tab, detail } : tab), activeKey: owner.key, shown: true }
    }
    const key = `${scope ? `${scope}/` : ''}${detailTargetKey(action.target)}`
    return { tabs: state.tabs.some(tab => tab.key === key) ? (action.target.type === 'workspace' || action.target.type === 'resource' || action.target.type === 'channels' || action.target.type === 'local-skill' || action.target.type === 'source' || action.target.type === 'artifact' || action.target.type === 'material' || action.target.type === 'trace' || action.target.type === 'automation-editor' || action.target.type === 'activity' && action.target.workId || action.target.type === 'agent' && action.target.configurationRequest ? state.tabs.map(tab => tab.key === key ? { key: tab.key, target: action.target } : tab) : state.tabs) : [...state.tabs, { key, target: action.target }], activeKey: key, shown: true }
  }
  const index = state.tabs.findIndex(tab => tab.key === action.key)
  if (index < 0) return state
  if (action.type === 'back') return { ...state, tabs: state.tabs.map(tab => tab.key === action.key ? { key: tab.key, target: tab.target } : tab) }
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

export type DetailWorkspaces = Record<string, DetailTabsState>
export function detailWorkspacesReducer(state: DetailWorkspaces, event: { scope: string; action: DetailTabsAction } | { type: 'remove-automation-occurrence' | 'remove-workspace'; id: string }): DetailWorkspaces {
  if ('type' in event) return Object.fromEntries(Object.entries(state).map(([scope, value]) => [scope, value.tabs.reduce((next, tab) => tab.target.type === (event.type === 'remove-workspace' ? 'workspace' : 'automation-occurrence') && tab.target.id === event.id ? detailTabsReducer(next, { type: 'close', key: tab.key }, scope) : next, value)]))
  const { scope, action } = event
  const previous = state[scope] ?? emptyDetailTabs
  const next = detailTabsReducer(previous, action, scope)
  return next === previous ? state : { ...state, [scope]: next }
}
