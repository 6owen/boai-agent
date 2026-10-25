/*
 * [OUTPUT]: 受管技能可用资源库同款Panel/Body展示；原内嵌内容接口保持，身份/正文/文件仍读取同一resourceId。
 * [INPUT]: 受管技能详情/文件 IPC 与当前资源身份。
 * [OUTPUT]: 不执行 HTML/远程图片的说明、文件、已知/未知来源版本、本地改动提示和单项更新入口；切换资源丢弃迟到响应。
 * [POS]: library 资源详情内的技能内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { SkillUpdate } from './skill-update'
import { SkillMarkdown } from './skill-markdown'
import type { DesktopApi } from '@boai/shared/ipc'
import type { SkillDetail, SkillFileContent } from '@boai/shared/domain'
import { skillMarketplaces } from '@boai/shared/domain/skill-marketplace'
import { Banner, Loading, sizeText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { SkillDetailBody, SkillDetailPanel } from './skill-detail-layout'

export function SkillContent({ api, resourceId, panel }: { api: DesktopApi; resourceId: string; panel?: { name: string; actions?: ReactNode; children?: ReactNode; onOpen(): void } }) {
  const [detail, setDetail] = useState<SkillDetail | null>(null), [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const updated = useCallback(() => setRevision(value => value + 1), [])
  const [file, setFile] = useState(''), [content, setContent] = useState<SkillFileContent | null>(null), [fileError, setFileError] = useState('')
  useEffect(() => {
    let alive = true
    setDetail(null); setError(''); setFile('')
    api.request('getSkillDetail', { resourceId }).then(value => { if (alive) setDetail(value) }, error => { if (alive) setError(String(error)) })
    return () => { alive = false }
  }, [api, resourceId, revision])
  useEffect(() => {
    let alive = true
    setContent(null); setFileError('')
    if (file) api.request('readSkillFile', { resourceId, path: file }).then(value => { if (alive) setContent(value) }, error => { if (alive) setFileError(String(error)) })
    return () => { alive = false }
  }, [api, resourceId, file])
  if (error || !detail) {
    const state = error ? <Banner>{error}</Banner> : <Loading />
    return panel ? <SkillDetailPanel name={panel.name} actions={panel.actions}><div className="skill-info-page">{state}{panel.children}</div></SkillDetailPanel> : state
  }
  const installation = detail.installation, source = installation?.source
  const origin = !source ? '本地副本 · 原始来源未记录' : source.kind === 'marketplace' ? `${skillMarketplaces[source.provider].label} · ${source.providerItemId}` : source.kind === 'git' ? `${source.repository} · ${source.ref} · ${source.resolvedCommit?.slice(0, 12) ?? '原始 commit 未记录'}` : source.kind === 'url' ? source.url : source.kind === 'snapshot' ? `内容快照 · ${source.reason ?? '原始来源不可更新'}` : '本地导入 · 更新时需重新导入'
  const files = <><div className="skill-file-list">{detail.files.map(entry => <Button key={entry.path} variant={file === entry.path ? 'secondary' : 'ghost'} className="skill-file-row" size="sm" onClick={() => setFile(entry.path)}><span>{entry.path}</span><small>{sizeText(entry.size)}</small></Button>)}</div>{fileError && <Banner>{fileError}</Banner>}{file && !content && !fileError && <Loading />}{content && (content.binary ? <p className="field-hint">二进制文件 · {sizeText(content.size)}</p> : <pre className="skill-file-preview" aria-label={`文件内容 ${file}`}>{content.content}</pre>)}</>
  if (panel) return <SkillUpdate api={api} resourceId={resourceId} onUpdated={updated} popover>{({ actions }) => <SkillDetailPanel name={detail.resource.name} actions={<>{actions}{panel.actions}</>}>
    <SkillDetailBody name={detail.resource.name} description={detail.resource.description} content={detail.content} emptyContent="此技能尚未提供说明。" metadata={[
      { label: '标识符', value: detail.resource.id }, { label: '名称', value: detail.resource.name }, { label: '描述', value: detail.resource.description || '未填写' }, { label: '数据源', value: origin },
      { label: '位置', value: <Button variant="ghost" size="content" className="skill-path-link" onClick={panel.onOpen}>{detail.resource.path}</Button> },
      ...(installation ? [{ label: '安装时间', value: new Date(installation.installedAt).toLocaleString('zh-CN') }] : []),
      ...(installation?.updatedAt ? [{ label: '更新时间', value: new Date(installation.updatedAt).toLocaleString('zh-CN') }] : []),
    ]} notice={<>{installation && installation.contentHash !== detail.contentHash && <Banner kind="notice">此副本在安装后发生过本地修改。</Banner>}{detail.warnings.map(warning => <Banner kind="notice" key={warning}>{warning}</Banner>)}</>}>
      <details><summary className="skill-info-section-heading">文件 · {detail.files.length}</summary><Card><CardContent>{files}</CardContent></Card></details>
      {panel.children}
    </SkillDetailBody>
  </SkillDetailPanel>}</SkillUpdate>
  return <div className="skill-content"><p className="field-hint resource-path">{origin}{installation && <><br />安装于 {new Date(installation.installedAt).toLocaleString('zh-CN')}{installation.updatedAt && <><br />更新于 {new Date(installation.updatedAt).toLocaleString('zh-CN')}</>}</>}<br />说明可读取不代表脚本执行依赖已就绪。</p>
    {installation && installation.contentHash !== detail.contentHash && <Banner kind="notice">此副本在安装后发生过本地修改。</Banner>}
    <SkillUpdate api={api} resourceId={resourceId} onUpdated={updated} />
    {detail.warnings.map(warning => <Banner kind="notice" key={warning}>{warning}</Banner>)}
    <Tabs defaultValue="instructions"><TabsList aria-label="技能详情内容"><TabsTrigger value="instructions">说明</TabsTrigger><TabsTrigger value="files">文件 · {detail.files.length}</TabsTrigger></TabsList>
      <TabsContent value="instructions"><SkillMarkdown content={detail.content} /></TabsContent>
      <TabsContent value="files">{files}</TabsContent>
    </Tabs>
  </div>
}
