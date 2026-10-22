/*
 * [OUTPUT]: 清理开始同步失效在途组织读取并停读，隐藏/删除终态不再刷新；正常查询真实错误保持。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: 当前 core 会话、公共组织回执、真实联系人/群快照和显式恢复 IPC。
 * [OUTPUT]: 原请求所属的独立群与已有/新员工入口；未知恢复保留原载荷跨切换/重启，显式只读核对；隐藏停读、迟到拒绝，不自动跳转或续行。
 * [POS]: bobo 讨论聊天的组织结果投影；员工身份独立于群，普通群继续复用正常聊天。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import type { BoboCollaborationReceipt } from '@shared/domain/bobo-collaboration'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function coreCollaborationReceipts(receipts: BoboCollaborationReceipt[], conversationId: string) {
  return receipts.filter(receipt => receipt.sourceConversationId === conversationId && !receipt.sourceCleared).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}
export function collaborationObjects(receipt: BoboCollaborationReceipt, snapshot: Pick<Snapshot, 'agents' | 'conversations'>) {
  if (receipt.status !== 'committed') return { group: undefined, employees: [] }
  const group = receipt.groupCleared ? undefined : snapshot.conversations.find(conversation => conversation.id === receipt.groupConversationId && conversation.kind === 'group' && !conversation.list?.hidden)
  const identities = [...receipt.existingMembers.map(member => ({ id: member.agentId, name: member.name, source: '已有员工' as const })), ...receipt.agents.map(agent => ({ id: agent.id, name: agent.name, source: '本次创建' as const }))]
  return { group, employees: identities.map(identity => ({ ...identity, current: snapshot.agents.find(agent => agent.id === identity.id) })) }
}
export const COLLABORATION_RECOVERY_KEY = 'boai.v2.bobo-collaboration-recovery'
type PendingRecovery = { operationId: string; expectedVersion: number; action: 'resume' | 'abandon' | 'start' }
export function restoreCollaborationRecoveries(value: unknown): Record<string, PendingRecovery> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('原组织恢复记录格式无效，请保留本地记录并核对。')
  const result: Record<string, PendingRecovery> = Object.create(null)
  for (const [conversationId, entry] of Object.entries(value)) {
    if (!conversationId || !entry || typeof entry !== 'object' || typeof entry.operationId !== 'string' || !entry.operationId || !Number.isInteger(entry.expectedVersion) || entry.expectedVersion < 1 || !['resume', 'abandon', 'start'].includes(entry.action)) throw new Error('原组织恢复记录格式无效，请保留本地记录并核对。')
    result[conversationId] = { operationId: entry.operationId, expectedVersion: entry.expectedVersion, action: entry.action }
  }
  return result
}
const readRecoveries = () => restoreCollaborationRecoveries(JSON.parse(localStorage.getItem(COLLABORATION_RECOVERY_KEY) ?? '{}'))
interface Props { api: DesktopApi; conversationId: string; snapshot: Snapshot; active: boolean; busy: boolean; onGroup(id: string): void; onAgent(agent: DigitalAgent): void }
export function CoreCollaborationResults({ api, conversationId, snapshot, active, busy, onGroup, onAgent }: Props) {
  const [view, setView] = useState<{ conversationId: string; receipts: BoboCollaborationReceipt[]; error?: string }>({ conversationId, receipts: [] })
  const [restored] = useState(() => { try { return { values: readRecoveries(), error: '' } } catch { return { values: {} as Record<string, PendingRecovery>, error: '原组织恢复记录无法读取，请恢复本地存储后核对原操作。' } } })
  const [recoveries, setRecoveries] = useState(restored.values), [storageError, setStorageError] = useState(restored.error)
  const [revision, setRevision] = useState(0), [recovering, setRecovering] = useState(false), [recoveryError, setRecoveryError] = useState('')
  const pending = recoveries[conversationId]
  const identity = useRef({ conversationId, active }); identity.current = { conversationId, active }
  const locked = useRef(false)
  const persist = (original: PendingRecovery | undefined) => {
    try {
      const updated = readRecoveries()
      if (original) updated[conversationId] = original
      else delete updated[conversationId]
      localStorage.setItem(COLLABORATION_RECOVERY_KEY, JSON.stringify(updated)); setRecoveries(updated); setStorageError(''); return true
    } catch { setStorageError('原组织恢复记录无法保存，请恢复本地存储后核对原操作。'); return false }
  }
  useEffect(() => {
    identity.current = { conversationId, active }
    if (active && !locked.current) setRecovering(false)
    setRecoveryError('')
    return () => { identity.current.active = false }
  }, [conversationId, active])
  useEffect(() => {
    if (!active) return
    let disposed = false, paused = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (paused) return
      const token = ++request
      try {
        const receipts = await api.request('listBoboCollaborationOperations', { conversationId })
        if (!disposed && token === request) setView({ conversationId, receipts: coreCollaborationReceipts(receipts, conversationId) })
      } catch (failure) {
        if (!disposed && token === request) setView(previous => ({ conversationId, receipts: previous.conversationId === conversationId ? previous.receipts : [], error: errorText(failure) }))
      }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if ('conversationId' in event && event.conversationId === conversationId) {
        if (event.type === 'conversation:clearing') {
          paused = true; request++; clearTimeout(timer); timer = undefined
          setView({ conversationId, receipts: [] })
          return
        }
        if (event.type === 'conversation:cleared' || event.type === 'conversation:deleted') {
          paused = event.type === 'conversation:deleted' || Boolean(event.hidden)
          request++; clearTimeout(timer); timer = undefined
          setView({ conversationId, receipts: [] })
          return
        }
      }
      if (event.type !== 'changed' || paused) return
      request++; timer ??= setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; request++; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, active, revision])
  const current = active && view.conversationId === conversationId
  const stillCurrent = () => identity.current.active && identity.current.conversationId === conversationId
  const recover = async (receipt: BoboCollaborationReceipt, action: PendingRecovery['action']) => {
    if (!stillCurrent() || locked.current || pending || storageError) return
    const original = { operationId: receipt.id, expectedVersion: receipt.version, action }
    if (!persist(original)) return
    locked.current = true; setRecovering(true); setRecoveryError('')
    try {
      if (action === 'start') await api.request('resumeBoboCollaborationStart', { operationId: original.operationId, expectedVersion: original.expectedVersion })
      else if (action === 'resume') await api.request('resumeBoboCollaboration', { operationId: original.operationId, expectedVersion: original.expectedVersion })
      else await api.request('abandonBoboCollaboration', { operationId: original.operationId, expectedVersion: original.expectedVersion })
      if (stillCurrent() && persist(undefined)) setRevision(value => value + 1)
    } catch (failure) { if (stillCurrent()) setRecoveryError(`结果尚未核对，请保留本次操作。${errorText(failure)}`) }
    finally { locked.current = false; if (stillCurrent()) setRecovering(false) }
  }
  const checkPending = async () => {
    if (!pending || !stillCurrent() || locked.current || storageError) return
    locked.current = true; setRecovering(true)
    try {
      const receipt = await api.request('getBoboCollaborationOperation', { operationId: pending.operationId })
      if (!stillCurrent()) return
      if (!receipt || receipt.sourceConversationId !== conversationId) throw new Error('原操作暂不可核对，请保留本次请求。')
      if (persist(undefined)) { setRecoveryError(''); setRevision(value => value + 1) }
    } catch (failure) { if (stillCurrent()) setRecoveryError(`结果尚未核对，请保留本次操作。${errorText(failure)}`) }
    finally { locked.current = false; if (stillCurrent()) setRecovering(false) }
  }
  if (!current || !view.receipts.length && !view.error && !pending && !storageError) return null
  return <section className="mx-auto w-full max-w-[760px] space-y-3 px-4 py-3" aria-label="群协作组织结果">
    {view.error && <><Banner>组织结果暂不可核对：{view.error}</Banner><Button variant="ghost" size="sm" disabled={busy || recovering} onClick={() => setRevision(value => value + 1)}>核对组织结果</Button></>}
    {recoveryError && <Banner>{recoveryError}</Banner>}
    {storageError && <Banner>{storageError}</Banner>}
    {pending && <Button variant="outline" size="sm" disabled={busy || recovering || Boolean(storageError)} onClick={() => void checkPending()}>核对原操作</Button>}
    {view.receipts.map(receipt => {
      const objects = collaborationObjects(receipt, snapshot), recoverable = receipt.status === 'interrupted' || receipt.status === 'needs_attention'
      return <Card key={receipt.id} className="gap-0 p-4" data-collaboration-operation={receipt.id}><CardContent className="space-y-3 p-0">
        {receipt.status === 'committed' ? <>
          <p>{receipt.mode === 'employee_creation' ? '员工已创建' : '协作群已组织'}</p>
          {receipt.mode !== 'employee_creation' && (objects.group ? <div className="flex flex-wrap items-center gap-3"><p className="min-w-0 break-words">群聊：{objects.group.title}</p><Button size="sm" disabled={busy} onClick={() => { if (stillCurrent()) onGroup(objects.group!.id) }}>进入群聊</Button></div> : <p>群聊当前不可用，可能已解散或移除。</p>)}
          {receipt.mode === 'organize_and_execute' && <p className="text-sm text-muted-foreground">群目标已公开，实际进展和交付请进入群聊查看。</p>}
          {receipt.mode === 'organize_and_execute' && (receipt.startStatus === 'pending' || receipt.startStatus === 'interrupted') && <div className="space-y-2"><p role="status" className="text-sm text-muted-foreground">首次群工作尚未开始或已中断。</p><Button size="sm" disabled={busy || recovering || Boolean(pending) || Boolean(storageError)} onClick={() => void recover(receipt, 'start')}>继续原群工作</Button></div>}
          <ul className="space-y-2">{objects.employees.map(employee => <li key={employee.id} className="flex flex-wrap items-center gap-3">
            {employee.current ? <Button variant="outline" size="sm" disabled={busy} aria-label={`查看 ${employee.current.name} 的员工资料`} onClick={() => { if (stillCurrent()) onAgent(employee.current!) }}>{employee.current.name}</Button> : <span>{employee.name}（员工已删除）</span>}
            <span className="text-sm text-muted-foreground">{employee.source}</span>
          </li>)}</ul>
        </> : <>
          <p role="status">{receipt.status === 'cancelled' ? '组织已停止' : '组织尚未完成'}</p>
          {receipt.error && <p className="break-words text-sm text-muted-foreground">{receipt.error}</p>}
          {recoverable && <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || recovering || Boolean(pending) || Boolean(storageError)} onClick={() => void recover(receipt, 'resume')}>继续原组织</Button><Button variant="outline" size="sm" disabled={busy || recovering || Boolean(pending) || Boolean(storageError)} onClick={() => void recover(receipt, 'abandon')}>放弃原组织</Button></div>}
        </>}
      </CardContent></Card>
    })}
  </section>
}
