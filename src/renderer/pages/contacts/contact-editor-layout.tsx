/*
 * [OUTPUT]: 员工高级配置可排除资料页已有基础配置，默认进入系统文件；工作区查看配置回到资料页模型分区。
 * [OUTPUT]: 员工与员工组共用840px/640px无可见标题、无外层内边距的分栏Dialog，右上关闭、左侧菜单常驻、右侧贴边滚动并顶部渐隐。
 * [OUTPUT]: 员工组仅保留基础配置及原有资格的自动化分类，原群成员、版本保存与解散逻辑保持。
 * [INPUT]: 通讯录当前员工/员工组、原编辑器与共用分栏弹窗布局。
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

export function ContactEditorDialog({ api, snapshot, agent, group, active, refresh, onClose, onOpenAgent, onConversation, advancedOnly = false, onConfigure }: {
  api: DesktopApi; snapshot: Snapshot; agent?: DigitalAgent; group?: Conversation; active: boolean
  advancedOnly?: boolean; onConfigure?(): void
  refresh(): Promise<void>; onClose(): void; onOpenAgent(id: string): void; onConversation(id: string, messageId?: string): void
}) {
  const [busy, setBusy] = useState(false)
  const openExecution = useContext(EmployeeExecutionNavigation)
  const { guard, navigate, confirmation } = useEditorGuard({ reset() {} })
  const close = () => { if (!busy) navigate(onClose, { resetOnDiscard: false }) }
  const label = agent ? advancedOnly ? '高级配置' : '编辑员工' : '编辑员工组'
  return <GuardContext.Provider value={guard}><EmployeeExecutionNavigation.Provider value={target => {
    if (!active || busy) return
    navigate(() => { onClose(); openExecution(target) }, { resetOnDiscard: false })
  }}>
    <Dialog open={active} onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="employee-editor-dialog flex gap-0 overflow-hidden p-0" style={{ width: 840, height: 640, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 48px)' }} showCloseButton={false}>
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <Button type="button" variant="ghost" size="icon-xs" className="absolute top-3 right-3 z-30" aria-label={`关闭${label}`} disabled={busy} onClick={close}><X /></Button>
        <div className="employee-form-layout employee-editor-layout">{agent
          ? <EmployeeDetail navigation="sidebar" configurationAvailable={!advancedOnly} onConfigure={onConfigure} api={api} snapshot={snapshot} agent={agent} refresh={refresh} active={active} onClose={onClose} onBusyChange={setBusy} onConversation={onConversation} />
          : group && <GroupEditor navigation="sidebar" api={api} snapshot={snapshot} conversation={group} active={active} onSaved={refresh} onDeleted={refresh} onClose={onClose} onBusyChange={setBusy} onConversation={onConversation} onOpenAgent={id => navigate(() => { onClose(); onOpenAgent(id) }, { resetOnDiscard: false })} />}</div>
      </DialogContent>
    </Dialog>
    {confirmation}
  </EmployeeExecutionNavigation.Provider></GuardContext.Provider>
}
