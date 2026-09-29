/*
 * [INPUT]: 已保存 ACP 配置、DesktopApi、本地品牌图标与仅 ACP 的本机 Agent 两步向导。
 * [OUTPUT]: 本机 Agent 列表复用向导的 Lobe 品牌匹配/默认图标，唯一扫描入口；编辑/测试菜单加宽并保持单行文字；不混入模型 API 导入，既有配置的编辑/测试共用简化向导与启动配置存储。
 * [POS]: settings 内嵌本机 Agent 分区，替代独立外部 Agent 页面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { LaunchProfile } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, useMutation } from '@/components/common'
import { Check, MoreHorizontal, Pencil, Search, Terminal } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LocalConnections } from './local-connections'
import { AgentBrandIcon } from './local-agent-visuals'

export function LocalAgents({ api, refresh }: { api: DesktopApi; refresh: () => Promise<void> }) {
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [editing, setEditing] = useState<LaunchProfile | 'scan' | null>(null)
  const [notice, setNotice] = useState('')
  const { error, busy, run } = useMutation()
  const trigger = useRef<HTMLButtonElement>(null)
  const reload = async () => setProfiles(await api.request('listLaunchProfiles', undefined))
  useEffect(() => { void run(reload) }, [api, run])
  return <section aria-label="本机 Agent" className="connection-agent-settings">
    <div className="connection-section-heading"><h3 className="settings-section-title">本机 Agent</h3><Button ref={trigger} variant="secondary" aria-label="扫描本机 Agent" disabled={busy} onClick={() => setEditing('scan')}><Search />扫描</Button></div>
    {error && <Banner>{error}</Banner>}
    {notice && <p className="connection-feedback" role="status">{notice}</p>}
    <Card className="connection-rows soft-divide-y gap-0 p-0">
      {profiles.length ? profiles.map(profile => <div className="connection-row" key={profile.id}>
        <AgentBrandIcon name={`${profile.name} ${profile.verified?.name ?? ''}`} executable={profile.executable} />
        <div className="connection-row-body">
          <div className="connection-row-title"><strong title={profile.name}>{profile.name}</strong><span className="connection-state" data-ready={!!profile.verified}>{profile.verified ? '已验证' : '尚未测试'}</span></div>
          {profile.verified && <p className="connection-row-description">{profile.verified.name} {profile.verified.version}</p>}
          <p className="connection-endpoint" title={profile.executable}>{profile.executable}</p>
          {profile.codexHome && <p className="connection-endpoint" title={profile.codexHome}>登录目录：{profile.codexHome}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={busy} aria-label={`管理 ${profile.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 whitespace-nowrap"><DropdownMenuGroup>
            <DropdownMenuItem onClick={() => requestAnimationFrame(() => setEditing(profile))}><Pencil />编辑 Agent 配置</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void run(async () => {
              setNotice('')
              try { await api.request('testLaunchProfile', { id: profile.id }); setNotice(`「${profile.name}」测试成功。`) }
              finally { await reload() }
            })}><Check />测试</DropdownMenuItem>
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>) : <div className="connections-empty"><span className="connection-empty-icon"><Terminal size={26} /></span><h3>接入你的本机 Agent</h3><p>扫描本机 Agent，也可以在扫描窗口中手动添加。</p></div>}
    </Card>
    {editing && <LocalConnections api={api} profiles={profiles} initialProfile={editing === 'scan' ? undefined : editing} onSaved={async () => { await reload(); await refresh(); setNotice('Agent 配置已保存。') }} onClose={() => setEditing(null)} finalFocus={trigger} />}
  </section>
}
