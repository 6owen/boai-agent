/*
 * [OUTPUT]: 提示词读取就绪与空目录分离，分组页首帧保留结构并支持失败重读。
 * [OUTPUT]: 资源库新增全局提示词分类/默认收起分组，编辑/新建交给Shell右侧面板；修改广播同步Composer的$引用候选。
 * [OUTPUT]: 资源库左侧技能/MCP/API/本地文件夹分组默认全部收起，手动展开和搜索显示匹配项保持。
 * [OUTPUT]: 数据源行内操作按回执更新原行并刷新目录，删除立即移除侧栏/目录并通知Shell关闭对应详情。
 * [OUTPUT]: 数据源选中与结果定位打开Shell右侧详情，主目录保持；技能与数据源共用全局面板。
 * [OUTPUT]: 工作区显示为资源库；左侧标题直接复用会话的conversation-list-panel/list-heading结构、字体和响应式缩进。
 * [OUTPUT]: 统一技能/数据源AI管理导航，真实数据源结果按稳定ID定位目录详情。
 * [OUTPUT]: 移除已安装总标题；侧栏滚动视口贴右边缘，内边距移至列表内容，分类/检索保持原缩进。
 * [INPUT]: Existing Skills workspace, installed skill catalog and data source lifecycle APIs.
 * [OUTPUT]: 自定义侧栏按技能/MCP/API/本地文件夹复用会话Collapsible高度/箭头动画，组内保持有界虚拟渲染，主目录和Shell右侧技能详情并存。
 * [POS]: Keeps the existing skills route and library capabilities; owns no execution or secrets.
 * [PROTOCOL]: 变化同步 Header 与 .folder.md。
 */
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type RefObject } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import type { DataSource } from '@boai/shared/domain/sources'
import type { LocalSkillCatalog } from '@boai/shared/domain/skills'
import type { PromptTemplate } from '@boai/shared/domain/prompt-templates'
import { Banner, errorText, GuardContext } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Search, Zap, Database, ChevronRight, FileText } from '@/components/icons'
import { PromptTemplatesView } from './prompt-templates-view'
import { SkillsWorkspace } from './skills-workspace'
import { useLocalSkills } from './use-local-skills'
import { SourceIcon, SourcesView } from '../sources/sources-view'

type Props = ComponentProps<typeof SkillsWorkspace> & { focusSource?: { id: string; requestId: string }; selectedSource?: string; onOpenSource(source: { id: string; name: string }): void; onRemoveSource(id: string): void; selectedPrompt?: string; onOpenPrompt(prompt: { id: string; name: string }): void; onCreatePrompt(): void; onRemovePrompt(id: string): void }
export function CustomizationWorkspace(props: Props) {
  const { api, divider, focusSkill, revision } = props
  const [category, setCategory] = useState<'skills' | 'sources' | 'prompts'>('skills')
  const [prompts, setPrompts] = useState<PromptTemplate[]>([])
  const [promptsReady, setPromptsReady] = useState(false)
  const sourceId = props.selectedSource
  const [skillFocus, setSkillFocus] = useState(focusSkill), [catalogKey, setCatalogKey] = useState(0)
  const [sources, setSources] = useState<DataSource[]>([]), [error, setError] = useState(''), [query, setQuery] = useState('')
  const { catalog, error: skillError } = useLocalSkills(api, revision), [updatedCatalog, setUpdatedCatalog] = useState<LocalSkillCatalog | null>(null)
  const guard = useContext(GuardContext), scroll = useRef<HTMLDivElement>(null), generation = useRef(0)
  const reload = useCallback(async (saved?: DataSource) => {
    const request = ++generation.current
    if (saved) setSources(items => items.map(item => item.id === saved.id && item.revision <= saved.revision ? saved : item))
    const [sourceResult, promptResult] = await Promise.allSettled([api.request('listDataSources', undefined), api.request('listPromptTemplates', undefined)])
    if (request !== generation.current) return
    if (sourceResult.status === 'fulfilled') setSources(sourceResult.value)
    if (promptResult.status === 'fulfilled') { setPrompts(promptResult.value); setPromptsReady(true) }
    setError([sourceResult, promptResult].flatMap(result => result.status === 'rejected' ? [errorText(result.reason)] : []).join('；'))
  }, [api])
  useEffect(() => {
    void reload(); let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !event.conversationId && !timer) timer = setTimeout(() => { timer = undefined; void reload() }, 120) })
    return () => { generation.current++; clearTimeout(timer); unsubscribe() }
  }, [api, reload])
  useEffect(() => { if (props.focusSource) { setCategory('sources') } }, [props.focusSource])
  useEffect(() => { if (focusSkill) { setCategory('skills'); setSkillFocus(focusSkill) } }, [focusSkill])
  useEffect(() => { setUpdatedCatalog(null) }, [revision])
  const openSkill = (id: string) => guard.navigate(() => { setCategory('skills'); props.onSection('all'); setSkillFocus({ id, requestId: crypto.randomUUID() }) })
  const rows = useMemo<InstalledRow[]>(() => [
    ...sources.map(source => ({ id: source.id, kind: 'source' as const, name: source.name, source })),
    ...((updatedCatalog ?? catalog)?.skills ?? []).map(skill => ({ id: skill.id, kind: 'skill' as const, name: skill.name, source: undefined })),
    ...prompts.map(prompt => ({ id: prompt.id, kind: 'prompt' as const, name: prompt.name, source: undefined })),
  ].filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [sources, catalog, updatedCatalog, prompts, query])
  const [collapsed, setCollapsed] = useState<string[]>(['skills', 'mcp', 'api', 'local', 'prompts'])
  return <div className="conversation-layout customization-workspace">
    <aside className="conversation-list-container custom-sidebar" aria-label="资源库导航"><div className="conversation-list-panel custom-sidebar-heading"><div className="list-heading"><h2>资源库</h2></div></div>
      <div className="custom-categories"><Button variant="ghost" size="content" aria-current={category === 'skills' ? 'page' : undefined} onClick={() => guard.navigate(() => { setCategory('skills'); setSkillFocus(undefined); setCatalogKey(key => key + 1) })}><Zap />技能</Button><Button variant="ghost" size="content" aria-current={category === 'sources' ? 'page' : undefined} onClick={() => guard.navigate(() => { setCategory('sources') })}><Database />数据源</Button><Button variant="ghost" size="content" aria-current={category === 'prompts' ? 'page' : undefined} onClick={() => guard.navigate(() => setCategory('prompts'))}><FileText />提示词</Button></div>
      <div className="custom-installed-search"><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索技能、数据源和提示词" placeholder="搜索资源" value={query} onChange={event => { setQuery(event.target.value); scroll.current?.scrollTo(0, 0) }} /></InputGroup></div>
      {(error || skillError) && <Banner>{error || skillError}</Banner>}
      <div ref={scroll} className="custom-installed-list" aria-label="技能、数据源和提示词"><div>{(['skills', 'mcp', 'api', 'local', 'prompts'] as const).map(group => {
        const members = rows.filter(row => group === 'skills' ? row.kind === 'skill' : group === 'prompts' ? row.kind === 'prompt' : row.source?.type === group)
        if (!members.length) return null
        const label = { skills: '技能', mcp: 'MCP', api: 'API', local: '本地文件夹', prompts: '提示词' }[group]
        return <Collapsible key={group} open={Boolean(query) || !collapsed.includes(group)} onOpenChange={open => { if (!query) setCollapsed(items => open ? items.filter(id => id !== group) : [...items, group]) }}>
          <CollapsibleTrigger aria-label={`已安装的${label}`} render={<Button variant="ghost" size="content" className="conversation-section-heading" />}><span>{label}</span><ChevronRight /></CollapsibleTrigger>
          <CollapsibleContent><InstalledItems rows={members} scroll={scroll} selected={category === 'sources' ? sourceId : category === 'prompts' ? props.selectedPrompt : undefined} onSelect={row => row.kind === 'skill' ? openSkill(row.id) : row.kind === 'prompt' ? guard.navigate(() => { setCategory('prompts'); props.onOpenPrompt(row) }) : guard.navigate(() => { setCategory('sources'); props.onOpenSource(row) })} /></CollapsibleContent>
        </Collapsible>
      })}</div>{!rows.length && <p className="field-hint">{query ? '没有匹配的项目' : '添加资源后，会显示在这里。'}</p>}</div>
    </aside>{divider}<main className="conversation-stage custom-content" aria-label="资源库内容">
      {category === 'skills' ? <SkillsWorkspace {...props} key={catalogKey} divider={null} embedded focusSkill={skillFocus} onCatalogChange={setUpdatedCatalog} /> : category === 'prompts' ? <PromptTemplatesView api={api} prompts={prompts} loaded={promptsReady} onReload={() => { void reload() }} selected={props.selectedPrompt} onOpen={props.onOpenPrompt} onCreate={props.onCreatePrompt} onRemoved={id => { setPrompts(items => items.filter(item => item.id !== id)); props.onRemovePrompt(id); void reload() }} /> : <SourcesView api={api} onManage={() => props.onManage?.('sources')} sources={sources} selected={sourceId} onSelect={props.onOpenSource} onChanged={source => void reload(source)} onRemoved={id => { setSources(items => items.filter(item => item.id !== id)); props.onRemoveSource(id); void reload() }} />}
    </main>
  </div>
}


type InstalledRow = { id: string; kind: 'source' | 'skill' | 'prompt'; name: string; source?: DataSource }
function InstalledItems({ rows, scroll, selected, onSelect }: { rows: InstalledRow[]; scroll: RefObject<HTMLDivElement | null>; selected?: string; onSelect(row: InstalledRow): void }) {
  const body = useRef<HTMLDivElement>(null), [scrollMargin, setScrollMargin] = useState(0), [focused, setFocused] = useState<string>()
  // Observe the groups' combined height so rows stay virtualized while preceding groups animate.
  useLayoutEffect(() => {
    const viewport = scroll.current, element = body.current
    if (!viewport || !element) return
    const measure = () => setScrollMargin(element.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport.firstElementChild ?? viewport)
    return () => observer.disconnect()
  }, [scroll])
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroll.current, estimateSize: () => 38, getItemKey: i => `${rows[i].kind}:${rows[i].id}`, scrollMargin, overscan: 8, rangeExtractor: range => { const values = new Set(defaultRangeExtractor(range)), index = rows.findIndex(row => row.id === focused); if (index >= 0) values.add(index); return [...values].sort((a, b) => a - b) } })
  return <div ref={body} style={{ height: virtual.getTotalSize(), position: 'relative' }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(undefined) }}>{virtual.getVirtualItems().map(item => {
    const row = rows[item.index]
    return <Button variant="ghost" size="content" key={item.key} className="custom-installed-item" style={{ position: 'absolute', top: item.start - scrollMargin, height: item.size }} onFocus={() => setFocused(row.id)} aria-label={`${row.kind === 'source' ? '数据源' : row.kind === 'prompt' ? '提示词' : '技能'}：${row.name}`} aria-current={selected === row.id ? 'true' : undefined} onClick={() => onSelect(row)}>{row.source ? <SourceIcon type={row.source.type} /> : row.kind === 'prompt' ? <FileText size={17} /> : <Zap size={17} />}<span>{row.name}</span>{row.source && !row.source.enabled && <small>停用</small>}</Button>
  })}</div>
}
