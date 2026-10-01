/*
 * [INPUT]: 核心助手会话 IPC、员工快照、受控弹窗状态、共享 Tooltip/主题主色按钮与会话/设置导航。
 * [OUTPUT]: 团队名称和需求两项必填弹窗，说明收纳到标题后图标 Tooltip，生成使用主题主色；失败先核对当前请求回执，未核对时锁定原字段与身份，确定未受理后才允许改新请求。
 * [POS]: contacts 加号菜单的团队创建弹窗；核心助手负责方案和原子创建，不保存团队草稿。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useId, useRef, useState, type FormEvent } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { Conversation, Snapshot } from '@shared/domain'
import { CORE_AGENT_DEFAULT_NAME, isCoreAgent } from '@shared/domain/core-agent'
import { Banner, Field, errorText } from '@/components/common'
import { InfoIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  api: DesktopApi
  snapshot: Snapshot
  open: boolean
  onOpenChange(open: boolean): void
  onStarted(conversation: Conversation): void | Promise<void>
  onConfigure(): void
}

export function TeamCreator({ api, snapshot, open, onOpenChange, onStarted, onConfigure }: Props) {
  const [teamName, setTeamName] = useState(''), [prompt, setPrompt] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [unresolved, setUnresolved] = useState(false)
  const formId = useId(), nameInput = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const request = useRef<{ requestId: string; team: { name: string; requirements: string } } | undefined>(undefined)
  const assistant = snapshot.agents.find(isCoreAgent)
  const name = assistant?.name ?? CORE_AGENT_DEFAULT_NAME
  const accept = async (conversation: Conversation) => {
    await onStarted(conversation)
    setTeamName(''); setPrompt(''); request.current = undefined; setUnresolved(false); onOpenChange(false)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const team = { name: teamName.trim(), requirements: prompt.trim() }
    if (!team.name || !team.requirements || inFlight.current) return
    request.current ??= { requestId: crypto.randomUUID(), team }
    const attempted = request.current
    inFlight.current = true; setBusy(true); setError('')
    try {
      let conversation: Conversation
      try { conversation = await api.request('startCoreConversation', attempted) }
      catch (failure) {
        let receipt: Conversation | null
        try { receipt = await api.request('getCoreConversationStart', { requestId: attempted.requestId }) }
        catch {
          setUnresolved(true); setError(`${errorText(failure)} 创建状态暂时无法核对，重试会核对同一请求。`)
          return
        }
        if (!receipt) { request.current = undefined; setUnresolved(false); setError(errorText(failure)); return }
        conversation = receipt
      }
      await accept(conversation)
    } catch (failure) { setUnresolved(true); setError(`${errorText(failure)} 已保留原创建请求，请重试进入会话。`) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={value => { if (!inFlight.current) onOpenChange(value) }}>
    <DialogContent showCloseButton={false} initialFocus={nameInput} finalFocus={() => document.querySelector<HTMLElement>('.contacts-list .list-heading [aria-label="新建"]')} className="max-h-[calc(100dvh-32px)] overflow-y-auto p-6 sm:max-w-[520px]">
      <DialogHeader><div className="flex items-center gap-2"><DialogTitle>创建团队</DialogTitle><Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="创建团队说明" />}><InfoIcon /></TooltipTrigger><TooltipContent side="bottom">{name} 会根据需求安排成员、分工并创建群聊。</TooltipContent></Tooltip></div></DialogHeader>
      <form id={formId} onSubmit={event => { void submit(event) }}>
        <FieldGroup>
          {error && <Banner>{error}</Banner>}
          <fieldset disabled={busy || unresolved} className="m-0 min-w-0 border-0 p-0">
            <FieldGroup>
              <Field label="团队名称"><Input ref={nameInput} required maxLength={80} value={teamName} onChange={event => setTeamName(event.target.value)} placeholder="为团队起个名字" /></Field>
              <Field label="团队需求"><Textarea required rows={6} maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="描述团队要完成的工作，以及你对成员和分工的期望" /></Field>
            </FieldGroup>
          </fieldset>
          {error && <Button type="button" variant="outline" onClick={onConfigure}>设置模型连接</Button>}
          <DialogFooter variant="plain"><Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={busy || !teamName.trim() || !prompt.trim()}>{busy ? '正在进入会话…' : '生成'}</Button></DialogFooter>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>
}
