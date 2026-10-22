/*
 * [OUTPUT]: 单条/批量确认全部完成后仅反馈一次对应成功；失败保留进度，不提前报全部成功。
 * [INPUT]: 待清理单个会话或已固定的核心助手会话集合、删除标记、宿主清理回调与统一 AlertDialog。
 * [OUTPUT]: 列表/标题共用清空或删除确认；批量逐项沿原清理能力执行，失败即停并保留已完成进度，显式继续不重清已完成项。
 * [POS]: 会话私有确认组件；只在确认后调用已有清理能力。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import { toast } from 'sonner'
import type { Conversation } from '@shared/domain'
import { Banner, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog'

export type ConversationHistoryTarget = { hide: boolean } & (
  { conversation: Conversation } | { conversations: Conversation[]; agentName: string }
)
interface Props {
  target: ConversationHistoryTarget | null; busy: boolean
  onClose(): void; onClear(id: string, hide: boolean): Promise<void>
}

export function ConversationHistoryDialog({ target, busy, onClose, onClear }: Props) {
  const mutation = useMutation()
  const [progress, setProgress] = useState<{ target: ConversationHistoryTarget | null; completed: number }>({ target: null, completed: 0 })
  const completed = progress.target === target ? progress.completed : 0
  const batch = target && 'conversations' in target ? target : null
  const conversations = target ? 'conversation' in target ? [target.conversation] : target.conversations : []
  const title = batch ? batch.hide ? '删除所有会话' : '清空所有记录' : target?.hide ? '删除会话' : '清空聊天记录'
  const close = () => { if (!mutation.busy) { mutation.setError(''); onClose() } }
  return <AlertDialog open={Boolean(target)} onOpenChange={open => { if (!open) close() }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}？</AlertDialogTitle>
        <AlertDialogDescription>将永久删除{batch ? `“${batch.agentName}”下全部 ${conversations.length} 个会话` : `“${target && 'conversation' in target ? target.conversation.title : ''}”`}的聊天记录、任务记录、会话记忆及专属文件，无法恢复。{target?.hide ? '同时移出会话列表，员工和群配置保留在通讯录。' : '会话和成员配置会保留。'}</AlertDialogDescription>
      </AlertDialogHeader>
      {batch && completed > 0 && <p role="status" className="text-sm text-muted-foreground">已清理 {completed} / {conversations.length} 个会话。</p>}
      {mutation.error && <Banner>{mutation.error}</Banner>}
      <AlertDialogFooter>
        <Button variant="secondary" disabled={mutation.busy} onClick={close}>取消</Button>
        <Button variant="destructive" disabled={busy || mutation.busy || !conversations.length} onClick={() => { if (target) void mutation.run(async () => {
          for (let index = completed; index < conversations.length; index++) {
            await onClear(conversations[index].id, target.hide)
            setProgress({ target, completed: index + 1 })
          }
          toast.success(target.hide ? batch ? `已删除 ${conversations.length} 个会话` : '会话已删除' : batch ? '所有聊天记录已清空' : '聊天记录已清空')
          onClose()
        }) }}>{mutation.busy ? '正在清理…' : completed > 0 ? '继续清理剩余会话' : target?.hide ? batch ? '删除所有会话及记录' : '删除会话及记录' : '确认清空'}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
