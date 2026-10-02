/*
 * [INPUT]: 受管资源、已提交快照、DesktopApi 与员工绑定/收藏读取。
 * [OUTPUT]: 保留资源正文、来源路径、员工/会话绑定及明确移除操作；资料库主页面退役后仍供共享详情标签使用。
 * [POS]: library 的共享资源详情；不提供独立资料库主页面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { FolderOpen } from '@/components/icons/index'
import { Avatar, Banner, useMutation } from '@/components/common/index'
import type { DesktopApi } from '@shared/ipc'
import type { DigitalAgent, Resource, Snapshot } from '@shared/domain'
import { SkillContent } from './skill-content'
import { useSkillCollections } from './use-skill-collections'

export function ResourceDetail({ api, resource, snapshot, refresh, onRemoved, onAgent }: { api: DesktopApi; resource: Resource; snapshot: Snapshot; refresh: () => Promise<void>; onRemoved: () => void; onAgent: (agent: DigitalAgent) => void }) {
  const [confirm, setConfirm] = useState(false), [bindAgent, setBindAgent] = useState('')
  const collection = useSkillCollections(api)
  const { busy, error, run } = useMutation()
  const bound = snapshot.agents.filter(a => [...a.skillIds, ...a.knowledgeIds].includes(resource.id))
  const shared = snapshot.conversations.filter(c => c.sharedKnowledgeIds.includes(resource.id))
  return <div className="detail-section">{error && <Banner>{error}</Banner>}<span className="pill">{resource.kind === 'skill' ? 'Skill' : '知识资料'}</span><h2>{resource.name}</h2><p>{resource.description || '没有额外说明。'}</p>{resource.kind === 'skill' && <><Button variant="secondary" disabled={!collection.value || collection.busy} onClick={() => { void collection.change({ kind: 'favorite', resourceId: resource.id, favorite: !collection.value?.favoriteResourceIds.includes(resource.id) }) }}>{collection.value?.favoriteResourceIds.includes(resource.id) ? '移出我的' : '加入我的'}</Button>{collection.error && <Banner>{collection.error}</Banner>}<SkillContent api={api} resourceId={resource.id} /><div className="skill-binding"><SelectField aria-label="为技能选择员工" value={bindAgent} onValueChange={selectedValue => setBindAgent(selectedValue)} options={[{ value: '', label: '选择员工以管理绑定' }, ...snapshot.agents.filter(agent => !resource.ownerAgentId || agent.id === resource.ownerAgentId).map(agent => ({ value: agent.id, label: agent.name }))]} /><Button variant="secondary" disabled={!bindAgent} onClick={() => { const agent = snapshot.agents.find(agent => agent.id === bindAgent); if (agent) onAgent(agent) }}>管理绑定</Button></div></>}<h4>来源路径</h4><p className="resource-path">{resource.path}</p><Button variant="secondary" onClick={() => { void run(async () => { await api.request('openPath', { path: resource.path }) }) }}><FolderOpen size={16} />打开资源</Button><h4>已绑定员工 · {bound.length}</h4>{bound.map(agent => <Button variant="ghost" size="content" key={agent.id} className="entity-row" onClick={() => onAgent(agent)}><Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} small />{agent.name}<span>管理 →</span></Button>)}{!bound.length && <p className="field-hint">尚未绑定。可在员工详情中启用。</p>}<h4>已共享到群或会话 · {shared.length}</h4>{shared.map(c => <p className="list-label" key={c.id}>{c.title}</p>)}{!shared.length && <p className="field-hint">尚未共享到会话。</p>}<div className="danger-section"><Button variant="destructive" onClick={() => setConfirm(true)}>移除资源</Button>{confirm && <div className="inline-confirm"><p>移除此受管资源，并撤销 {bound.length} 位员工及 {shared.length} 个会话的相关绑定。原始导入文件不受影响。</p><div className="button-row"><Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>保留</Button><Button variant="destructive" size="sm" disabled={busy} onClick={() => { void run(async () => { await api.request('removeResource', { id: resource.id }); await refresh(); onRemoved() }) }}>确认移除</Button></div></div>}</div></div>
}
