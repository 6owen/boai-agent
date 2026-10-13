/*
 * [INPUT]: 已保存员工、受控渠道IPC与BOAI原表单/未保存守卫。
 * [OUTPUT]: 渠道绑定、明确群白名单、连接及平台事件/消息受理观察和发送结果；保存未知冻结原请求并只读核对。
 * [POS]: 员工详情渠道区域，隐藏停读；凭据不进入快照。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useContext, useEffect, useRef, useState } from 'react'
import type { DigitalAgent } from '@shared/domain'
import { CHANNEL_NAMES, CHANNEL_PLATFORMS, type ChannelBindingInput, type ChannelBindingState, type ChannelDelivery, type ChannelPlatform } from '@shared/domain/channels'
import type { DesktopApi } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { Card, CardContent } from '@/components/ui/card'
import { Banner, Field, GuardContext, errorText } from '@/components/common/index'

const ids = (value: string) => [...new Set(value.split(/[\s,，]+/).map(id => id.trim()).filter(Boolean))]
const statusNames = { connected: '已连接', connecting: '连接中', disconnected: '未连接', failed: '连接或消息处理失败' }
const deliveryNames = { sending: '发送中', sent: '已发送', failed: '未发送', unknown: '发送结果未知' }
const empty = (agent: DigitalAgent) => ({ platform: 'feishu' as ChannelPlatform, appId: '', name: `${agent.name} · 飞书`, credential: '', users: '', chats: '', botUserId: '', robotCode: '' })
export function EmployeeChannelPane({ api, agent, active }: { api: DesktopApi; agent: DigitalAgent; active: boolean }) {
  const [bindings, setBindings] = useState<ChannelBindingState[]>([]), [deliveries, setDeliveries] = useState<ChannelDelivery[]>([])
  const [draft, setDraft] = useState(() => empty(agent)), [baseline, setBaseline] = useState(() => empty(agent))
  const [editing, setEditing] = useState<ChannelBindingState>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [unconfirmed, setUnconfirmed] = useState(false)
  const requestId = useRef(crypto.randomUUID()), frozen = useRef<ChannelBindingInput | undefined>(undefined)
  const generation = useRef(0)
  const guard = useContext(GuardContext)
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)
  useEffect(() => { guard.setDirty(dirty || unconfirmed); return () => guard.setDirty(false) }, [dirty, unconfirmed, guard.setDirty])
  const load = async () => {
    const token = ++generation.current
    try {
      const [next, results] = await Promise.all([api.request('listChannelBindings', { agentId: agent.id }), api.request('listChannelDeliveries', { agentId: agent.id })])
      if (token === generation.current) { setBindings(next); setDeliveries(results) }
    } catch (reason) { if (token === generation.current) setError(errorText(reason)) }
  }
  useEffect(() => {
    if (!active) return
    void load()
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed') void load() })
    return () => { generation.current++; unsubscribe() }
  }, [api, agent.id, active])
  const reset = () => { const value = empty(agent); setDraft(value); setBaseline(value); setEditing(undefined); requestId.current = crypto.randomUUID(); frozen.current = undefined; setUnconfirmed(false) }
  const committed = async () => { reset(); setNotice('渠道绑定已保存。点击连接后开始接收消息。'); guard.saved(); await load() }
  const act = async (binding: ChannelBindingState, method: 'connectChannelBinding' | 'disconnectChannelBinding' | 'removeChannelBinding') => {
    setBusy(true); setError('')
    try { await api.request(method, { id: binding.id, expectedRevision: binding.revision }); await load() }
    catch (reason) { setError(errorText(reason)); await load() }
    finally { setBusy(false) }
  }
  return <div className="detail-section">
    <h3>员工渠道</h3><p className="field-hint">从外部聊天联系 {agent.name}。消息与文件保存在独立平台会话，员工使用当前执行配置。应用需保持运行和联网。</p>
    {error && <Banner>{error}</Banner>}{notice && <Banner kind="notice">{notice}</Banner>}
    {bindings.map(binding => <Card key={binding.id} className="connection-card gap-0 p-4"><CardContent className="p-0">
      <strong>{binding.name}</strong><p>{CHANNEL_NAMES[binding.platform]} · {binding.appId}</p><p><span className="pill">{statusNames[binding.status]}</span>{binding.botUserId && <span className="pill">机器人：{binding.botUserId}</span>}</p>
      {binding.detail && <p className="field-hint">{binding.detail}</p>}<p className="field-hint">已授权用户：{binding.allowedUserIds.join('、')} {binding.allowedChatIds.length > 0 && ` · 已授权群：${binding.allowedChatIds.join('、')}`}</p>
      {binding.lastInbound ? <p className="field-hint">最近消息：{new Date(binding.lastInbound.receivedAt).toLocaleString()} · {binding.lastInbound.detail}</p> : binding.lastEventAt ? <p className="field-hint">已收到平台消息事件，但尚未进入员工会话，请核对连接提示。</p> : binding.enabled && binding.status === 'connected' && <p className="field-hint">本次运行尚未收到平台消息。{(binding.platform === 'feishu' || binding.platform === 'lark') && '请核对飞书的接收消息事件订阅，并使用长连接接收事件。'}</p>}
      <div className="button-row">
        <Button variant="secondary" size="sm" disabled={busy || unconfirmed || binding.status === 'connecting'} onClick={() => { void act(binding, binding.enabled ? 'disconnectChannelBinding' : 'connectChannelBinding') }}>{binding.enabled ? '停止连接' : '连接'}</Button>
        <Button variant="ghost" size="sm" disabled={busy || binding.enabled || unconfirmed || dirty} onClick={() => { const value = { platform: binding.platform, appId: binding.appId, name: binding.name, credential: '', users: binding.allowedUserIds.join('\n'), chats: binding.allowedChatIds.join('\n'), botUserId: binding.botUserId ?? '', robotCode: binding.robotCode ?? '' }; setDraft(value); setBaseline(value); setEditing(binding); requestId.current = crypto.randomUUID(); frozen.current = undefined }}>编辑绑定</Button>
        <Button variant="ghost" size="sm" disabled={busy || unconfirmed} onClick={() => { void act(binding, 'removeChannelBinding') }}>解除绑定</Button>
      </div><p className="field-hint">解除绑定保留聊天历史与成果，远端机器人保持原状。{binding.pendingDeliveries > 0 && `有 ${binding.pendingDeliveries} 项平台发送结果待核对。`}</p>
    </CardContent></Card>)}
    <form data-edit-form onSubmit={event => {
      event.preventDefault(); if (busy || unconfirmed) return
      const input: ChannelBindingInput = { ...editing && { id: editing.id, expectedRevision: editing.revision }, agentId: agent.id, platform: draft.platform, appId: draft.appId.trim() || (draft.platform === 'telegram' ? draft.credential.split(':')[0] : ''), name: draft.name.trim(), ...draft.robotCode.trim() && { robotCode: draft.robotCode.trim() }, ...draft.credential && { credential: draft.credential.trim() }, ...draft.botUserId.trim() && { botUserId: draft.botUserId.trim() }, allowedUserIds: ids(draft.users), allowedChatIds: ids(draft.chats), requestId: requestId.current }
      frozen.current = input; setBusy(true); setError('')
      void api.request('saveChannelBinding', input).then(committed, reason => { setError(errorText(reason)); setUnconfirmed(true) }).finally(() => setBusy(false))
    }}>
      <h4>{editing ? '编辑渠道绑定' : '添加渠道绑定'}</h4><fieldset className="contents" disabled={busy || unconfirmed}>
        <Field label="平台"><SelectField value={draft.platform} disabled={!!editing} onValueChange={value => setDraft(current => ({ ...current, platform: value as ChannelPlatform, name: `${agent.name} · ${CHANNEL_NAMES[value as ChannelPlatform]}` }))} options={CHANNEL_PLATFORMS.map(platform => ({ value: platform, label: CHANNEL_NAMES[platform] }))} /></Field>
        <Field label="绑定名称"><Input required maxLength={100} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></Field>
        <Field label={draft.platform === 'telegram' ? 'Bot ID' : draft.platform === 'dingtalk' ? 'AppKey' : 'App ID'} hint={draft.platform === 'telegram' ? '可留空，从Bot Token前缀读取。当前使用long polling，连接会停用该bot的已有webhook；同一个bot只交给一个宿主。' : undefined}><Input disabled={!!editing} required={draft.platform !== 'telegram'} value={draft.appId} onChange={event => setDraft(current => ({ ...current, appId: event.target.value }))} /></Field>
        <Field label={draft.platform === 'telegram' ? 'Bot Token' : 'App Secret'} hint={editing ? '留空沿用已保存凭据。' : '保存到系统加密凭据库，不进入聊天或快照。'}><Input type="password" autoComplete="off" required={!editing} value={draft.credential} onChange={event => setDraft(current => ({ ...current, credential: event.target.value }))} /></Field>
        <Field label="授权用户 ID" hint={draft.platform === 'feishu' || draft.platform === 'lark' ? '填写平台用户的Open ID，每行一个。只接收这些用户的消息。' : draft.platform === 'telegram' ? '填写Telegram数字用户ID，每行一个。' : '填写钉钉senderStaffId，每行一个。'}><Textarea required rows={3} value={draft.users} onChange={event => setDraft(current => ({ ...current, users: event.target.value }))} /></Field>
        <Field label="授权群 ID" hint="每行一个。留空只接收私聊；群消息须来自这里的群和授权用户，并明确提及机器人。"><Textarea rows={2} value={draft.chats} onChange={event => setDraft(current => ({ ...current, chats: event.target.value }))} /></Field>
        {draft.platform === 'dingtalk' && <Field label="Robot Code" hint="可选，未填写时使用AppKey。已有应用的机器人Code不同于AppKey时单独填写。"><Input disabled={!!editing} value={draft.robotCode} onChange={event => setDraft(current => ({ ...current, robotCode: event.target.value }))} /></Field>}
        {draft.platform === 'dingtalk' && <Field label="机器人群提及 ID" hint="多机器人群填写机器人对应的chatbotUserId / dingtalkId，用于将平台提及准确关联到员工。"><Input value={draft.botUserId} onChange={event => setDraft(current => ({ ...current, botUserId: event.target.value }))} /></Field>}
        <div className="button-row"><Button type="submit" disabled={!ids(draft.users).length}>{editing ? '保存绑定' : '添加绑定'}</Button>{editing && <Button type="button" variant="ghost" onClick={() => { reset(); guard.saved() }}>取消编辑</Button>}</div>
      </fieldset>
      {unconfirmed && <><p className="field-hint">保存结果尚未确认，原请求和草稿已保留。先核对，不重复创建。</p><Button type="button" variant="secondary" disabled={busy} onClick={() => {
        setBusy(true)
        void api.request('getChannelBindingReceipt', { agentId: agent.id, requestId: frozen.current!.requestId }).then(async receipt => { if (receipt) await committed(); else { setUnconfirmed(false); setNotice('已核对没有保存回执，可用原请求再次保存。') } }, reason => setError(errorText(reason))).finally(() => setBusy(false))
      }}>核对保存结果</Button></>}
    </form>
    {deliveries.length > 0 && <><h4>最近平台发送结果</h4>{deliveries.map(delivery => <div key={delivery.id} className="scope-note"><strong>{bindings.find(binding => binding.id === delivery.bindingId)?.name ?? '原绑定'} · {deliveryNames[delivery.status]}</strong>{delivery.detail && <p>{delivery.detail}</p>}<p className="field-hint">{new Date(delivery.updatedAt).toLocaleString()} · {delivery.messageId}</p></div>)}</>}
  </div>
}
