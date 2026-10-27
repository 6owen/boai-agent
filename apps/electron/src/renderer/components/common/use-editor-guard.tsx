/*
 * [INPUT]: 公共编辑守卫、桌面外观/快捷键/语音自动保存store。
 * [OUTPUT]: 离页先等待快捷键和语音保存；失败进入原确认框，未知回执核对前不可放弃。
 * [POS]: common桌面宿主适配；共享包保持无业务依赖。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEditorGuard as useSharedEditorGuard } from '@boai/ui/use-editor-guard'
import { flushAppearance } from '@/stores/appearance'
import { shortcuts } from '@/stores/shortcuts'
import { voiceSettings } from '@/stores/voice-settings'
const beforeNavigate = () => {
  void flushAppearance()
  if (shortcuts.hasWork() || voiceSettings.hasWork()) return Promise.all([shortcuts.flush(), voiceSettings.flush()])
}
const hasPendingChanges = () => shortcuts.hasWork() || voiceSettings.hasWork()
const beforeDiscard = async () => await shortcuts.discard() && (!voiceSettings.hasWork() || await voiceSettings.discard())
export function useEditorGuard({ reset }: { reset: () => void }) {
  return useSharedEditorGuard({ reset, beforeNavigate, hasPendingChanges, beforeDiscard })
}
