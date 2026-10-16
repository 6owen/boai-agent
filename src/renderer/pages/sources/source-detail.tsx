/*
 * [OUTPUT]: 数据源元数据仅展示连接信息，移除API/本地访问范围。
 * [OUTPUT]: 删除通过更多按钮旁的Popover确认，取消不提交，删除期间锁定；确认成功后关闭详情，失败保留入口。
 * [OUTPUT]: 数据源详情不提供员工绑定入口或名单，绑定统一归员工配置；移除反向绑定弹窗。
 * [OUTPUT]: 明确编辑先读取同版本凭据，填入掩码输入框；隐藏或关闭期间的迟到读取不重开编辑器。
 * [INPUT]: 固定数据源ID、当前可见状态、共享详情标签和公开配置IPC。
 * [OUTPUT]: 技能同款右侧详情布局，展示MCP/API/文件夹配置并沿原版本化接口编辑、测试及启停删除。
 * [POS]: Shell右侧独立标签；隐藏停读、迟到隔离，凭据仅在明确编辑时读取。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import { DATA_SOURCE_LABELS, type DataSource } from '@shared/domain/sources'
import { Banner, errorText, useMutation } from '@/components/common'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MessageCircle, RefreshCw, MoreHorizontal } from '@/components/icons'
import { SkillDetailPanel, SkillDetailBody } from '../library/skill-detail-layout'
import { SourceEditor } from './source-editor'
import { SourceIcon } from './sources-view'
import { observeSourceDetail, type SourceDetailState } from './source-detail-state'

export function SourceDetailPanel({ api, id, name, requestId, active, onManage, onRemoved }: { api: DesktopApi; id: string; name: string; requestId: string; active: boolean; onManage(item: { id: string; name: string }): void; onRemoved(): void }) {
  const [detail, setDetail] = useState<SourceDetailState>(), [readError, setReadError] = useState(''), [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<{ source: DataSource; credential: string }>(), [removing, setRemoving] = useState(false)
  const mutation = useMutation(), editorRequest = useRef(0), menuAnchor = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (!active) { setEditing(undefined); setRemoving(false) } return () => { editorRequest.current++ } }, [active, id])
  useEffect(() => {
    if (!active) return
    setReadError('')
    return observeSourceDetail(api, id, value => { setDetail(value); setReadError('') }, error => { setDetail(undefined); setReadError(errorText(error)) })
  }, [api, id, requestId, active, refresh])
  const source = detail?.source.id === id ? detail.source : undefined
  const saved = (value: DataSource) => {
    setDetail(previous => previous && previous.source.id === value.id && previous.source.revision <= value.revision ? { ...previous, source: value } : previous)
    setRefresh(value => value + 1)
  }
  const run = (action: () => Promise<DataSource>) => { void mutation.run(async () => { saved(await action()) }) }
  const identity = source && { id: source.id, expectedRevision: source.revision }
  return <SkillDetailPanel name={source?.name ?? name} label="数据源详情" className="source-detail-panel" actions={source && <>
    <Button variant="secondary" size="sm" onClick={() => onManage(source)}><MessageCircle />AI 管理</Button>
    <DropdownMenu><DropdownMenuTrigger render={<Button ref={menuAnchor} variant="ghost" size="icon-sm" aria-label="数据源更多操作" disabled={mutation.busy} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" finalFocus={removing ? false : undefined}>
      <DropdownMenuItem onClick={() => run(async () => { const { id, revision, createdAt: _created, updatedAt: _updated, hasCredential: _credential, test: _test, creationSource: _creation, ...config } = source; return api.request('saveDataSource', { id, expectedRevision: revision, config: { ...config, enabled: !source.enabled } }) })}>{source.enabled ? '停用数据源' : '启用数据源'}</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}>删除数据源</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>
  </>}>
    {active && readError && <Banner>{readError}</Banner>}
    {source && identity ? <SkillDetailBody name={source.name} description={source.description} icon={<SourceIcon type={source.type} />} metadata={sourceMetadata(source)} metadataActions={<div className="button-row"><Button variant="ghost" size="sm" disabled={mutation.busy || !source.enabled} onClick={() => run(() => api.request('testDataSource', identity))}><RefreshCw className={mutation.busy ? 'spinner' : ''} />测试连接</Button><Button variant="secondary" size="sm" disabled={mutation.busy} onClick={() => { const token = ++editorRequest.current; void mutation.run(async () => { const credential = await api.request('getDataSourceCredential', identity); if (token === editorRequest.current) setEditing({ source, credential }) }) }}>编辑配置</Button></div>} content={source.guide} emptyContent="尚未填写使用说明。">
      {source.test && <p className="field-hint" role="status">{source.test.message} · {new Date(source.test.checkedAt).toLocaleString()}</p>}
      {source.test?.tools && <><div className="skill-info-section-heading"><h3>可用工具</h3></div><div className="source-tool-list">{source.test.tools.map(tool => <div key={tool.name}><strong>{tool.name}</strong>{tool.description && <p>{tool.description}</p>}</div>)}{!source.test.tools.length && <p className="field-hint">服务未提供工具。</p>}</div></>}
    </SkillDetailBody> : <><IllustratedEmpty kind="skills" title={readError ? '暂时无法读取数据源' : undefined} />{readError && <Button variant="ghost" onClick={() => setRefresh(value => value + 1)}>重新读取</Button>}</>}
    {active && editing && <SourceEditor key={editing.source.id} api={api} source={editing.source} initialCredential={editing.credential} onClose={() => setEditing(undefined)} onSaved={saved} />}
    <Popover open={active && removing && Boolean(source)} onOpenChange={open => { if (!mutation.busy) setRemoving(open) }}>
      <PopoverContent anchor={menuAnchor} align="end" finalFocus={menuAnchor}>
        <PopoverTitle className="break-words">删除“{source?.name}”？</PopoverTitle>
        <div className="button-row justify-end">
          <Button variant="secondary" size="sm" disabled={mutation.busy} onClick={() => setRemoving(false)}>取消</Button>
          <Button variant="destructive" size="sm" disabled={mutation.busy || !identity} onClick={() => { void mutation.run(async () => { await api.request('removeDataSource', identity!); setRemoving(false); onRemoved() }) }}>{mutation.busy ? '正在删除…' : '确认删除'}</Button>
        </div>
      </PopoverContent>
    </Popover>
  </SkillDetailPanel>
}

function sourceMetadata(source: DataSource) {
  const rows = [{ label: '类型', value: DATA_SOURCE_LABELS[source.type] }, { label: '状态', value: !source.enabled ? '已停用' : source.test?.status === 'success' ? '连接正常' : source.test?.status === 'failed' ? '连接失败' : '未测试' }]
  const auth = (type: string) => rows.push({ label: '认证方式', value: ({ none: '无需认证', bearer: 'Bearer Token', basic: '用户名与密码', header: '请求头', query: '查询参数' })[type] ?? type }, ...(type === 'none' ? [] : [{ label: '凭据', value: source.hasCredential ? '已配置' : '未配置' }]))
  if (source.type === 'mcp') {
    rows.push({ label: '传输方式', value: source.mcp.transport === 'stdio' ? '标准输入输出（stdio）' : source.mcp.transport === 'http' ? 'Streamable HTTP' : 'SSE' })
    if (source.mcp.transport === 'stdio') rows.push({ label: '命令', value: source.mcp.command }, { label: '参数', value: source.mcp.args.join(' ') || '无' })
    else { rows.push({ label: '服务地址', value: source.mcp.url }); auth(source.mcp.authType) }
  } else if (source.type === 'api') {
    rows.push({ label: '基础地址', value: source.api.baseUrl }, { label: '测试路径', value: source.api.testPath })
    auth(source.api.authType)
    if (source.api.headerName) rows.push({ label: '认证请求头', value: source.api.headerName })
    if (source.api.queryParam) rows.push({ label: '认证参数', value: source.api.queryParam })
    if (source.api.authScheme) rows.push({ label: '认证前缀', value: source.api.authScheme })
  } else rows.push({ label: '文件夹', value: source.local.path })
  return rows
}
