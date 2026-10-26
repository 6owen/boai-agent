/*
 * [INPUT]: 已提交的本机个人资料快照、个人资料导航回调与共享 UserAvatar/Popover/Button/Separator。
 * [OUTPUT]: 点击本人消息的圆角方形头像查看当前姓名和用户名，底部按钮关闭浮层并进入个人资料，保留稳定入口焦点。
 * [POS]: 单聊/群聊共用的本人资料浮层，仅读取当前资料，不改写消息身份或历史。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useRef, useState } from 'react'
import { defaultUserProfile, type LocalUserProfile } from '@boai/shared/domain/profile'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

export function UserInfoPopover({ profile = defaultUserProfile, onProfile }: { profile?: LocalUserProfile; onProfile(): void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button ref={trigger} variant="ghost" size="icon" className="message-avatar-trigger user-avatar-trigger" aria-label={`查看 ${profile.displayName} 的个人资料`} title={profile.displayName} />}>
      <UserAvatar profile={profile} />
    </PopoverTrigger>
    <PopoverContent side="left" align="start" className="agent-info-popover user-info-popover w-72 max-w-[calc(100vw-24px)] gap-3 p-4">
      <div className="agent-info-heading">
        <UserAvatar profile={profile} />
        <div className="agent-info-identity"><PopoverTitle>{profile.displayName}</PopoverTitle>{profile.username && <PopoverDescription>@{profile.username}</PopoverDescription>}</div>
      </div>
      <Separator />
      <Button variant="secondary" size="sm" onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); onProfile() }}>个人资料</Button>
    </PopoverContent>
  </Popover>
}
