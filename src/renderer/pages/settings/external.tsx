/*
 * [INPUT]: ACP 启动项、DesktopApi、未保存守卫与统一 UI 控件。
 * [OUTPUT]: 模型连接页内嵌/独立外部 Agent 管理、启动与会话验证、运行方式及登录目录编辑。
 * [POS]: src/renderer/pages/settings/external.tsx；两个设置入口共用同一启动项存储。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useEffect, useState, useContext } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { LaunchProfile, LaunchProfileInput } from '@shared/domain'
import { Banner, Field, GuardContext, useDirty, useMutation } from '@/components/common'

export function ExternalSettings({ api, embedded = false, refreshVersion = 0 }: { api: DesktopApi; embedded?: boolean; refreshVersion?: number }) {
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [editing, setEditing] = useState<LaunchProfile | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  const { error, busy, run } = useMutation(), guard = useContext(GuardContext)
  const refresh = async () => setProfiles(await api.request('listLaunchProfiles', undefined))
  useEffect(() => { void run(refresh) }, [refreshVersion])
  return <section aria-label={embedded ? '本地 Agent' : '外部 Agent'} className={embedded ? 'mt-8' : undefined}>
    <div className={embedded ? "flex items-start justify-between gap-3 mb-4" : "page-heading"}><div>{embedded ? <h3 className="settings-section-title">本地 Agent</h3> : <h2>外部 Agent</h2>}<p className={embedded ? "field-hint" : undefined}>使用已安装程序的登录，在单聊中执行任务。</p></div><Button variant={embedded ? "secondary" : "default"} disabled={busy} onClick={() => guard.navigate(() => setEditing('new'))}>添加启动项</Button></div>
    {error && <Banner>{error}</Banner>}
    {notice && <p className="connection-feedback" role="status">{notice}</p>}
    <p className="field-hint">支持 ACP 程序。保存不会启动或登录程序；测试会创建会话。接入后，在员工的执行方式中选择该启动项。群协作、自动化及 BoAI Skills/知识绑定暂不适用于此后端。</p>
    {editing ? <ProfileEditor key={typeof editing === 'string' ? 'new' : editing.id} api={api} profile={editing === 'new' ? undefined : editing} saved={async () => { await refresh(); setEditing(null); setNotice('启动项已保存，请重新测试。') }} cancel={() => setEditing(null)} /> : <div className="connection-list">
      {!profiles.length && <p className="connections-empty">还没有本地 Agent，可扫描已有登录或手动添加启动项。</p>}
      {profiles.map(p => <Card className="connection-card gap-0 p-4" key={p.id}><CardContent className="p-0">
        <h3>{p.name}</h3><p className="resource-path">{p.executable}</p>
        {p.codexHome && <p className="resource-path">登录目录：{p.codexHome}</p>}
        <p>{p.verified ? `已验证：${p.verified.name} ${p.verified.version}` : '尚未测试'}</p>
        <p className="field-hint">外部自有工具 · 主机权限 · {p.useExistingLogin ? '使用现有登录与用户配置' : '独立 HOME'} · 每次新会话</p>
        <div className="button-row"><Button variant="secondary" disabled={busy} onClick={() => void run(async () => { setNotice(''); try { await api.request('testLaunchProfile', { id: p.id }); setNotice(`「${p.name}」已成功创建会话，可在员工中选择。`) } finally { await refresh() } })}>测试启动与登录</Button><Button variant="secondary" disabled={busy} onClick={() => setEditing(p)}>编辑</Button></div>
      </CardContent></Card>)}
    </div>}
  </section>
}

function ProfileEditor({ api, profile, saved, cancel }: { api: DesktopApi; profile?: LaunchProfile; saved: () => Promise<void>; cancel: () => void }) {
  const [form, setForm] = useState({ name: profile?.name ?? '', executable: profile?.executable ?? '', args: JSON.stringify(profile?.args ?? []), runtime: profile?.runtime ?? '', codexHome: profile?.codexHome ?? '', useExistingLogin: profile?.useExistingLogin ?? false, ack: !!profile })
  const guard = useContext(GuardContext), { error, busy, run } = useMutation()
  useDirty(form)
  return <form data-edit-form className="form-grid" onSubmit={e => {
    e.preventDefault()
    void run(async () => {
      const value: LaunchProfileInput = { id: profile?.id, expectedRevision: profile?.revision, name: form.name, executable: form.executable, args: JSON.parse(form.args), runtime: form.runtime === 'node' ? 'node' : undefined, codexHome: form.useExistingLogin ? form.codexHome.trim() || undefined : undefined, localConfigId: profile?.localConfigId, useExistingLogin: form.useExistingLogin, hostAccessAcknowledged: true }
      await api.request('saveLaunchProfile', value); guard.saved(); await saved()
    })
  }}>
    {error && <Banner>{error}</Banner>}
    <Field label="启动项名称"><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
    <Field label="程序绝对路径"><Input required value={form.executable} placeholder="/opt/homebrew/bin/…" onChange={e => setForm({ ...form, executable: e.target.value })} /></Field>
    <Field label="启动方式"><NativeSelect value={form.runtime} onChange={e => setForm({ ...form, runtime: e.target.value })}><NativeSelectOption value="">直接运行</NativeSelectOption><NativeSelectOption value="node">使用应用内置 Node</NativeSelectOption></NativeSelect></Field>
    <Field label="参数数组" full hint={'填写 JSON 字符串数组，例如 ["acp"]。请按该程序的 ACP 文档配置。'}><Input value={form.args} onChange={e => setForm({ ...form, args: e.target.value })} /></Field>
    <label className="toggle-row full"><span>使用该程序已有登录状态和用户配置</span><Checkbox checked={form.useExistingLogin} onCheckedChange={checked => setForm({ ...form, useExistingLogin: checked })} /></label>
    {form.useExistingLogin && <Field label="Codex 登录目录" full hint="可选；扫描导入时自动填写。其他程序留空。"><Input value={form.codexHome} onChange={e => setForm({ ...form, codexHome: e.target.value })} /></Field>}
    <label className="toggle-row full"><span><strong>允许这个受信任程序在主机上运行</strong><small>工作目录并非沙箱。程序可能直接访问文件、网络和自己的工具；BoAI 只能审批通过协议发送的请求，不能拦截所有原生行为。外部日志和记忆由程序自行管理。</small></span><Checkbox required checked={form.ack} onCheckedChange={checked => setForm({ ...form, ack: checked })} /></label>
    <div className="button-row full"><Button type="submit" disabled={busy || !form.ack}>保存启动项</Button><Button type="button" variant="secondary" onClick={() => guard.navigate(cancel)}>取消</Button></div>
  </form>
}
