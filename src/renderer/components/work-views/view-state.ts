/*
 * [INPUT]: 明确视图范围/查询key和不可变Work身份。
 * [OUTPUT]: 只保存选中卡片、详情与真实子工作展开偏好；重核/隐藏后恢复，不保存工作正文或改变业务状态。
 * [POS]: work-views的页面内偏好，按范围隔离；来源有效性仍由宿主查询决定。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录.folder.md。
 */
export interface WorkCardViewState { details: boolean; children: boolean }
const cards = new Map<string, WorkCardViewState>(), selections = new Map<string, string>()
const cardKey = (queryKey: string, workId: string) => JSON.stringify([queryKey, workId])
export function rememberedWorkCard(queryKey: string, workId: string): WorkCardViewState { return cards.get(cardKey(queryKey, workId)) ?? { details: false, children: false } }
export function rememberWorkCard(queryKey: string, workId: string, state: WorkCardViewState): void { cards.set(cardKey(queryKey, workId), { ...state }) }
export function rememberedWorkSelection(queryKey: string): string | undefined { return selections.get(queryKey) }
export function rememberWorkSelection(queryKey: string, workId: string): void { selections.set(queryKey, workId) }
