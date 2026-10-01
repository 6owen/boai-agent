/*
 * [INPUT]: 明确核心会话、共享标题长度上限、标题保存回调与统一 Dialog/Input/mutation。
 * [OUTPUT]: 列表编辑图标/右键/更多及聊天标题菜单共用标题弹窗，仅标题与输入而无重复字段标签，保留输入访问名、非空有界输入、取消零提交、处理中锁定和失败保留草稿。
 * [POS]: 会话页面私有标题编辑；持久化交给 Shell，仅编辑指定会话标题。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { Conversation } from '@shared/domain'
import { CONVERSATION_TITLE_MAX_LENGTH } from '@shared/domain/conversation-list'
import { Banner, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function ConversationTitleDialog({ conversation, busy, onSave, onClose }: {
  conversation: Conversation; busy: boolean
  onSave(id: string, title: string): Promise<void>; onClose(): void
}) {
  const [title, setTitle] = useState(conversation.title)
  const mutation = useMutation()
  const close = () => { if (!mutation.busy) onClose() }
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent showCloseButton={false}>
      <form className="grid gap-4" onSubmit={event => {
        event.preventDefault()
        if (busy || mutation.busy || !title.trim()) return
        void mutation.run(async () => { await onSave(conversation.id, title.trim()); onClose() })
      }}>
        <DialogHeader><DialogTitle>编辑标题</DialogTitle></DialogHeader>
        <Input aria-label="会话标题" autoFocus value={title} maxLength={CONVERSATION_TITLE_MAX_LENGTH} disabled={mutation.busy} onFocus={event => event.currentTarget.select()} onChange={event => setTitle(event.target.value)} />
        {mutation.error && <Banner>{mutation.error}</Banner>}
        <DialogFooter variant="plain">
          <Button variant="secondary" disabled={mutation.busy} onClick={close}>取消</Button>
          <Button type="submit" disabled={busy || mutation.busy || !title.trim()}>{mutation.busy ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
