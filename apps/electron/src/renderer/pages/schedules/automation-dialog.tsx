/*
 * [OUTPUT]: 普通任务与定时计划共用持久保存表单；默认频率按创建入口选择。
 * [INPUT]: 手动新建/编辑目标、当前快照与原表单。
 * [OUTPUT]: 仅手动创建/编辑使用Dialog；局部草稿确认仅取消/退出、保存期间禁止关闭，原页阅读状态保持。
 * [POS]: 定时任务弹窗边界，不复制计划表单或创建/保存协议。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useState } from 'react'
import type { AutomationDefinition, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { GuardContext } from '@/components/common'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AutomationEditorTab } from './automation-editor'

export type AutomationDialogTarget = { kind: 'manual' | 'task'; id?: string; key: string }

export function AutomationDialog({ api, snapshot, active, target, onClose, onSaved }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; target: AutomationDialogTarget
  onClose(): void; onSaved(value: AutomationDefinition): void
}) {
  const [busy, setBusy] = useState(false)
  const { guard, navigate, confirmation } = useEditorGuard({ reset() {} })
  return <GuardContext.Provider value={guard}><Dialog open={active} onOpenChange={open => { if (!open && !busy) navigate(onClose, { resetOnDiscard: false }) }}>
    <DialogContent aria-describedby={undefined} showCloseButton={!busy}
      className="schedule-editor-dialog flex max-h-[calc(100dvh-48px)] w-[800px] flex-col gap-5 overflow-y-auto p-6 sm:max-w-[calc(100vw-48px)] [scrollbar-gutter:stable]">
      <DialogHeader className="shrink-0 pr-6"><DialogTitle>{target.id ? '编辑任务' : target.kind === 'task' ? '新建任务' : '新建定时任务'}</DialogTitle></DialogHeader>
      <AutomationEditorTab api={api} snapshot={snapshot} id={target.id} mode={target.kind} hideTitle onBusyChange={setBusy} onClose={onClose} onSaved={onSaved} />
      {confirmation}
    </DialogContent>
  </Dialog></GuardContext.Provider>
}
