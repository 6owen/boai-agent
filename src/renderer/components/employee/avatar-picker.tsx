/*
 * [INPUT]: 个人/员工头像值、内置 SVG、浏览器本地图片选择与统一 Popover/Button。
 * [OUTPUT]: 共用个人/员工头像选择，个人默认 SVG 与旧文字值同样选中；上传仅最新选择可回填；图片居中裁成 256px PNG，失败恢复焦点，保存前只更新表单。
 * [POS]: 个人资料和新建/编辑员工共用的头像控件，不直接修改持久数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { UserAvatar } from '@/components/common/user-avatar'
import { defaultUserAvatar, type UserAvatar as UserAvatarValue } from '@shared/domain/profile'
import { useEffect, useRef, useState } from 'react'
import { avatarPresets, AVATAR_IMAGE_MAX_LENGTH, defaultAvatar, type AgentAvatar } from '@shared/domain/avatars'
import { Avatar, Banner, errorText } from '@/components/common'
import { Pencil, Upload } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'

export function AvatarPicker({ value, name, seed = name, disabled = false, onChange, onBusyChange, personal = false, onReset }: {
  personal?: boolean; onReset?: () => void; value?: UserAvatarValue; name: string; seed?: string; disabled?: boolean
  onChange: (avatar: AgentAvatar) => void; onBusyChange: (busy: boolean) => void
}) {
  const [open, setOpen] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null), uploadButton = useRef<HTMLButtonElement>(null), mounted = useRef(true), selection = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selection.current++ } }, [])
  useEffect(() => {
    if (open && error && !uploading) uploadButton.current?.focus()
  }, [open, error, uploading])
  const selected = value?.kind === 'image' ? undefined : value?.kind === 'preset' ? value.id : personal ? defaultUserAvatar.id : defaultAvatar(seed)
  const upload = async (file: File) => {
    if (disabled) return
    const ticket = ++selection.current
    setError(''); setUploading(true); onBusyChange(true)
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPG 或 WebP 图片。')
      if (file.size > 5 * 1024 * 1024) throw new Error('图片不能超过 5 MB，请选择较小的图片。')
      const bitmap = await createImageBitmap(file).catch(() => { throw new Error('无法读取这张图片，请换一张试试。') })
      try {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256
        const context = canvas.getContext('2d')
        if (!context) throw new Error('图片处理失败，请重试。')
        const edge = Math.min(bitmap.width, bitmap.height)
        context.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, 256, 256)
        const dataUrl = canvas.toDataURL('image/png')
        if (dataUrl.length > AVATAR_IMAGE_MAX_LENGTH) throw new Error('图片内容过大，请换一张试试。')
        if (mounted.current && ticket === selection.current) { onChange({ kind: 'image', dataUrl }); setOpen(false) }
      } finally { bitmap.close() }
    } catch (error) { if (mounted.current && ticket === selection.current) { setError(errorText(error)); setOpen(true) } }
    finally { if (mounted.current && ticket === selection.current) { setUploading(false); onBusyChange(false) } }
  }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button variant="ghost" size="content" className="avatar-picker-trigger" disabled={disabled || uploading} aria-label={personal ? '更换个人头像' : '更换员工头像'} title="更换头像" />}>
      {personal ? <UserAvatar profile={{ displayName: name, avatar: value ?? defaultUserAvatar }} /> : <Avatar name={name} seed={seed} avatar={value?.kind === 'text' ? undefined : value} />}<span className="avatar-edit-badge"><Pencil /></span>
    </PopoverTrigger>
    <input ref={input} type="file" hidden aria-label={personal ? '上传个人头像' : '上传员工头像'} accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} />
    <PopoverContent className="w-[284px] max-w-[calc(100vw-32px)]" sideOffset={8}>
      <PopoverTitle>{personal ? '选择个人头像' : '选择员工头像'}</PopoverTitle>
      <div className="avatar-presets" role="group" aria-label="内置头像">{avatarPresets.map(preset => <Button key={preset.id} variant="ghost" size="content" className="avatar-preset" disabled={disabled || uploading} aria-label={preset.name} aria-pressed={selected === preset.id} onClick={() => { setError(''); onChange({ kind: 'preset', id: preset.id }); setOpen(false) }}><Avatar name={preset.name} avatar={{ kind: 'preset', id: preset.id }} /></Button>)}</div>
      {error && <Banner>{error}</Banner>}
      <Button ref={uploadButton} variant="secondary" size="sm" disabled={disabled || uploading} onClick={() => input.current?.click()}><Upload />{uploading ? '正在处理图片…' : '上传本地图片'}</Button>
      {personal && <Button variant="ghost" size="sm" disabled={disabled || uploading} onClick={() => { onReset?.(); setOpen(false) }}>恢复默认头像</Button>}
      <PopoverDescription>PNG、JPG、WebP，最大 5 MB，自动居中裁剪。</PopoverDescription>
    </PopoverContent>
  </Popover>
}
