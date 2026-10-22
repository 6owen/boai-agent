/*
 * [INPUT]: 公共编辑守卫、桌面外观与快捷键自动保存store。
 * [OUTPUT]: 离页先等待快捷键保存；失败进入原确认框，未知回执核对前不可放弃。
 * [POS]: common桌面宿主适配；共享包保持无业务依赖。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEditorGuard as useSharedEditorGuard } from '@boai/ui/use-editor-guard'
import { flushAppearance } from '@/stores/appearance'
import { shortcuts } from '@/stores/shortcuts'
const beforeNavigate = () => { void flushAppearance(); if (shortcuts.hasWork()) return shortcuts.flush() }
const hasPendingChanges = () => shortcuts.hasWork()
const beforeDiscard = () => shortcuts.discard()
export function useEditorGuard({ reset }: { reset: () => void }) {
  return useSharedEditorGuard({ reset, beforeNavigate, hasPendingChanges, beforeDiscard })
}
