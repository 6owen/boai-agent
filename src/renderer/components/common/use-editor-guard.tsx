/*
 * [OUTPUT]: 公共守卫接受beforeNavigate回调；桌面保留原flushAppearance行为。
 * [INPUT]: 编辑器放弃后重置回调、统一 AlertDialog。
 * [OUTPUT]: 各编辑区域独立的未保存守卫；确认仅取消或放弃修改后退出，保存由原编辑器办理。
 * [POS]: common 的主页面/详情标签共用编辑保护。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEditorGuard as useSharedEditorGuard } from '@boai/ui/use-editor-guard'
import { flushAppearance } from '@/stores/appearance'
const beforeNavigate = () => { void flushAppearance() }
export function useEditorGuard({ reset }: { reset: () => void }) {
  return useSharedEditorGuard({ reset, beforeNavigate })
}
