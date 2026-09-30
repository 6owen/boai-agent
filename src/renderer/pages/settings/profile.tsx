/*
 * [INPUT]: 已提交个人资料、活跃页面标记、变更事件和只读活动接口。
 * [OUTPUT]: 直接选头像/恢复默认 SVG 并保存、姓名悬停采用按钮背景且无编辑图标、点击编辑与焦点恢复、全屏分享入口；统计按用量/峰值/任务及最长/当前连续排序，配合上三下二响应式卡片；上下洞察 Card，隐藏时暂停读取。
 * [POS]: 复用设置文档布局的个人资料页面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { LocalUserProfile, ProfileActivity, UserAvatar } from '@shared/domain/profile'
import { defaultUserAvatar, defaultUserProfile } from '@shared/domain/profile'
import { AvatarPicker } from '@/components/employee/avatar-picker'
import { Banner, errorText, Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Pencil, Share, Sparkles } from '@/components/icons'
import { ProfileEditor } from './profile-editor'
import { ProfileShare } from './profile-share'
import { ActivityChart, profileActivityRange, tokenText } from './profile-activity'

export function ProfileSettings({ api, profile = defaultUserProfile, active, refresh, onSkill }: { api: DesktopApi; profile?: LocalUserProfile; active: boolean; refresh: () => Promise<void>; onSkill: (id: string) => void }) {
  const [sharing, setSharing] = useState(false), [uploading, setUploading] = useState(false), [editing, setEditing] = useState(false), [activity, setActivity] = useState<ProfileActivity>(), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const editButton = useRef<HTMLButtonElement>(null), shareButton = useRef<HTMLButtonElement>(null)
  const openEditor = (trigger: HTMLButtonElement) => { editButton.current = trigger; setEditing(true) }
  const { busy: avatarBusy, error: avatarError, run: saveAvatar } = useMutation()
  const selectAvatar = (avatar: UserAvatar) => void saveAvatar(async () => {
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
  const metrics = activity ? [
    { label: '累计 Token', value: `${activity.incomplete && activity.totalTokens !== null ? '已知 ' : ''}${tokenText(activity.totalTokens)}`, hint: '全部本机保留记录中的已知用量' },
    { label: '峰值 Token', value: tokenText(activity.peak?.tokens ?? null), hint: activity.peak ? `单日峰值 · ${activity.peak.date}${activity.incomplete ? ' · 部分已知' : ''}` : '单日峰值暂无记录' },
    { label: '最长任务', value: activity.longestTaskMs === null ? '暂无记录' : `${Math.round(activity.longestTaskMs / 1000).toLocaleString()} 秒`, hint: '已结束根工作的执行区间并集，不含排队与等待；不代表已交付' },
    { label: '最长连续', value: activity.longestStreak === null ? '未记录' : `${activity.longestStreak} 天`, hint: '本机保留记录中的最长连续使用天数' },
    { label: '当前连续', value: activity.currentStreak === null ? '未记录' : `${activity.currentStreak} 天`, hint: '按本人主动发送消息的自然日计算' },
  ] : []
  return <section className="settings-document profile-document">
    <header className="settings-document-heading"><h2>个人资料</h2><div className="button-row"><Button ref={shareButton} variant="ghost" size="sm" disabled={!activity || avatarBusy || uploading} onClick={() => setSharing(true)}><Share />分享</Button><Button variant="secondary" size="sm" disabled={avatarBusy || uploading} onClick={event => openEditor(event.currentTarget)}><Pencil />编辑</Button></div></header>
    <div className="profile-identity"><AvatarPicker personal value={profile.avatar} name={profile.displayName} disabled={avatarBusy} onBusyChange={setUploading} onChange={selectAvatar} onReset={() => selectAvatar(defaultUserAvatar)} /><h1 title={profile.displayName}><Button variant="ghost" size="content" className="profile-name-edit" aria-label="编辑显示名称" disabled={avatarBusy || uploading} onClick={event => openEditor(event.currentTarget)}>{profile.displayName}</Button></h1>{profile.username && <p>@{profile.username}</p>}</div>
    {avatarError && <Banner>{avatarError}</Banner>}
    {error && <Banner>{error}<Button variant="link" onClick={() => setRetry(value => value + 1)}>重试</Button></Banner>}
    {!activity && !error && <Loading>正在读取本机活动…</Loading>}
    {activity && <><Card className="profile-metrics grid gap-0 p-0" aria-label="个人活动摘要">{metrics.map(metric => <div key={metric.label} title={metric.hint}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</Card>
      <ActivityChart activity={activity} />
      <div className="profile-insights"><section><h3>活动洞察</h3><Card className="profile-insight-card"><CardContent><dl className="soft-divide-y">
        <div><dt>快速模式</dt><dd>暂不支持</dd></div>
        <div><dt>最常用的推理强度</dt><dd>{activity.thinking ? `${({ off: '关闭', low: '低', high: '高', max: '最高' } as Record<string, string>)[activity.thinking.level] ?? activity.thinking.level} · ${Math.round(activity.thinking.count / activity.thinking.samples * 100)}%` : '暂无记录'}</dd></div>
        {activity.thinking && <p className="field-hint">基于 {activity.thinking.samples} 次已记录实际强度的调用</p>}
        <div><dt>已探索技能数</dt><dd>{activity.exploredSkills}</dd></div><div><dt>使用的技能总数</dt><dd>{activity.skillActivations} 次</dd></div><div><dt>聊天总数</dt><dd>{activity.chats}</dd></div>
      </dl></CardContent></Card></section><section><h3>最常用的技能</h3><Card className="profile-insight-card"><CardContent>{activity.skills.length ? <ol className="profile-skills">{activity.skills.map(skill => <li key={skill.id}><Button variant="ghost" size="content" disabled={!skill.available} onClick={() => onSkill(skill.id)}><Sparkles /><span>{skill.name}<small>{skill.count} 次使用{!skill.available ? ' · 已移除' : ''}</small></span></Button></li>)}</ol> : <p className="text-muted-foreground">还没有已记录的技能激活</p>}</CardContent></Card></section></div>
    </>}
    {sharing && activity && <ProfileShare api={api} profile={profile} activity={activity} onClose={() => setSharing(false)} finalFocus={shareButton} />}
    {editing && <ProfileEditor profile={profile} api={api} refresh={refresh} onClose={() => setEditing(false)} finalFocus={editButton} />}
  </section>
}
