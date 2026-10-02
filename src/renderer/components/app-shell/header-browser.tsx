/*
 * [INPUT]: 当前主页面的已保存会话、真实员工配置、typed 浏览器 IPC 与宿主窗口变更。
 * [OUTPUT]: 顶栏常驻普通浏览器入口；Mastra 员工默认可用、旧 false/缺值不挡入口，单聊沿原员工/群聊明确选成员；无任务空白、已有窗口直接显示，无控制权文案，隐藏/切换停止读取与迟到隔离，ACP/停用员工明确不支持。
 * [POS]: app-shell 独立浏览器入口；不创建 Conversation、Work 或模型调用，不改变动作审批与范围。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { Conversation, DigitalAgent } from '@shared/domain'
import { isBrowserCapableAgent } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import type { BrowserWindowState } from '@shared/ipc/browser'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorText, Field } from '@/components/common'
import { LoaderCircle } from '@/components/icons'
import { toast } from 'sonner'

export function browserMembers(conversation: Conversation | undefined, agents: DigitalAgent[]) {
  if (!conversation || conversation.list?.hidden) return []
  return conversation.agentIds.flatMap(id => { const agent = agents.find(item => item.id === id); return agent ? [agent] : [] })
}
export function scopedBrowserWindows(conversation: Conversation | undefined, members: DigitalAgent[], windows: BrowserWindowState[]) {
  return windows.filter(state => state.conversationId === conversation?.id && members.some(agent => agent.id === state.agentId) && state.control !== 'closed')
}
export function browserUnavailable(agent: DigitalAgent) {
  if (isBrowserCapableAgent(agent)) return ''
  if (!agent.active) return '该员工已停用。'
  return '该员工使用外部 ACP，暂不支持应用内浏览器。'
}

interface Props {
  api: DesktopApi | undefined; conversation?: Conversation; agents: DigitalAgent[]; active: boolean
}
export function HeaderBrowser({ api, conversation, agents, active }: Props) {
  const members = browserMembers(conversation, agents), scope = active && conversation && !conversation.list?.hidden ? conversation.id : undefined
  const scopeRef = useRef(scope); scopeRef.current = scope
  const flight = useRef(false)
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  const [view, setView] = useState<{ conversationId?: string; states: BrowserWindowState[] }>({ states: [] })
  const [dialog, setDialog] = useState<{ conversationId: string; agentId?: string; group: boolean }>()
  const selectedAgent = dialog?.conversationId === scope ? members.find(agent => agent.id === dialog?.agentId) : undefined
  const unavailable = selectedAgent ? browserUnavailable(selectedAgent) : ''
  const windows = view.conversationId === scope ? scopedBrowserWindows(conversation, members, view.states) : []
  useEffect(() => { setDialog(previous => previous?.conversationId === scope ? previous : undefined) }, [scope])
  useEffect(() => {
    if (!api || !scope) return
    let disposed = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const token = ++request
      try {
        const states = await api.request('getBrowserWindows', { conversationId: scope })
        if (!disposed && token === request) setView({ conversationId: scope, states })
      } catch (error) { if (!disposed && token === request) toast.error(errorText(error)) }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if (event.type !== 'browser:changed' || event.conversationId !== scope) return
      request++
      timer ??= setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, scope, revision])
  const open = async (agent: DigitalAgent) => {
    if (!api || !scope || flight.current || !members.some(member => member.id === agent.id)) return
    if (browserUnavailable(agent)) { setDialog({ conversationId: scope, agentId: agent.id, group: conversation!.kind === 'group' }); return }
    const conversationId = scope
    flight.current = true; setBusy(true)
    try {
      // The host rechecks membership/configuration and reuses the exact employee/conversation scope.
      await api.request('openBrowser', { agentId: agent.id, conversationId })
      if (scopeRef.current === conversationId) { setDialog(undefined); setRevision(value => value + 1) }
    } catch (error) { if (scopeRef.current === conversationId) toast.error(errorText(error)) }
    finally { flight.current = false; setBusy(false) }
  }
  const title = !scope ? '先选择一个已有会话，再打开浏览器' : windows.length ? '打开本会话浏览器' : '打开本会话空白浏览器'
  return <div className="titlebar-no-drag flex shrink-0 items-center">
    <Button variant="ghost" size="icon-sm" aria-label="打开浏览器" title={title} aria-pressed={windows.some(state => state.isVisible)} disabled={!api || !scope || !members.length || busy} onClick={() => {
      if (!scope) return
      if (conversation!.kind === 'group') setDialog({ conversationId: scope, group: true })
      else if (members[0]) void open(members[0])
    }}>{busy ? <LoaderCircle className="animate-spin" /> : <i aria-hidden="true" className="app-icon i-carbon-earth" />}</Button>
    <Dialog open={Boolean(scope && dialog?.conversationId === scope)} onOpenChange={value => { if (!value && !busy) setDialog(undefined) }}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader><DialogTitle>{dialog?.group ? '打开员工浏览器' : '浏览器暂不可用'}</DialogTitle><DialogDescription>{dialog?.group ? '请选择本会话的员工。已有窗口会直接显示；没有窗口时打开空白浏览器。' : `${selectedAgent?.name ?? '该员工'}的浏览器沿当前会话保存登录资料。`}</DialogDescription></DialogHeader>
        {dialog?.group && <Field label="员工"><Select value={dialog.agentId ?? ''} onValueChange={value => setDialog(previous => previous ? { ...previous, agentId: value ?? undefined } : undefined)} disabled={busy}><SelectTrigger className="w-full" aria-label="浏览器所属员工"><SelectValue placeholder="选择本会话员工" /></SelectTrigger><SelectContent>{members.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent></Select></Field>}
        {unavailable && <p className="text-sm text-muted-foreground">{unavailable}</p>}
        <DialogFooter variant="plain"><Button variant="ghost" disabled={busy} onClick={() => setDialog(undefined)}>取消</Button><Button disabled={!selectedAgent || Boolean(unavailable) || busy} onClick={() => { if (selectedAgent) void open(selectedAgent) }}>{busy ? '正在打开…' : '打开浏览器'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
