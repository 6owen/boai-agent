/*
 * [INPUT]: 已提交资料、同一活动快照、离线头像与当前全局主题。
 * [OUTPUT]: 全屏活动分享卡片、统一 SVG 默认/损坏头像回退、同一预览的 PNG 复制和下载；不创建公开链接或自动发布。
 * [POS]: 个人资料分享弹窗；画布既是预览也是导出源，不依赖截图服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { LocalUserProfile, ProfileActivity } from '@shared/domain/profile'
import { userAvatarSource } from '@/assets/avatars'
import { Banner, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Copy, Download, X } from '@/components/icons'
import { activityThresholds, mondayOffset, tokenText } from './profile-activity'

async function paintShareCard(canvas: HTMLCanvasElement, profile: LocalUserProfile, activity: ProfileActivity, current: () => boolean) {
  await document.fonts.ready
  const avatar = new Image(); avatar.src = userAvatarSource(profile.avatar)
  try { await avatar.decode() } catch { avatar.src = userAvatarSource(); await avatar.decode() }
  if (!current()) return
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法生成活动图片，请重试。')
  const style = getComputedStyle(canvas), color = (name: string) => style.getPropertyValue(name).trim(), font = style.fontFamily
  const box = (x: number, y: number, width: number, height: number, radius: number, fill: string) => {
    context.fillStyle = fill; context.beginPath(); context.roundRect(x, y, width, height, radius); context.fill()
  }
  const text = (value: string, x: number, y: number, size: number, fill: string, weight = 400, maxWidth?: number) => {
    context.font = `${weight} ${size}px ${font}`; context.fillStyle = fill
    if (maxWidth) while (context.measureText(value).width > maxWidth && value.length > 2) value = value.slice(0, -2) + '…'
    context.fillText(value, x, y)
  }
  const foreground = color('--foreground'), muted = color('--muted-foreground'), primary = color('--primary')
  context.clearRect(0, 0, canvas.width, canvas.height)
  box(0, 0, 1280, 660, 0, color('--card'))
  box(64, 64, 104, 104, 52, color('--accent'))
  context.save(); context.beginPath(); context.arc(116, 116, 52, 0, Math.PI * 2); context.clip(); context.drawImage(avatar, 64, 64, 104, 104); context.restore()
  text(profile.displayName, 198, profile.username ? 110 : 132, 38, foreground, 600, 730)
  if (profile.username) text(`@${profile.username}`, 198, 151, 27, muted, 400, 730)
  context.textAlign = 'right'; text('BoAI', 1216, 129, 38, muted, 600); context.textAlign = 'left'
  const leading = activity.days.length ? mondayOffset(activity.days[0]!.date) : 0
  const columns = Math.max(1, Math.ceil((activity.days.length + leading) / 7)), gap = 5, cell = Math.min(30, (1152 - (columns - 1) * gap) / columns)
  const thresholds = activityThresholds(activity.days)
  activity.days.forEach((day, index) => {
    const offset = index + leading, x = 64 + Math.floor(offset / 7) * (cell + gap), y = 214 + offset % 7 * (cell + gap)
    box(x, y, cell, cell, 4, color('--muted'))
    if (day.tokens !== null && day.tokens > 0) {
      const level = thresholds.findIndex(value => day.tokens! <= value)
      context.globalAlpha = [.25, .45, .7, 1][level] ?? 1; box(x, y, cell, cell, 4, primary); context.globalAlpha = 1
    }
  })
  const compact = (value: number | null) => value === null ? tokenText(null) : new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  const metrics = [
    [compact(activity.totalTokens), '累计 Token'], [compact(activity.peak?.tokens ?? null), '峰值日'],
    [activity.currentStreak === null ? '暂无记录' : `${activity.currentStreak} 天`, '当前连续天数'],
    [activity.longestStreak === null ? '暂无记录' : `${activity.longestStreak} 天`, '最长连续天数'],
  ]
  metrics.forEach(([value, label], index) => {
    const x = 64 + index * 288
    if (index) box(x, 477, 1, 78, 0, color('--border'))
    context.textAlign = 'center'; text(value!, x + 144, 503, 34, foreground, 600); text(label!, x + 144, 548, 23, muted)
  })
  text(activity.incomplete ? '本机保留记录 · 部分用量未记录' : '基于本机保留记录', 640, 614, 18, muted)
  context.textAlign = 'left'
}

export function ProfileShare({ profile, activity, onClose, finalFocus }: { profile: LocalUserProfile; activity: ProfileActivity; onClose: () => void; finalFocus: RefObject<HTMLButtonElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null), [blob, setBlob] = useState<Blob>(), [imageError, setImageError] = useState(''), [notice, setNotice] = useState('')
  const { busy, error, run } = useMutation()
  useEffect(() => {
    let current = true
    setBlob(undefined); setImageError(''); setNotice('')
    const render = async () => {
      try {
        await paintShareCard(canvas.current!, profile, activity, () => current)
        if (current) canvas.current!.toBlob(result => { if (current) { if (result) setBlob(result); else setImageError('生成图片失败，请重新打开分享。') } }, 'image/png')
      } catch { if (current) setImageError('生成图片失败，请重新打开分享。') }
    }
    void render(); return () => { current = false }
  }, [profile, activity])
  const save = () => void run(async () => {
    if (!blob) return
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `BoAI-活动-${activity.range.to}.png`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  const copy = () => void run(async () => {
    if (!blob) return
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); setNotice('图片已复制')
  })
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="profile-share-dialog bg-background fixed top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none" showCloseButton={false} finalFocus={finalFocus}>
      <DialogClose render={<Button variant="ghost" size="icon-lg" className="profile-share-close" aria-label="关闭分享" />}><X size={24} /></DialogClose>
      <div className="profile-share-body">
        <DialogTitle className="text-3xl font-medium">分享你的活动</DialogTitle>
        <Card className="profile-share-card gap-0 p-0"><canvas ref={canvas} width={1280} height={660} role="img" aria-label={`${profile.displayName}的 BoAI 活动，累计 ${tokenText(activity.totalTokens)} Token${activity.incomplete ? '，部分用量未记录' : ''}`} /></Card>
        {(imageError || error) && <Banner>{imageError || error}</Banner>}
        <div className="profile-share-actions">
          <div><Button variant="ink" size="icon-lg" disabled={!blob || busy} aria-label="复制活动图片" onClick={copy}><Copy size={22} /></Button><span>复制图片</span></div>
          <div><Button variant="ink" size="icon-lg" disabled={!blob || busy} aria-label="保存活动图片" onClick={save}><Download size={22} /></Button><span>保存图片</span></div>
        </div>
        <p className="profile-share-notice" role="status">{notice}</p>
      </div>
    </DialogContent>
  </Dialog>
}
