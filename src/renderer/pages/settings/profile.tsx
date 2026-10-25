/*
 * [OUTPUT]: 页面布局复用settings-layout，标题/分组留白与卡片/设置行统一，原业务回调保持。
 * [OUTPUT]: 最常用技能复用资源库SkillListItem展示行；悬停/键盘聚焦显示更多菜单，前往资源库技能列表，不在设置页打开详情。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: Token 统计、活动图与洞察卡片首帧渲染完整结构，活动数据到达前仅在数值和图格位置显示占位，避免整块内容迟到。
 * [INPUT]: 已提交个人资料、活跃页面标记、变更事件和只读活动接口。
 * [OUTPUT]: 资料页正常直接显示，点阵动画仅在分享弹窗中播放。首次权威资料快照前禁用所有编辑/头像写入入口，真实版本变化仍保留冲突保护；直接选头像/恢复默认小老虎并保存、姓名悬停采用按钮背景且无编辑图标、点击编辑与焦点恢复、全屏分享入口；统计按用量/峰值/任务及最长/当前连续排序，配合上三下二响应式卡片；上下洞察 Card，隐藏时暂停读取。
 * [POS]: 复用设置文档布局的个人资料页面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { SettingsLayout } from './settings-layout'
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { LocalUserProfile, ProfileActivity, UserAvatar } from '@shared/domain/profile'
import { defaultUserAvatar, defaultUserProfile } from '@shared/domain/profile'
import { AvatarPicker } from '@/components/employee/avatar-picker'
import { Banner, errorText, Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Share } from '@/components/icons'
import { SkillListItem } from '@/pages/library/skill-list-item'
import { ProfileEditor } from './profile-editor'
import { ProfileShare } from './profile-share'
import { ActivityChart, profileActivityRange, tokenText } from './profile-activity'

export function ProfileSettings({ api, profile: committedProfile, active, refresh, onOpenSkills }: { api: DesktopApi; profile?: LocalUserProfile; active: boolean; refresh: () => Promise<void>; onOpenSkills: () => void }) {
  const profile = committedProfile ?? defaultUserProfile, ready = Boolean(committedProfile)
  const [sharing, setSharing] = useState(false), [uploading, setUploading] = useState(false), [editing, setEditing] = useState(false), [activity, setActivity] = useState<ProfileActivity>(), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const editButton = useRef<HTMLButtonElement>(null), shareButton = useRef<HTMLButtonElement>(null)
  const openEditor = (trigger: HTMLButtonElement) => { if (ready) { editButton.current = trigger; setEditing(true) } }
  const { busy: avatarBusy, error: avatarError, run: saveAvatar } = useMutation()
  const selectAvatar = (avatar: UserAvatar) => void saveAvatar(async () => {
    if (!ready) return
    await api.request('updateUserProfile', { expectedRevision: profile.revision, displayName: profile.displayName, username: profile.username, avatar })
    await refresh()
  })
  useEffect(() => {
    if (!active) return
    let disposed = false, serial = 0, timer: ReturnType<typeof setTimeout> | undefined, currentRange = JSON.stringify(profileActivityRange())
    const load = async () => { const request = ++serial; try { const result = await api.request('getProfileActivity', profileActivityRange()); if (!disposed && request === serial) { setActivity(result); setError('') } } catch (error) { if (!disposed && request === serial) setError(errorText(error)) } }
    const schedule = () => { if (!timer) timer = setTimeout(() => { timer = undefined; void load() }, 400) }
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' || event.type === 'conversation:cleared') schedule() })
    const interval = setInterval(() => { const next = JSON.stringify(profileActivityRange()); if (next !== currentRange) { currentRange = next; schedule() } }, 30_000)
    void load()
    return () => { disposed = true; unsubscribe(); clearInterval(interval); if (timer) clearTimeout(timer) }
  }, [api, active, retry])
  const pendingActivity = !activity && !error
  const activityValue = (value: string | number | undefined) => value === undefined ? pendingActivity ? <Skeleton className="ml-auto h-[1em] w-16" aria-hidden="true" /> : '—' : value
  const metrics = [
    { label: '累计 Token', value: activity ? `${activity.incomplete && activity.totalTokens !== null ? '已知 ' : ''}${tokenText(activity.totalTokens)}` : undefined, hint: '全部本机保留记录中的已知用量' },
    { label: '峰值 Token', value: activity ? tokenText(activity.peak?.tokens ?? null) : undefined, hint: activity?.peak ? `单日峰值 · ${activity.peak.date}${activity.incomplete ? ' · 部分已知' : ''}` : '单日峰值暂无记录' },
    { label: '最长任务', value: activity ? activity.longestTaskMs === null ? '暂无记录' : `${Math.round(activity.longestTaskMs / 1000).toLocaleString()} 秒` : undefined, hint: '已结束根工作的执行区间并集，不含排队与等待；不代表已交付' },
    { label: '最长连续', value: activity ? activity.longestStreak === null ? '未记录' : `${activity.longestStreak} 天` : undefined, hint: '本机保留记录中的最长连续使用天数' },
    { label: '当前连续', value: activity ? activity.currentStreak === null ? '未记录' : `${activity.currentStreak} 天` : undefined, hint: '按本人主动发送消息的自然日计算' },
  ]
  return <SettingsLayout title="个人资料" actions={<div className="button-row"><Button ref={shareButton} variant="ghost" size="sm" disabled={!ready || !activity || avatarBusy || uploading} onClick={() => setSharing(true)}><Share />分享</Button><Button variant="secondary" size="sm" disabled={!ready || avatarBusy || uploading} onClick={event => openEditor(event.currentTarget)}><Pencil />编辑</Button></div>}  className="profile-document">
    {avatarError && <Banner>{avatarError}</Banner>}
    {error && <><Banner>{error}</Banner><Button variant="link" onClick={() => { setError(''); setRetry(value => value + 1) }}>重试</Button></>}
    <div className="profile-identity"><AvatarPicker personal value={profile.avatar} name={profile.displayName} disabled={!ready || avatarBusy} onBusyChange={setUploading} onChange={selectAvatar} onReset={() => selectAvatar(defaultUserAvatar)} /><h1 title={profile.displayName}><Button variant="ghost" size="content" className="profile-name-edit" aria-label="编辑显示名称" disabled={!ready || avatarBusy || uploading} onClick={event => openEditor(event.currentTarget)}>{profile.displayName}</Button></h1>{profile.username && <p>@{profile.username}</p>}</div>
    {!ready && <Loading>正在读取个人资料…</Loading>}
    <Card className="profile-metrics grid gap-0 p-0" aria-label="个人活动摘要" aria-busy={pendingActivity}>{metrics.map(metric => <div key={metric.label} title={metric.hint}><div className="profile-metric-value">{metric.value === undefined && pendingActivity ? <Skeleton className="h-[1em] w-16" aria-hidden="true" /> : <strong>{metric.value ?? '—'}</strong>}</div><span>{metric.label}</span></div>)}</Card>
    <ActivityChart activity={activity} loading={pendingActivity} />
    <div className="profile-insights"><section><h3>活动洞察</h3><Card className="profile-insight-card"><CardContent><dl className="soft-divide-y" aria-busy={pendingActivity}>
        <div><dt>快速模式</dt><dd>暂不支持</dd></div>
        <div><dt>最常用的推理强度</dt><dd>{activityValue(activity ? activity.thinking ? `${({ off: '关闭', low: '低', high: '高', max: '最高' } as Record<string, string>)[activity.thinking.level] ?? activity.thinking.level} · ${Math.round(activity.thinking.count / activity.thinking.samples * 100)}%` : '暂无记录' : undefined)}</dd></div>
        {activity?.thinking && <p className="field-hint">基于 {activity.thinking.samples} 次已记录实际强度的调用</p>}
        <div><dt>已探索技能数</dt><dd>{activityValue(activity?.exploredSkills)}</dd></div><div><dt>使用的技能总数</dt><dd>{activityValue(activity ? `${activity.skillActivations} 次` : undefined)}</dd></div><div><dt>聊天总数</dt><dd>{activityValue(activity?.chats)}</dd></div>
      </dl></CardContent></Card></section><section><h3>最常用的技能</h3><Card className="profile-insight-card gap-0 p-2"><CardContent className="p-0">
        {activity ? activity.skills.length ? <ol className="profile-skills">{activity.skills.map(skill => <li key={skill.id} className="skill-list-row">
          <SkillListItem displayOnly entry={{ name: skill.name, description: `${skill.count} 次使用${!skill.available ? ' · 已移除' : ''}` }} disabled={!skill.available} />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="skill-row-menu aria-expanded:opacity-100" aria-label={`${skill.name} 的操作`} />}><MoreHorizontal /></DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-[240px] p-2">
              <DropdownMenuItem className="px-2.5 py-2" onClick={onOpenSkills}>前往资源库</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>)}</ol> : <p className="p-2 text-muted-foreground">还没有已记录的技能激活</p> : pendingActivity ? <ol className="profile-skills" aria-hidden="true">{[0, 1, 2].map(index => <li key={index}>
          <div className="soft-list-row"><Skeleton className="size-[30px] shrink-0" /><span className="soft-list-row-copy"><span className="soft-list-row-title"><Skeleton className="h-[1em] w-32" /></span><span className="soft-list-row-description"><Skeleton className="h-[1em] w-20" /></span></span></div>
        </li>)}</ol> : <p className="p-2 text-muted-foreground">活动数据暂不可用</p>}
      </CardContent></Card></section></div>
    {sharing && activity && <ProfileShare api={api} profile={profile} activity={activity} onClose={() => setSharing(false)} finalFocus={shareButton} />}
    {editing && ready && <ProfileEditor profile={profile} api={api} refresh={refresh} onClose={() => setEditing(false)} finalFocus={editButton} />}
  </SettingsLayout>
}
