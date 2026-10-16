/*
 * [INPUT]: 通讯录当前员工/员工组、原编辑器与模型连接/数据源共用弹窗布局。
 * [OUTPUT]: 编辑在Dialog中进行，底页保留；执行记录经局部守卫关闭弹窗再打开全局右侧过程，保存/上传期间禁止关闭。
 * [POS]: 通讯录配置弹窗边界，不复制保存、版本或资源绑定协议。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属.folder.md。
 */
import { useContext, useRef, useState } from 'react'
import type { Conversation, DigitalAgent, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { GuardContext } from '@/components/common'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { EmployeeDetail } from '@/components/employee'
import { EmployeeExecutionNavigation } from '@/components/employee/execution-pane'
import { GroupEditor } from '@/components/employee/editors'
import { Dialog } from '@/components/ui/dialog'
import { ConnectionDialogLayout } from '@/pages/settings/connection-layout'
import { ConnectionIllustration } from '@/pages/settings/connection-illustration'

export function ContactEditorDialog({ api, snapshot, agent, group, active, refresh, onClose, onOpenAgent, onConversation }: {
  api: DesktopApi; snapshot: Snapshot; agent?: DigitalAgent; group?: Conversation; active: boolean
  refresh(): Promise<void>; onClose(): void; onOpenAgent(id: string): void; onConversation(id: string, messageId?: string): void
}) {
  const content = useRef<HTMLDivElement>(null), [busy, setBusy] = useState(false)
  const openExecution = useContext(EmployeeExecutionNavigation)
  const { guard, navigate, confirmation } = useEditorGuard({ reset() {}, getForm: () => content.current?.querySelector<HTMLFormElement>('form[data-edit-form]') ?? null })
  const close = () => { if (!busy) navigate(onClose, { resetOnDiscard: false }) }
  const label = agent ? '编辑员工' : '编辑员工组'
  return <GuardContext.Provider value={guard}><EmployeeExecutionNavigation.Provider value={target => {
    if (!active || busy) return
    navigate(() => { onClose(); openExecution(target) }, { resetOnDiscard: false })
  }}>
    <Dialog open={active} onOpenChange={open => { if (!open) close() }}>
      <ConnectionDialogLayout choosing={false} scrollBody label={label} title={`配置 ${agent?.name ?? group?.title ?? ''}`}
        illustration={<ConnectionIllustration configuring />} closeLabel={`关闭${label}`} working={busy} onClose={close} finalFocus={undefined}>
        <div ref={content} className="contact-configuration-card soft-card bg-muted">
          {agent ? <EmployeeDetail api={api} snapshot={snapshot} agent={agent} refresh={refresh} active={active} onClose={onClose} onBusyChange={setBusy} onConversation={onConversation} />
            : group && <GroupEditor api={api} snapshot={snapshot} conversation={group} active={active} onSaved={refresh} onDeleted={refresh} onClose={onClose} onBusyChange={setBusy} onConversation={onConversation} onOpenAgent={id => navigate(() => { onClose(); onOpenAgent(id) }, { resetOnDiscard: false })} />}
        </div>
      </ConnectionDialogLayout>
    </Dialog>
    {confirmation}
  </EmployeeExecutionNavigation.Provider></GuardContext.Provider>
}
