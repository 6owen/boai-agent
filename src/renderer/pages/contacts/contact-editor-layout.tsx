/*
 * [OUTPUT]: 员工编辑使用无可见标题/无外层内边距的分栏Dialog，关闭入口在右上，右侧滚动视口铺满至弹窗边缘。
 * [OUTPUT]: 员工编辑弹窗840px/640px固定外框，左侧菜单常驻、右侧独立滚动；员工组原布局保持。
 * [OUTPUT]: 员工编辑移除顶部居中标题/插图，与新建直接进入基本信息一致；员工组仍沿原介绍布局。
 * [INPUT]: 通讯录当前员工/员工组、原编辑器与模型连接/数据源共用弹窗布局。
 * [OUTPUT]: 员工编辑使用卡片外分区标题/独立Card，与创建一致；底页保留、局部取消/退出守卫及忙时禁关，执行记录关闭弹窗后打开全局过程。
 * [POS]: 通讯录配置弹窗边界，不复制保存、版本或资源绑定协议。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属.folder.md。
 */
import { useContext, useState } from 'react'
import type { Conversation, DigitalAgent, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { GuardContext } from '@/components/common'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { EmployeeDetail } from '@/components/employee'
import { EmployeeExecutionNavigation } from '@/components/employee/execution-pane'
import { GroupEditor } from '@/components/employee/editors'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X } from '@/components/icons'
import { ConnectionDialogLayout } from '@/pages/settings/connection-layout'
import { ConnectionIllustration } from '@/pages/settings/connection-illustration'

export function ContactEditorDialog({ api, snapshot, agent, group, active, refresh, onClose, onOpenAgent, onConversation }: {
  api: DesktopApi; snapshot: Snapshot; agent?: DigitalAgent; group?: Conversation; active: boolean
  refresh(): Promise<void>; onClose(): void; onOpenAgent(id: string): void; onConversation(id: string, messageId?: string): void
}) {
  const [busy, setBusy] = useState(false)
  const openExecution = useContext(EmployeeExecutionNavigation)
  const { guard, navigate, confirmation } = useEditorGuard({ reset() {} })
  const close = () => { if (!busy) navigate(onClose, { resetOnDiscard: false }) }
  const label = agent ? '编辑员工' : '编辑员工组'
  return <GuardContext.Provider value={guard}><EmployeeExecutionNavigation.Provider value={target => {
    if (!active || busy) return
    navigate(() => { onClose(); openExecution(target) }, { resetOnDiscard: false })
  }}>
    <Dialog open={active} onOpenChange={open => { if (!open) close() }}>
      {agent ? <DialogContent className="employee-editor-dialog flex gap-0 overflow-hidden p-0" style={{ width: 840, height: 640, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 48px)' }} showCloseButton={false}>
        <DialogTitle className="sr-only">编辑员工</DialogTitle>
        <Button type="button" variant="ghost" size="icon-xs" className="absolute top-3 right-3 z-30" aria-label="关闭编辑员工" disabled={busy} onClick={close}><X /></Button>
        <div className="employee-form-layout employee-editor-layout"><EmployeeDetail navigation="sidebar" api={api} snapshot={snapshot} agent={agent} refresh={refresh} active={active} onClose={onClose} onBusyChange={setBusy} onConversation={onConversation} /></div>
      </DialogContent> : <ConnectionDialogLayout choosing={false} scrollBody label={label} title={`配置 ${group?.title ?? ''}`} illustration={<ConnectionIllustration configuring />} closeLabel={`关闭${label}`} working={busy} onClose={close} finalFocus={undefined}>
        <div className="contact-configuration-card soft-card bg-muted">{group && <GroupEditor api={api} snapshot={snapshot} conversation={group} active={active} onSaved={refresh} onDeleted={refresh} onClose={onClose} onBusyChange={setBusy} onConversation={onConversation} onOpenAgent={id => navigate(() => { onClose(); onOpenAgent(id) }, { resetOnDiscard: false })} />}</div>
      </ConnectionDialogLayout>}
    </Dialog>
    {confirmation}
  </EmployeeExecutionNavigation.Provider></GuardContext.Provider>
}
