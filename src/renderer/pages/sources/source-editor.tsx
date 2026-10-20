/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [OUTPUT]: API及本地文件夹编辑删除资源级读写设置，权限归员工。
 * [OUTPUT]: 数据源卡片独立紧凑尺寸：32px控件、12px标签/14px图标、10px行留白与sm操作按钮，其他连接表单保持。
 * [OUTPUT]: 表单卡片外层使用共用ScrollArea，标题固定，滚动条贴弹窗右边缘，留白置于滚动内容内部。
 * [OUTPUT]: 复用模型连接弹窗、插画和横向分组表单；标签/图标居左、控件居右，保存操作位于卡片右下。
 * [OUTPUT]: 已保存凭据回填，默认掩码/眼睛切换；提交实际输入值，清空即删除，移除保留提示和清除勾选。
 * [OUTPUT]: 只接受已有数据源的版本化编辑；手动新增分支、初始配置和随机ID生成退役。
 * [OUTPUT]: 编辑时剥离只读creationSource，保留同一数据源及创建归属。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: Source config, saved credential for explicit editing and shared form primitives.
 * [OUTPUT]: Explicit API/MCP/folder editing with revision checks and native folder selection.
 * [POS]: Data-source editor; connection testing is a separate explicit action.
 * [PROTOCOL]: 变化同步 Header 与 .folder.md。
 */
import { useContext, useId, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import { DATA_SOURCE_LABELS, type DataSource, type DataSourceConfig } from '@shared/domain/sources'
import { Banner, GuardContext, useDirty, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Database, Eye, EyeOff, FileText, FolderOpen, Key, Pencil, ShieldCheck, Terminal } from '@/components/icons'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { Dialog } from '@/components/ui/dialog'
import { ConnectionDialogLayout, ConnectionForm, ConnectionSettingRow } from '../settings/connection-layout'
import { ConnectionIllustration } from '../settings/connection-illustration'

function configuration(source: DataSource): DataSourceConfig {
  const { id: _id, revision: _revision, createdAt: _created, updatedAt: _updated, hasCredential: _hasCredential, test: _test, creationSource: _creation, ...config } = source
  return config
}
export function SourceEditor({ api, source, initialCredential, onClose, onSaved }: { api: DesktopApi; source: DataSource; initialCredential: string; onClose(): void; onSaved(source: DataSource): void }) {
  const [config, setConfig] = useState<DataSourceConfig>(() => configuration(source))
  const [credential, setCredential] = useState(initialCredential), [showCredential, setShowCredential] = useState(false)
  const fieldId = useId(), nameInput = useRef<HTMLInputElement>(null)
  const [args, setArgs] = useState(() => source.type === 'mcp' && source.mcp.transport === 'stdio' ? JSON.stringify(source.mcp.args, null, 2) : '[]')
  const mutation = useMutation(), guard = useContext(GuardContext)
  const close = () => guard.navigate(onClose, { resetOnDiscard: false })
  const resetDirty = useDirty({ config, credential, args })
  const set = (patch: Partial<Pick<DataSourceConfig, 'name' | 'description' | 'guide' | 'enabled'>>) => setConfig(value => ({ ...value, ...patch }))
  const needsCredential = config.type === 'api' ? config.api.authType !== 'none' : config.type === 'mcp' && (config.mcp.transport === 'stdio' || config.mcp.authType !== 'none')
  const save = () => { void mutation.run(async () => {
    const current = config.type === 'mcp' && config.mcp.transport === 'stdio' ? { ...config, mcp: { ...config.mcp, args: JSON.parse(args) } } : config
    const saved = await api.request('saveDataSource', { id: source.id, expectedRevision: source.revision, config: current, credential: needsCredential ? credential : '' })
    resetDirty(); onSaved(saved); guard.saved(onClose)
  }) }
  const credentialLabel = config.type === 'mcp' && config.mcp.transport === 'stdio' ? '环境变量' : config.type === 'api' && config.api.authType === 'basic' ? '账号与密码' : '访问密钥'
  const nestedLine = <span className="connection-nested-line" aria-hidden="true" />
  return <Dialog open onOpenChange={open => { if (!open && !mutation.busy) close() }}>
    <ConnectionDialogLayout choosing={false} scrollBody label="编辑数据源" title={`配置 ${DATA_SOURCE_LABELS[source.type]} 数据源`}
      illustration={<ConnectionIllustration configuring />} closeLabel="关闭数据源配置" working={mutation.busy}
      onClose={close} initialFocus={nameInput} finalFocus={undefined}>
      <ConnectionForm data-source-editor disabled={mutation.busy} onSubmit={event => { event.preventDefault(); save() }} footer={<>
        <Button type="button" variant="ghost" size="sm" disabled={mutation.busy} onClick={close}>取消</Button>
        <div className="connection-editor-actions"><Button type="submit" size="sm" disabled={mutation.busy}>{mutation.busy ? '保存中…' : '保存数据源'}</Button></div>
      </>}>
        {mutation.error && <Banner>{mutation.error}</Banner>}
        <ConnectionSettingRow label="名称" icon={<Pencil />} htmlFor={`${fieldId}-name`}>
          <Input ref={nameInput} id={`${fieldId}-name`} required maxLength={100} value={config.name} onChange={e => set({ name: e.target.value })} placeholder="例如：项目资料" />
        </ConnectionSettingRow>
        <ConnectionSettingRow label="简介" icon={<FileText />} htmlFor={`${fieldId}-description`}>
          <Input id={`${fieldId}-description`} maxLength={1000} value={config.description} onChange={e => set({ description: e.target.value })} placeholder="让员工了解这个数据源的用途" />
        </ConnectionSettingRow>
        {config.type === 'api' && <>
          <ConnectionSettingRow label="Base URL" icon={<Database />} htmlFor={`${fieldId}-base-url`}><Input id={`${fieldId}-base-url`} required type="url" value={config.api.baseUrl} placeholder="https://api.example.com/v1" onChange={e => setConfig({ ...config, api: { ...config.api, baseUrl: e.target.value } })} /></ConnectionSettingRow>
          <div>
            <ConnectionSettingRow label="认证方式" icon={<ShieldCheck />} htmlFor={`${fieldId}-auth`}><SelectField size="sm" className="h-[32px]" id={`${fieldId}-auth`} value={config.api.authType} options={[{ value: 'none', label: '无需认证' }, { value: 'bearer', label: 'Bearer token' }, { value: 'header', label: 'API key · Header' }, { value: 'query', label: 'API key · Query' }, { value: 'basic', label: 'Basic Auth' }]} onValueChange={value => setConfig({ ...config, api: { ...config.api, authType: value as typeof config.api.authType } })} /></ConnectionSettingRow>
            {config.api.authType === 'header' && <ConnectionSettingRow label="Header 名称" icon={nestedLine} htmlFor={`${fieldId}-header`}><Input id={`${fieldId}-header`} required value={config.api.headerName ?? ''} placeholder="X-API-Key" onChange={e => setConfig({ ...config, api: { ...config.api, headerName: e.target.value } })} /></ConnectionSettingRow>}
            {config.api.authType === 'query' && <ConnectionSettingRow label="Query 参数名" icon={nestedLine} htmlFor={`${fieldId}-query`}><Input id={`${fieldId}-query`} required value={config.api.queryParam ?? ''} placeholder="api_key" onChange={e => setConfig({ ...config, api: { ...config.api, queryParam: e.target.value } })} /></ConnectionSettingRow>}
          </div>
          <ConnectionSettingRow label="测试端点" icon={<Terminal />} htmlFor={`${fieldId}-test-path`} hint="测试连接时会向此相对端点发送一次 GET 请求。"><Input id={`${fieldId}-test-path`} required value={config.api.testPath} placeholder="/health" onChange={e => setConfig({ ...config, api: { ...config.api, testPath: e.target.value } })} /></ConnectionSettingRow>
        </>}
        {config.type === 'mcp' && <>
          <div>
            <ConnectionSettingRow label="连接方式" icon={<Terminal />} htmlFor={`${fieldId}-transport`}><SelectField size="sm" className="h-[32px]" id={`${fieldId}-transport`} value={config.mcp.transport} options={[{ value: 'http', label: 'Streamable HTTP' }, { value: 'sse', label: 'SSE' }, { value: 'stdio', label: '本机命令 · stdio' }]} onValueChange={value => { setCredential(''); setShowCredential(false); setConfig({ ...config, mcp: value === 'stdio' ? { transport: 'stdio', command: '', args: [] } : { transport: value as 'http' | 'sse', url: '', authType: 'none' } }) }} /></ConnectionSettingRow>
            {config.mcp.transport === 'stdio' ? <>
              <ConnectionSettingRow label="启动程序" icon={nestedLine} htmlFor={`${fieldId}-command`} hint="连接测试或员工首次使用时启动，随本次调用会话退出。"><Input id={`${fieldId}-command`} required value={config.mcp.command} placeholder="npx 或程序绝对路径" onChange={e => setConfig({ ...config, mcp: { ...config.mcp as Extract<typeof config.mcp, { transport: 'stdio' }>, command: e.target.value } })} /></ConnectionSettingRow>
              <ConnectionSettingRow label="启动参数" icon={nestedLine} htmlFor={`${fieldId}-args`} hint="使用 JSON 数组填写启动参数。"><Textarea className="px-2 py-1.5 text-[length:var(--text-ui-secondary)] leading-[var(--leading-ui-body)] md:text-[length:var(--text-ui-secondary)]" id={`${fieldId}-args`} rows={3} value={args} onChange={e => setArgs(e.target.value)} placeholder={'["-y", "your-mcp-server"]'} /></ConnectionSettingRow>
            </> : <ConnectionSettingRow label="服务地址" icon={nestedLine} htmlFor={`${fieldId}-url`}><Input id={`${fieldId}-url`} required type="url" value={config.mcp.url} placeholder="https://example.com/mcp" onChange={e => setConfig({ ...config, mcp: { ...config.mcp as Extract<typeof config.mcp, { url: string }>, url: e.target.value } })} /></ConnectionSettingRow>}
          </div>
          {config.mcp.transport !== 'stdio' && <ConnectionSettingRow label="认证方式" icon={<ShieldCheck />} htmlFor={`${fieldId}-auth`}><SelectField size="sm" className="h-[32px]" id={`${fieldId}-auth`} value={config.mcp.authType} options={[{ value: 'none', label: '无需认证' }, { value: 'bearer', label: 'Bearer token' }]} onValueChange={value => setConfig({ ...config, mcp: { ...config.mcp as Extract<typeof config.mcp, { url: string }>, authType: value as 'none' | 'bearer' } })} /></ConnectionSettingRow>}
        </>}
        {config.type === 'local' && <>
          <ConnectionSettingRow label="文件夹路径" icon={<FolderOpen />} htmlFor={`${fieldId}-path`}><div className="connection-setting-control">
            <Input id={`${fieldId}-path`} required value={config.local.path} onChange={e => setConfig({ ...config, local: { ...config.local, path: e.target.value } })} placeholder="选择员工可访问的文件夹" />
            <Button type="button" variant="secondary" className="justify-self-start" onClick={() => { void mutation.run(async () => { const path = await api.request('chooseDataSourceFolder', undefined); if (path) setConfig({ ...config, local: { ...config.local, path } }) }) }}>选择文件夹</Button>
          </div></ConnectionSettingRow>
        </>}
        {needsCredential && <ConnectionSettingRow label={credentialLabel} icon={<Key />} htmlFor={`${fieldId}-credential`} hint={credentialLabel === '访问密钥' ? undefined : '使用 JSON 对象填写。'}>
          <InputGroup><InputGroupInput id={`${fieldId}-credential`} aria-label={credentialLabel} type={showCredential ? 'text' : 'password'} autoComplete="off" spellCheck={false} maxLength={32000} value={credential} onChange={e => setCredential(e.target.value)} /><InputGroupAddon align="inline-end" className="pr-2.5 has-[>button]:mr-0"><InputGroupButton type="button" size="icon-xs" className="connection-key-visibility" aria-label={`${showCredential ? '隐藏' : '显示'}${credentialLabel}`} aria-pressed={showCredential} onClick={() => setShowCredential(value => !value)}>{showCredential ? <EyeOff /> : <Eye />}</InputGroupButton></InputGroupAddon></InputGroup>
        </ConnectionSettingRow>}
        <ConnectionSettingRow label="使用说明" icon={<FileText />} htmlFor={`${fieldId}-guide`} hint="可填写 API 端点、参数和使用范围，员工调用前会读取此说明。"><Textarea className="px-2 py-1.5 text-[length:var(--text-ui-secondary)] leading-[var(--leading-ui-body)] md:text-[length:var(--text-ui-secondary)]" id={`${fieldId}-guide`} rows={4} maxLength={40000} value={config.guide} onChange={e => set({ guide: e.target.value })} placeholder="例如：GET /projects 查询项目列表…" /></ConnectionSettingRow>
      </ConnectionForm>
    </ConnectionDialogLayout>
  </Dialog>
}
