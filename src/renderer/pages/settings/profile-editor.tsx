/*
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: 已提交本机资料、唯一 IPC、共享头像选择、连接横向卡片表单和草稿守卫。
 * [OUTPUT]: 520px 无副标题资料弹窗；主题标准字号/控件高度、默认颜色卡片/横向字段/全局分隔线及卡片内操作栏；名称/用户名/头像单事务编辑、恢复默认小老虎、冲突保留和重载；上传/保存互斥。
 * [POS]: 设置个人资料的唯一编辑弹窗。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useContext, useEffect, useId, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import { defaultUserAvatar, type LocalUserProfile } from '@shared/domain/profile'
import { AvatarPicker } from '@/components/employee/avatar-picker'
import { Banner, GuardContext, useDirty, useMutation } from '@/components/common'
import { AtSign, Pencil } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConnectionForm, ConnectionSettingRow } from './connection-layout'

export function ProfileEditor({ profile, api, refresh, onClose, finalFocus }: { profile: LocalUserProfile; api: DesktopApi; refresh: () => Promise<void>; onClose: () => void; finalFocus: React.RefObject<HTMLButtonElement | null> }) {
  const [draft, setDraft] = useState(() => structuredClone(profile)), [uploading, setUploading] = useState(false), [validation, setValidation] = useState('')
  const { busy, error, run } = useMutation(), guard = useContext(GuardContext), clean = useDirty(draft)
  const nameInput = useRef<HTMLInputElement>(null), busyRef = useRef(false)
  const fieldId = useId()
  useEffect(() => { busyRef.current = busy || uploading }, [busy, uploading])
  const close = () => { if (!busyRef.current) guard.navigate(onClose, { resetOnDiscard: false }) }
  const conflict = profile.revision !== draft.revision
  const reload = () => guard.navigate(() => { setDraft(structuredClone(profile)); setValidation(''); onClose() }, { resetOnDiscard: false })
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className="profile-editor w-[520px] max-w-[calc(100vw-32px)] sm:max-w-[520px]" initialFocus={nameInput} finalFocus={finalFocus} showCloseButton={!busy && !uploading}>
      <DialogHeader><DialogTitle>编辑个人资料</DialogTitle></DialogHeader>
      <div className="profile-editor-avatar"><AvatarPicker personal value={draft.avatar} name={draft.displayName} disabled={busy} onChange={avatar => setDraft(current => ({ ...current, avatar }))} onBusyChange={setUploading} onReset={() => setDraft(current => ({ ...current, avatar: defaultUserAvatar }))} /></div>
      {validation && <div id={`${fieldId}-validation`}><Banner>{validation}</Banner></div>}
      {error && <Banner>{error}</Banner>}
      {conflict && <><Banner>资料已更新，当前草稿仍保留。</Banner><Button type="button" variant="link" onClick={reload}>重新载入已保存资料</Button></>}
      <ConnectionForm muted={false} disabled={busy} onSubmit={event => { event.preventDefault(); if (busyRef.current) return
        const displayName = draft.displayName.trim(), username = draft.username?.trim() || null
        if ([...displayName].length < 1 || [...displayName].length > 40) { setValidation('显示名称需要 1–40 个字符。'); nameInput.current?.focus(); return }
        if (username && !/^[A-Za-z0-9_-]{3,32}$/.test(username)) { setValidation('用户名需要 3–32 位字母、数字、下划线或连字符。'); return }
        setValidation(''); busyRef.current = true
        void run(async () => { await api.request('updateUserProfile', { expectedRevision: draft.revision, displayName, username, avatar: draft.avatar }); clean(); await refresh(); guard.saved(onClose); onClose() }).finally(() => { busyRef.current = false })
      }} footer={<div className="connection-editor-actions"><Button type="button" variant="secondary" disabled={busy || uploading} onClick={close}>取消</Button><Button type="submit" disabled={busy || uploading || conflict}>{busy ? '正在保存…' : '保存'}</Button></div>}>
        <ConnectionSettingRow label="显示名称" htmlFor={`${fieldId}-name`} icon={<Pencil />} hint="1–40 个字符">
          <Input id={`${fieldId}-name`} className="text-sm" ref={nameInput} required value={draft.displayName} aria-invalid={!!validation} aria-describedby={validation ? `${fieldId}-validation` : undefined} onChange={event => setDraft(current => ({ ...current, displayName: event.target.value }))} />
        </ConnectionSettingRow>
        <ConnectionSettingRow label="用户名" htmlFor={`${fieldId}-username`} icon={<AtSign />} hint="可选，3–32 位英文字母、数字、下划线或连字符">
          <Input id={`${fieldId}-username`} className="text-sm" value={draft.username ?? ''} maxLength={32} placeholder="可选" aria-invalid={!!validation} aria-describedby={validation ? `${fieldId}-validation` : undefined} onChange={event => setDraft(current => ({ ...current, username: event.target.value }))} />
        </ConnectionSettingRow>
      </ConnectionForm>
    </DialogContent>
  </Dialog>
}
