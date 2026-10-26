/*
 * [INPUT]: 当前核心会话的工作身份、团队创建回执 IPC、页面活跃状态与群聊快照。
 * [OUTPUT]: 仅当前工作归属的创建结果、最新群名导航和显式继续/放弃入口；隐藏页面暂停读取，重启不自动恢复。
 * [POS]: 核心助手聊天内的团队交付与文件操作恢复；内部版本只供条件提交，不展示团队草稿。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { ConversationDetail, Snapshot } from '@boai/shared/domain'
import type { TeamCreationOperation } from '@boai/shared/domain/team-creation'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, errorText, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  api: DesktopApi
  detail: ConversationDetail
  snapshot: Snapshot
  active: boolean
  busy: boolean
  onGroup(id: string): void
}

export function CoreTeamResults({ api, detail, snapshot, active, busy, onGroup }: Props) {
  const requestIds = (detail.workItems ?? []).filter(work => work.conversationId === detail.conversation.id).map(work => `core-team:${work.id}`).sort()
  const workIdentity = requestIds.join('\n')
  const [operations, setOperations] = useState<TeamCreationOperation[]>([]), [readError, setReadError] = useState(''), [revision, setRevision] = useState(0)
  const mutation = useMutation()
  useEffect(() => {
    if (!active || !workIdentity) return
    let disposed = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const identities = new Set(workIdentity.split('\n'))
    const load = async () => {
      const token = ++request
      try {
        const result = await api.request('listTeamCreationRecovery', undefined)
        if (!disposed && token === request) { setOperations(result.operations.filter(operation => identities.has(operation.requestId))); setReadError('') }
      } catch (failure) { if (!disposed && token === request) setReadError(errorText(failure)) }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if (event.type !== 'changed') return
      if (!timer) timer = setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, active, workIdentity, revision])
  const update = (operation: TeamCreationOperation, abandon: boolean) => { void mutation.run(async () => {
    if (abandon) {
      const latest = await api.request('getTeamDraft', { draftId: operation.draftId })
      await api.request('abandonTeamDraft', { draftId: operation.draftId, expectedVersion: latest.draft.version })
    } else await api.request('resumeTeamCreation', { operationId: operation.id, expectedVersion: operation.version })
    setRevision(value => value + 1)
  }) }
  const current = operations.filter(operation => requestIds.includes(operation.requestId) && operation.status !== 'cancelled')
  if (!workIdentity || !current.length && !readError) return null
  return <section className="mx-auto w-full max-w-[760px] space-y-3 px-4 py-3" aria-label="团队创建结果">
    {readError && <Banner>{readError}</Banner>}
    {mutation.error && <Banner>{mutation.error}</Banner>}
    {current.map(operation => {
      const group = snapshot.conversations.find(conversation => conversation.id === operation.conversationId && conversation.kind === 'group')
      const recoverable = operation.status === 'interrupted' || operation.status === 'needs_attention'
      return <Card key={operation.id} className="gap-0 p-4"><CardContent className="space-y-3 p-0">
        {operation.status === 'committed' ? <>
          <p>团队已创建</p>
          {group ? <><p>群聊：{group.title}</p><Button size="sm" onClick={() => onGroup(group.id)}>进入群聊</Button></> : <p>群聊已移除</p>}
        </> : <>
          <p role="status">团队创建尚未完成</p>
          {operation.error && <p className="break-words text-muted-foreground">{operation.error}</p>}
          {recoverable && <div className="flex flex-wrap gap-2">
            {!operation.cancelRequested && <Button size="sm" disabled={busy || mutation.busy} onClick={() => update(operation, false)}>继续创建</Button>}
            <Button variant="outline" size="sm" disabled={busy || mutation.busy} onClick={() => update(operation, true)}>放弃创建</Button>
          </div>}
        </>}
      </CardContent></Card>
    })}
  </section>
}
