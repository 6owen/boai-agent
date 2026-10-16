/*
 * [INPUT]: 新建/编辑目标、当前快照、原表单与bobo创建会话。
 * [OUTPUT]: 手动创建/编辑和对话创建统一在Dialog中打开；局部草稿守卫、保存期间禁止关闭，原页阅读状态保持。
 * [POS]: 定时任务弹窗边界，不复制计划表单或创建/保存协议。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useRef, useState } from 'react'
import type { AutomationDefinition, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { GuardContext } from '@/components/common'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AutomationEditorTab } from './automation-editor'
import { AutomationAssistant } from './automation-assistant'

export type AutomationDialogTarget = { kind: 'manual'; id?: string; key: string } | { kind: 'assistant'; key: string }

export function AutomationDialog({ api, snapshot, active, target, definitions, onClose, onSaved, onOpen }: {
  api: DesktopApi; snapshot: Snapshot; active: boolean; target: AutomationDialogTarget; definitions: AutomationDefinition[]
  onClose(): void; onSaved(value: AutomationDefinition): void; onOpen(id: string): void
}) {
  const content = useRef<HTMLDivElement>(null), [busy, setBusy] = useState(false)
  const { guard, navigate, confirmation } = useEditorGuard({ reset() {}, getForm: () => content.current?.querySelector<HTMLFormElement>('form[data-edit-form]') ?? null })
  const assistant = target.kind === 'assistant'
  return <GuardContext.Provider value={guard}><Dialog open={active} onOpenChange={open => { if (!open && !busy) navigate(onClose, { resetOnDiscard: false }) }}>
    <DialogContent ref={content} aria-describedby={undefined} showCloseButton={!busy}
      className={assistant ? 'schedule-assistant-dialog flex h-[min(720px,calc(100dvh-48px))] w-[800px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-48px)]' : 'schedule-editor-dialog flex max-h-[calc(100dvh-48px)] w-[800px] flex-col gap-5 overflow-y-auto p-6 sm:max-w-[calc(100vw-48px)] [scrollbar-gutter:stable]'}>
      <DialogHeader className={assistant ? 'sr-only' : 'shrink-0 pr-6'}><DialogTitle>{assistant ? '对话创建定时任务' : target.id ? '编辑定时任务' : '新建定时任务'}</DialogTitle></DialogHeader>
      {target.kind === 'manual' ? <AutomationEditorTab api={api} snapshot={snapshot} id={target.id} hideTitle onBusyChange={setBusy} onClose={onClose} onSaved={onSaved} />
        : <AutomationAssistant api={api} snapshot={snapshot} active={active} definitions={definitions} onOpen={onOpen} />}
      {confirmation}
    </DialogContent>
  </Dialog></GuardContext.Provider>
}
