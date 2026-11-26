/*
 * [OUTPUT]: 本机 Agent 行展示当前和可用版本，可安装启动时发现的更新。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: 配置保存后刷新列表与员工能力，逐项测试反馈沿 Sonner。
 * [OUTPUT]: 消费Shell核对的具体本机配置导航，复用原编辑向导；失效绑定显示原列表，隐藏停止读取并关闭弹窗，迟到读取不更新界面。
 * [OUTPUT]: Claude 测试成功时提示程序核对，版本显示沿实际核对数据。
 * [INPUT]: 已保存原生Codex/ACP配置、DesktopApi、本地品牌图标与本机Agent两步向导。
 * [OUTPUT]: 本机 Agent 列表复用向导的 Lobe 品牌匹配/默认图标，唯一扫描入口；编辑/测试菜单加宽并保持单行文字；不混入模型 API 导入，既有配置的编辑/测试共用简化向导与启动配置存储。
 * [POS]: settings 内嵌本机 Agent 分区，替代独立外部 Agent 页面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { notify as toast } from '@boai/ui/sonner'
import { showErrorToast } from '@/components/common/error-feedback'
import { useEffect, useRef, useState } from 'react'
import type { LaunchProfile } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { errorText, useMutation } from '@/components/common'
import { Check, MoreHorizontal, Pencil, Search, Terminal, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LocalConnections } from './local-connections'
import { AgentBrandIcon } from './local-agent-visuals'
import { AgentUpdateButton, useDesktopNotifications } from '@/components/app-shell/notification-center'
import { SettingsHelp } from './settings-layout'

export interface LocalAgentTarget { profileId: string; requestId: string; profiles: LaunchProfile[] }

export function LocalAgents({ api, refresh, active, target }: { api: DesktopApi; refresh: () => Promise<void>; active: boolean; target?: LocalAgentTarget }) {
  const inbox = useDesktopNotifications()
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [editing, setEditing] = useState<LaunchProfile | 'scan' | null>(null)
  const { busy, run } = useMutation()
  const [loading, setLoading] = useState(false)
  const openedTarget = useRef<string | undefined>(undefined)
  const trigger = useRef<HTMLButtonElement>(null)
  const profileChanged = profiles.some(profile => inbox?.state?.agentUpdates.some(item => item.profileId === profile.id && item.profileRevision > profile.revision))
  useEffect(() => {
    if (!active || !profileChanged) return
    let current = true
    void api.request('listLaunchProfiles', undefined).then(items => { if (current) setProfiles(items) }, error => { if (current) showErrorToast(errorText(error)) })
    return () => { current = false }
  }, [api, active, profileChanged])
  const reload = async () => setProfiles(await api.request('listLaunchProfiles', undefined))
  const testProfile = (profile: LaunchProfile) => void run(async () => {
    try {
      await api.request('testLaunchProfile', { id: profile.id })
      toast.success(profile.protocol === 'claude-cli' ? '程序已核对' : '连接测试成功')
    } finally {
      await reload().catch(error => showErrorToast(errorText(error)))
    }
  })
  useEffect(() => {
    if (!active) { setEditing(null); return }
    if (target) {
      if (openedTarget.current === target.requestId) return
      openedTarget.current = target.requestId
      setProfiles(target.profiles); setLoading(false)
      const profile = target.profiles.find(item => item.id === target.profileId)
      if (!profile) showErrorToast('原本机 Agent 配置已不存在，请在列表中核对连接。')
      setEditing(profile ?? null)
      return
    }
    let current = true
    setLoading(true)
    void api.request('listLaunchProfiles', undefined).then(value => { if (current) setProfiles(value) }, failure => { if (current) showErrorToast(errorText(failure)) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, active, target])
  return <section aria-label="本机 Agent" className="connection-agent-settings">
    <div className="connection-section-heading"><h3 className="settings-section-title">本机 Agent</h3><Button ref={trigger} variant="secondary" aria-label="扫描本机 Agent" disabled={busy || loading} onClick={() => setEditing('scan')}><Search />扫描</Button></div>
    <Card className="connection-rows soft-divide-y gap-0 p-0">
      {profiles.length ? profiles.map(profile => {
        const update = inbox?.state?.agentUpdates.find(item => item.profileId === profile.id && item.profileRevision >= profile.revision)
        return <div className="connection-row" key={profile.id}>
        <AgentBrandIcon name={`${profile.name} ${profile.verified?.name ?? ''}`} executable={profile.executable} />
        <div className="connection-row-body">
          <div className="connection-row-title"><strong title={profile.name}>{profile.name}</strong></div>
          {profile.verified && <p className="connection-row-description">{profile.verified.name} {update ? `v${update.currentVersion}` : profile.verified.version}
            {update?.latestVersion && <> <span aria-label="可用版本">→ v{update.latestVersion}</span>{update.blocked && <SettingsHelp label="更新说明">{update.blocked}</SettingsHelp>}</>}
          </p>}
          <p className="connection-endpoint" title={profile.executable}>{profile.executable}</p>
          {profile.codexHome && <p className="connection-endpoint" title={profile.codexHome}>登录目录：{profile.codexHome}</p>}
        </div>
        {update && <AgentUpdateButton item={update} />}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={busy || loading} aria-label={`管理 ${profile.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 whitespace-nowrap"><DropdownMenuGroup>
            <DropdownMenuItem onClick={() => requestAnimationFrame(() => setEditing(profile))}><Pencil />编辑 Agent 配置</DropdownMenuItem>
            <DropdownMenuItem onClick={() => testProfile(profile)}><Check />测试</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void run(async () => {
              await api.request('deleteLaunchProfile', { id: profile.id })
              await reload(); await refresh()
            })}><Trash2 />删除连接</DropdownMenuItem>
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>}) : <div className="connections-empty"><span className="connection-empty-icon"><Terminal size={26} /></span><h3>接入你的本机 Agent</h3><p>扫描本机 Agent，也可以在扫描窗口中手动添加。</p></div>}
    </Card>
    {editing && <LocalConnections api={api} profiles={profiles} initialProfile={editing === 'scan' ? undefined : editing} onSaved={async () => { await reload(); await refresh() }} onClose={() => setEditing(null)} finalFocus={trigger} />}
  </section>
}
