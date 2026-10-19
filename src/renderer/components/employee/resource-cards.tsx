/*
 * [OUTPUT]: 数据源Card展示已保存的首选检索方式和失效状态，沿原公共目录读取。
 * [OUTPUT]: 知识资料仅显示数量入口，经原草稿守卫进入员工文件区管理。
 * [OUTPUT]: 技能/数据源/知识标题右侧支持分区就地编辑，未绑定知识也显示入口；只读列表保持原能力与来源核对。
 * [INPUT]: 员工技能/知识绑定、能力读取状态及公共数据源目录。
 * [OUTPUT]: 标题加Card的技能/数据源/知识列表；技能行间独立复用全局Separator细线，不受按钮圆角影响；源权限、隐藏停读和迟到隔离保持。
 * [POS]: 通讯录只读资源分区，不修改绑定或测试连接，不读取凭据。
 * [PROTOCOL]: 修改同步Header及所属.folder.md。
 */
import { Fragment, useContext, useEffect, useState } from 'react'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import { isCoreAgent } from '@shared/domain/core-agent'
import { DATA_SOURCE_LABELS, webSearchPreferenceLabel, type DataSource } from '@shared/domain/sources'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, GuardContext, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BookOpen, Database, Zap, Search } from '@/components/icons'
import { ContactProfileCard, ContactProfileRow, ContactProfileSection, EmployeeSectionEdit, type EmployeeSectionEditing } from './profile-card'
import type { EmployeeCapabilityFact } from './overview-state'
import { EmployeeResourceNavigation } from './resource-navigation'

export function EmployeeResourceCards({ api, agent, snapshot, active, revision, capabilities, onOpenSkill, editing }: {
  api: DesktopApi; agent: DigitalAgent; snapshot: Snapshot; active: boolean; revision: number
  capabilities: EmployeeCapabilityFact[]; onOpenSkill(id: string): void
  editing?: EmployeeSectionEditing
}) {
  const navigation = useContext(EmployeeResourceNavigation), guard = useContext(GuardContext)
  const [sources, setSources] = useState<DataSource[]>(), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const bindingKey = JSON.stringify(agent.sourceIds ?? [])
  const core = isCoreAgent(agent)
  useEffect(() => {
    if (!active) return
    let current = true
    if (!core && !agent.sourceIds?.length) { setSources([]); setError(''); return }
    void api.request('listDataSources', undefined).then(value => { if (current) { setSources(value); setError('') } }, reason => { if (current) setError(errorText(reason)) })
    return () => { current = false }
  }, [api, active, agent.id, core, bindingKey, revision, retry])
  const visibleSources = core ? (sources ?? []).filter(source => source.enabled) : (agent.sourceIds ?? []).map(id => sources?.find(source => source.id === id))
  const skills = agent.skillIds.map(id => ({ id, resource: snapshot.resources.find(item => item.id === id && item.kind === 'skill' && (!item.ownerAgentId || item.ownerAgentId === agent.id)), fact: capabilities.find(item => item.id === `skill:${id}`) }))
  return <>
    {editing?.section === 'skills' ? editing.render('skills') : <ContactProfileSection title="技能" actions={<EmployeeSectionEdit editing={editing} section="skills" label="技能" />}><ContactProfileCard label="技能列表" fields={false}>
      {!skills.length ? <p className="contact-card-empty">未绑定技能</p> : <div>{skills.map(({ id, resource, fact }, index) => <Fragment key={id}>
        {index > 0 && <Separator />}
        <Button variant="ghost" size="content" className="contact-resource-row" disabled={!resource} onClick={() => onOpenSkill(id)}>
        <Zap /><span className="contact-resource-copy"><span className="contact-value-status"><strong>{resource?.name ?? '技能已移除'}</strong><small className="contact-inline-status" data-positive={Boolean(resource && fact?.status === '已绑定 · 说明可读')}>{!resource ? '不可用' : fact?.status.replace('已绑定 · ', '') || '已绑定'}</small></span>{resource?.description && <span className="contact-resource-description">{resource.description}</span>}</span>
        </Button>
      </Fragment>)}</div>}
    </ContactProfileCard></ContactProfileSection>}
    {editing?.section === 'sources' ? editing.render('sources') : <ContactProfileSection title="数据源" actions={<EmployeeSectionEdit editing={editing} section="sources" label="数据源" />}>
      {error && <><Banner>{error}</Banner><Button variant="ghost" size="sm" onClick={() => setRetry(value => value + 1)}>重新读取数据源</Button></>}
      <ContactProfileCard label="数据源列表" fields={false}>
        {!sources ? !error && <Loading /> : !visibleSources.length ? <p className="contact-card-empty">{core ? '暂无已启用的数据源' : '未绑定数据源'}</p> : <div className="soft-divide-y">{visibleSources.map((source, index) => <div className="contact-resource-row" key={source?.id ?? agent.sourceIds?.[index]}>
          <Database /><span className="contact-resource-copy"><span className="contact-value-status"><strong>{source?.name ?? '数据源已移除'}</strong><small className="contact-inline-status" data-positive={Boolean(source?.enabled)}>{!source ? '不可用' : source.enabled ? '已启用' : '已停用'}</small></span>{source && <span className="contact-resource-description">{DATA_SOURCE_LABELS[source.type]}{source.description ? ` · ${source.description}` : ''}</span>}</span>
        </div>)}</div>}
        <Separator />
        <dl className="automation-detail-fields"><ContactProfileRow icon={<Search />} title="首选检索方式">{!sources && agent.webSearch?.mode === 'source' ? '读取中' : webSearchPreferenceLabel(agent.webSearch, sources ?? [])}</ContactProfileRow></dl>
      </ContactProfileCard>
    </ContactProfileSection>}
    <ContactProfileSection title="知识资料"><Button variant="ghost" size="sm" disabled={!active || !navigation} onClick={() => guard.navigate(() => navigation?.({ kind: 'knowledge-files', id: agent.id, name: agent.name }))}><BookOpen data-icon="inline-start" />知识资料 · {agent.knowledgeIds.length} 份</Button></ContactProfileSection>
  </>
}
