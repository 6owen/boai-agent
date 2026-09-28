/*
 * [INPUT]: 待清理会话、删除标记、宿主清理回调、统一 AlertDialog 与 mutation 状态。
 * [OUTPUT]: 会话列表与标题菜单共用的清空/删除确认，保留完整影响说明、处理中保护与失败反馈。
 * [POS]: 会话私有确认组件；只在确认后调用已有清理能力。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Conversation } from '@shared/domain'
import { Banner, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog'

interface Props {
  target: { conversation: Conversation; hide: boolean } | null; busy: boolean
  onClose(): void; onClear(id: string, hide: boolean): Promise<void>
}

export function ConversationHistoryDialog({ target, busy, onClose, onClear }: Props) {
  const mutation = useMutation()
  const close = () => { if (!mutation.busy) { mutation.setError(''); onClose() } }
  return <AlertDialog open={Boolean(target)} onOpenChange={open => { if (!open) close() }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{target?.hide ? '删除会话' : '清空聊天记录'}？</AlertDialogTitle>
        <AlertDialogDescription>将永久删除“{target?.conversation.title}”的聊天记录、任务记录、会话记忆及专属文件，无法恢复。{target?.hide ? '同时移出会话列表，员工和群配置保留在通讯录。' : '会话和成员配置会保留。'}</AlertDialogDescription>
      </AlertDialogHeader>
      {mutation.error && <Banner>{mutation.error}</Banner>}
      <AlertDialogFooter>
        <Button variant="secondary" disabled={mutation.busy} onClick={close}>取消</Button>
        <Button variant="destructive" disabled={busy || mutation.busy} onClick={() => { if (target) void mutation.run(async () => { await onClear(target.conversation.id, target.hide); onClose() }) }}>{mutation.busy ? '正在清理…' : target?.hide ? '删除会话及记录' : '确认清空'}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
