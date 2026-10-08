/*
 * [OUTPUT]: 逐项测试进度/成功/失败复用连接标题同行反馈；菜单支持删除本机配置并刷新列表和员工能力，保留外部程序与登录文件。
 * [OUTPUT]: 消费Shell核对的具体本机配置导航，复用原编辑向导；失效绑定显示原列表，隐藏停止读取并关闭弹窗，迟到读取不更新界面。
 * [OUTPUT]: Claude仅展示实际程序核对，区别于模型认证和业务执行。
 * [INPUT]: 已保存原生Codex/ACP配置、DesktopApi、本地品牌图标与本机Agent两步向导。
 * [OUTPUT]: 本机 Agent 列表复用向导的 Lobe 品牌匹配/默认图标，唯一扫描入口；编辑/测试菜单加宽并保持单行文字；不混入模型 API 导入，既有配置的编辑/测试共用简化向导与启动配置存储。
 * [POS]: settings 内嵌本机 Agent 分区，替代独立外部 Agent 页面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { LaunchProfile } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, useMutation } from '@/components/common'
import { Check, LoaderCircle, MoreHorizontal, Pencil, Search, Terminal, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LocalConnections } from './local-connections'
import { AgentBrandIcon } from './local-agent-visuals'

export interface LocalAgentTarget { profileId: string; requestId: string; profiles: LaunchProfile[] }
type ProfileFeedback = { status: 'testing' | 'success' | 'error'; message: string }

export function LocalAgents({ api, refresh, active, target }: { api: DesktopApi; refresh: () => Promise<void>; active: boolean; target?: LocalAgentTarget }) {
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [editing, setEditing] = useState<LaunchProfile | 'scan' | null>(null)
  const [notice, setNotice] = useState('')
  const [feedback, setFeedback] = useState<Record<string, ProfileFeedback | undefined>>({})
  const { error, busy, run, setError } = useMutation()
  const [loading, setLoading] = useState(false)
  const openedTarget = useRef<string | undefined>(undefined)
  const trigger = useRef<HTMLButtonElement>(null)
  const reload = async () => setProfiles(await api.request('listLaunchProfiles', undefined))
  const testProfile = (profile: LaunchProfile) => void run(async () => {
    setNotice('')
    setFeedback(current => ({ ...current, [profile.id]: { status: 'testing', message: '正在测试连接…' } }))
    try {
      await api.request('testLaunchProfile', { id: profile.id })
      setFeedback(current => ({ ...current, [profile.id]: { status: 'success', message: profile.protocol === 'claude-cli' ? '程序已核对；实际 API 调用需在员工聊天中验证。' : '连接测试成功' } }))
    } catch (cause) {
      setFeedback(current => ({ ...current, [profile.id]: { status: 'error', message: errorText(cause) } }))
    } finally { await reload() }
  })
  useEffect(() => {
    if (!active) { setEditing(null); return }
    if (target) {
      if (openedTarget.current === target.requestId) return
      openedTarget.current = target.requestId
      setProfiles(target.profiles); setError(''); setLoading(false)
      const profile = target.profiles.find(item => item.id === target.profileId)
      setNotice(profile ? '' : '原本机 Agent 配置已不存在，请在列表中核对连接。')
      setEditing(profile ?? null)
      return
    }
    let current = true
    setLoading(true); setError(''); setNotice('')
    void api.request('listLaunchProfiles', undefined).then(value => { if (current) setProfiles(value) }, failure => { if (current) setError(errorText(failure)) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, active, target, setError])
  return <section aria-label="本机 Agent" className="connection-agent-settings">
    <div className="connection-section-heading"><h3 className="settings-section-title">本机 Agent</h3><Button ref={trigger} variant="secondary" aria-label="扫描本机 Agent" disabled={busy || loading} onClick={() => setEditing('scan')}><Search />扫描</Button></div>
    {error && <Banner>{error}</Banner>}
    {notice && <p className="connection-feedback" role="status">{notice}</p>}
    <Card className="connection-rows soft-divide-y gap-0 p-0">
      {profiles.length ? profiles.map(profile => {
        const result = feedback[profile.id]
        return <div className="connection-row" key={profile.id}>
        <AgentBrandIcon name={`${profile.name} ${profile.verified?.name ?? ''}`} executable={profile.executable} />
        <div className="connection-row-body">
          <div className="connection-row-title">
            <strong title={profile.name}>{profile.name}</strong><span className="connection-state" data-ready={!!profile.verified}>{profile.verified ? profile.protocol === 'claude-cli' ? '程序已核对' : '已验证' : '尚未测试'}</span>
            {result && <p className="connection-feedback connection-inline-feedback" title={result.message} data-status={result.status} role={result.status === 'error' ? 'alert' : 'status'}>{result.status === 'testing' ? <LoaderCircle className="spinner" size={13} /> : result.status === 'success' ? <Check size={13} /> : null}<span>{result.message}</span></p>}
          </div>
          {profile.verified && <p className="connection-row-description">{profile.verified.name} {profile.verified.version}</p>}
          <p className="connection-endpoint" title={profile.executable}>{profile.executable}</p>
          {profile.codexHome && <p className="connection-endpoint" title={profile.codexHome}>登录目录：{profile.codexHome}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={busy || loading} aria-label={`管理 ${profile.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 whitespace-nowrap"><DropdownMenuGroup>
            <DropdownMenuItem onClick={() => requestAnimationFrame(() => setEditing(profile))}><Pencil />编辑 Agent 配置</DropdownMenuItem>
            <DropdownMenuItem onClick={() => testProfile(profile)}><Check />测试</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void run(async () => {
              setNotice('')
              await api.request('deleteLaunchProfile', { id: profile.id })
              setFeedback(current => ({ ...current, [profile.id]: undefined }))
              await reload(); await refresh()
            })}><Trash2 />删除连接</DropdownMenuItem>
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>}) : <div className="connections-empty"><span className="connection-empty-icon"><Terminal size={26} /></span><h3>接入你的本机 Agent</h3><p>扫描本机 Agent，也可以在扫描窗口中手动添加。</p></div>}
    </Card>
    {editing && <LocalConnections api={api} profiles={profiles} initialProfile={editing === 'scan' ? undefined : editing} onSaved={async () => { if (editing !== 'scan') setFeedback(current => ({ ...current, [editing.id]: undefined })); await reload(); await refresh(); setNotice('Agent 配置已保存。') }} onClose={() => setEditing(null)} finalFocus={trigger} />}
  </section>
}
