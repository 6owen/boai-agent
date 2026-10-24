/*
 * [OUTPUT]: 虚拟旅行保留能力开关/规则编辑及已有旅程状态，移除手动目的地输入和开始按钮。
 * [OUTPUT]: 后台活动直接展示/确认删除/截止时间清空；沿原写队列和未知回执核对，只刷新历史。
 * [INPUT]: Actual employee, saved profile/state/behavior receipts through the application protocol.
 * [OUTPUT]: Field-local saving with serialized revisioned writes; state/history refresh independently without dimming or remounting the dialog.
 * [OUTPUT]: Fatigue is the last state-card item with a highlighted rest button; prompt-loading switches sit beside their source files.
 * [OUTPUT]: Source files and background activity records are direct sections without an advanced-settings accordion.
 * [POS]: Employee advanced configuration; keeps existing dirty guard and Sonner errors.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { InfoIcon } from '@/components/icons'
import { toast } from 'sonner'
import type { DesktopApi } from '@shared/ipc'
import type { DigitalAgent, Snapshot } from '@shared/domain'
import { normalizeAgentProfile, primaryPersonalityRoom, promptScenes, type PromptScene, type AgentSourceName, type AgentProfile, type AgentProfileConfig, type AgentStateView, type AgentPersonalityState, type AgentBehaviorRun } from '@shared/domain/agent-profile'
import { agentPromptModules } from '@shared/domain/agent-prompts'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Field, FieldTitle } from '@/components/ui/field'
import { Loading, errorText, useMutation } from '@/components/common'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentActivityHistory } from './agent-activity-history'
import { SelectField } from '@/components/ui/select-field'
import { ContactProfileCard, ContactProfileSection } from './profile-card'

async function call<T>(api: DesktopApi, operation: string, input: Record<string, unknown>, requestId?: string): Promise<T> {
  const result = await api.request('executeApplicationOperation', { operation: `employees.${operation}`, input, requestId })
  if (result.status !== 'succeeded') throw new Error(result.error?.message ?? `操作状态：${result.status}，请核对原配置或运行记录。`)
  return result.data as T
}
const conversationRules = [
  { scene: 'direct', description: '与用户单独交流时，怎样接话和表达。' },
  { scene: 'group', description: '在多人讨论中，怎样参与和回应。' },
  { scene: 'channel', description: '通过外部渠道交流时的表达约定。' },
  { scene: 'task', description: '执行具体任务时的补充要求。' },
] as const
const stateFeatures: { key: keyof AgentProfileConfig['features']; label: string; description: string; scene?: PromptScene; editLabel?: string }[] = [
  { key: 'emotions', label: '情绪', description: '让心情影响表达；后台会根据新的交流更新心情。', scene: 'emotion', editLabel: '编辑判断规则' },
  { key: 'growth', label: '人格成长', description: '系统在日终回顾交流、整理记忆，有依据时积累细微的性格变化。', scene: 'reflection', editLabel: '编辑反思规则' },
  { key: 'travel', label: '虚拟旅行', description: '开启后，员工可根据交流与兴趣开始虚拟旅程，并按天积累虚拟经历。', scene: 'travel', editLabel: '编辑旅行规则' },
  { key: 'fatigue', label: '疲劳与休息', description: '根据交流量、休息时间和时段计算，影响闲聊与主动问候；无需单独提示词。' },
]
const configOf = ({ agentId: _agentId, revision: _revision, updatedAt: _updatedAt, ...config }: AgentProfile): AgentProfileConfig => config

type EditSource = (name: AgentSourceName, title: string) => void
type SourceFiles = (renderPromptSwitch: (name: string) => ReactNode) => ReactNode
type ProfileChange = (config: AgentProfileConfig) => AgentProfileConfig
type PendingChange = { key: string; update?: ProfileChange; perform(): Promise<void> }
function FieldHint({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`${label}说明`} />}><InfoIcon /></TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>
}
function PromptRuleAction({ scene, disabledPrompts, onEditSource, label = '编辑规则' }: { scene: PromptScene; disabledPrompts: PromptScene[]; onEditSource: EditSource; label?: string }) {
  return <div className="flex shrink-0 flex-col items-end gap-1">
    <Button type="button" variant="secondary" size="sm" aria-label={`编辑${agentPromptModules[scene].purpose}提示词`} onClick={() => onEditSource(`prompts/${scene}.md`, `${agentPromptModules[scene].purpose}提示词`)}>{label}</Button>
    {disabledPrompts.includes(scene) && <span className="text-xs text-muted-foreground">补充规则未加载</span>}
  </div>
}
export function PersonalityPane({ api, agent, snapshot, active, onBusyChange, onEditSource, sourceFiles }: { sourceFiles?: SourceFiles; api: DesktopApi; agent: DigitalAgent; snapshot: Snapshot; active: boolean; onBusyChange?(busy: boolean): void; onEditSource: EditSource }) {
  const [profile, setProfile] = useState<AgentProfile>()
  const [loadError, setLoadError] = useState(false)
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    if (!active) return
    let current = true
    setProfile(undefined)
    setLoadError(false)
    void call<AgentProfile>(api, 'profile', { agentId: agent.id }).then(value => { if (current) setProfile(normalizeAgentProfile(value)) }).catch(error => { if (current) { setLoadError(true); toast.error(error.message) } })
    return () => { current = false }
  }, [api, agent.id, active, epoch])
  if (!active) return null
  if (!profile || profile.agentId !== agent.id) return loadError ? <Button variant="secondary" onClick={() => setEpoch(value => value + 1)}>重新读取人格配置</Button> : <Loading />
  return <PersonalityForm key={`${profile.agentId}:${epoch}`} api={api} agent={agent} snapshot={snapshot} profile={profile} onBusyChange={onBusyChange} onEditSource={onEditSource} sourceFiles={sourceFiles} onReload={() => { setProfile(undefined); setEpoch(value => value + 1) }} />
}
function PersonalityForm({ api, agent, snapshot, profile, onBusyChange, onReload, onEditSource, sourceFiles }: { sourceFiles?: SourceFiles; api: DesktopApi; agent: DigitalAgent; snapshot: Snapshot; profile: AgentProfile; onBusyChange?(busy: boolean): void; onReload(): void; onEditSource: EditSource }) {
  const [saved, setSaved] = useState(profile), [draft, setDraft] = useState(configOf(profile))
  const [state, setState] = useState<AgentStateView>(), [history, setHistory] = useState<AgentBehaviorRun[]>([])
  const [unknown, setUnknown] = useState(false)
  const { busy, error, run, setError } = useMutation()
  const { busy: readingState, run: readState } = useMutation()
  const { busy: readingHistory, run: readHistory } = useMutation()
  const accepted = useRef(profile), stateRef = useRef<AgentStateView>(undefined)
  const changes = useRef<PendingChange[]>([]), [saving, setSaving] = useState<string[]>([])
  const stateRead = useRef(0), historyRead = useRef(0)
  const pending = useRef<{ fingerprint: string; id: string } | undefined>(undefined)
  const alive = useRef(true)
  useEffect(() => { onBusyChange?.(busy || unknown); return () => onBusyChange?.(false) }, [busy, unknown, onBusyChange])
  const room = primaryPersonalityRoom(agent.id, snapshot.conversations)
  const refreshState = async () => {
    const token = ++stateRead.current
    const view = await call<AgentStateView>(api, 'state', { agentId: agent.id, ...(room ? { conversationId: room.id } : {}) })
    if (alive.current && token === stateRead.current) { stateRef.current = view; setState(view) }
  }
  const refreshHistory = async () => {
    const token = ++historyRead.current
    const records = await call<AgentBehaviorRun[]>(api, 'behaviorHistory', { agentId: agent.id })
    if (alive.current && token === historyRead.current) setHistory(records)
  }
  const refresh = async () => { await Promise.all([refreshState(), refreshHistory()]) }
  useEffect(() => { alive.current = true; void refresh().catch(error => toast.error(error.message)); return () => { alive.current = false; stateRead.current++; historyRead.current++ } }, [api, agent.id, room?.id])
  useEffect(() => { if (!history.some(item => item.status === 'running')) return; const timer = setTimeout(() => { void refresh().catch(error => toast.error(error.message)) }, 1500); return () => clearTimeout(timer) }, [history])
  const write = async <T,>(operation: string, input: Record<string, unknown>) => {
    const fingerprint = JSON.stringify([operation, input])
    if (pending.current) throw new Error('上一次操作需要先核对，尚未提交新的更改。')
    pending.current = { fingerprint, id: crypto.randomUUID() }
    const result = await api.request('executeApplicationOperation', { operation: `employees.${operation}`, input, requestId: pending.current.id }).catch(error => { setUnknown(true); throw error })
    if (result.status === 'unknown' || result.status === 'running') { setUnknown(true); throw new Error('结果尚未确认，请核对配置与运行记录；同一操作不会自动重发。') }
    pending.current = undefined
    if (result.status !== 'succeeded') throw new Error(result.error?.message ?? '操作未完成')
    return result.data as T
  }
  const updateDraft = () => setDraft(changes.current.reduce((config, change) => change.update?.(config) ?? config, configOf(accepted.current)))
  const enqueue = (change: PendingChange) => {
    if (unknown || changes.current.some(item => item.key === change.key)) return
    changes.current.push(change); setSaving(changes.current.map(item => item.key)); updateDraft()
    void run(async () => {
      while (changes.current.length && alive.current) {
        const current = changes.current[0]
        try { await current.perform() } catch (cause) {
          if (pending.current) {
            // Freeze the visible draft; queued but unsent changes must not follow an unknown write.
            const queued = changes.current.length > 1
            changes.current = []; setSaving([])
            throw queued ? new Error(`${errorText(cause)} 后续排队修改尚未提交。`) : cause
          }
          const message = errorText(cause); setError(message); toast.error(message)
        }
        changes.current.shift(); setSaving(changes.current.map(item => item.key)); updateDraft()
      }
    })
  }
  const configure = (key: string, update: ProfileChange) => enqueue({ key, update, perform: async () => {
    const value = await write<AgentProfile>('configure', { agentId: agent.id, expectedRevision: accepted.current.revision, config: update(configOf(accepted.current)) })
    accepted.current = value; setSaved(value)
    if (key.startsWith('feature:')) void refreshState().catch(error => toast.error(error.message))
  } })
  const stateAction = (change: Record<string, unknown>) => enqueue({ key: String(change.action).startsWith('travel-') ? 'state:travel' : 'state:fatigue', perform: async () => {
    const view = stateRef.current
    if (!view) return
    const base = await write<AgentPersonalityState>('updateState', { agentId: agent.id, expectedRevision: view.base.revision, change })
    stateRef.current = { ...view, base }
    await refreshState()
  } })
  const recovery = unknown ? <Button variant="secondary" disabled={busy} onClick={() => { void run(async () => {
    const result = pending.current ? await api.request('getApplicationReceipt', { requestId: pending.current.id }) : null
    if (!result || result.status === 'running' || result.status === 'unknown') throw new Error('结果尚未确认，请稍后核对；不会重复提交。')
    if (result.status !== 'succeeded') toast.error(result.error?.message ?? '上次操作未完成，已重新读取配置。')
    onReload()
  }) }}>核对已保存配置与记录</Button> : error ? <Button variant="secondary" disabled={busy} onClick={onReload}>重新读取配置与记录</Button> : null
  return <div className="detail-section employee-form-sections">
      <fieldset className="space-y-5" disabled={unknown}>
        <ContactProfileSection title="人格与工作规则" hint="正文在编辑窗口保存；功能开关和提示词加载选择修改后立即保存。">
          <ContactProfileCard label="人格正文与工作规则" fields={false}><div className="space-y-3">
            <div className="flex items-center justify-between gap-4"><div><strong>人格</strong><p className="field-hint">性格、语气、表达习惯与相处方式。</p></div><Button type="button" variant="secondary" size="sm" onClick={() => onEditSource('SOUL.md', '人格正文')}>编辑人格</Button></div>
            <div className="flex items-center justify-between gap-4"><div><strong>工作规则</strong><p className="field-hint">处理任务时遵循的约定与要求。</p></div><Button type="button" variant="secondary" size="sm" onClick={() => onEditSource('AGENTS.md', '工作规则')}>编辑工作规则</Button></div>
          </div></ContactProfileCard>
        </ContactProfileSection>
        <ContactProfileSection title="对话与工作" hint="在基础人格和工作规则之外，按交流场合使用对应的补充规则。">
          <ContactProfileCard label="对话与工作的补充规则" fields={false}><div className="soft-divide-y">{conversationRules.map(({ scene, description }) => <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0" key={scene}>
            <div className="min-w-0"><strong>{agentPromptModules[scene].purpose}</strong><p className="field-hint">{description}</p></div>
            <PromptRuleAction scene={scene} disabledPrompts={draft.disabledPrompts} onEditSource={onEditSource} />
          </div>)}</div></ContactProfileCard>
        </ContactProfileSection>
        <ContactProfileSection title="状态与成长" hint="开启后由系统检查并更新，无需另外添加计划。应用运行时生效；没有新内容就跳过。" actions={<Button type="button" variant="ghost" size="sm" disabled={readingState} onClick={() => { void readState(refreshState) }}>刷新状态</Button>}>
          <ContactProfileCard label="状态能力与相关规则" fields={false}><div className="soft-divide-y">{stateFeatures.map(feature => <div className="space-y-3 py-3 first:pt-0 last:pb-0" key={feature.key}>
            <div className="flex items-center justify-between gap-4">
            <div className="min-w-0"><label htmlFor={`personality-${feature.key}`}><strong>{feature.label}</strong></label><p className="field-hint">{feature.description}</p></div>
            <div className="flex shrink-0 items-center gap-3"><Switch id={`personality-${feature.key}`} disabled={saving.includes(`feature:${feature.key}`)} checked={draft.features[feature.key]} onCheckedChange={checked => configure(`feature:${feature.key}`, config => ({ ...config, features: { ...config.features, [feature.key]: checked } }))} />{feature.scene && <PromptRuleAction scene={feature.scene} disabledPrompts={draft.disabledPrompts} onEditSource={onEditSource} label={feature.editLabel} />}</div>
            </div>
            {saved.features[feature.key] && feature.key !== 'growth' && (feature.key !== 'travel' || state?.base.travel?.active) && <fieldset disabled={saving.includes(`state:${feature.key}`)} className={feature.key === 'fatigue' ? 'connection-fields connection-model-picker' : 'space-y-2 text-sm'} role="region" aria-label={`${feature.label}当前状态`}>
              {!state ? <Loading /> : feature.key === 'emotions' ? <p>当前心情：{state.effective.mood} · 情绪 {state.effective.valence}/10 · 精力 {state.effective.energy}/10</p> : feature.key === 'fatigue' ? <Field orientation="horizontal" className="connection-setting-row connection-model-row grid">
                <FieldTitle><span className="connection-nested-line" aria-hidden="true" />当前疲劳</FieldTitle>
                <div className="flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-3">
                  <span className="text-sm tabular-nums">{state.effective.fatigue}/100{state.effective.sleeping ? ' · 休息中' : ''}</span>
                  <div className="flex shrink-0 items-center gap-3" role="group" aria-label="疲劳与休息操作">
                    <Button type="button" variant={state.effective.sleeping ? 'default' : 'secondary'} size="sm" aria-pressed={state.effective.sleeping} title={state.effective.sleeping ? '点击唤醒' : '开始休息'} onClick={() => stateAction({ action: state.effective.sleeping ? 'wake' : 'sleep' })}>{state.effective.sleeping ? '休息中' : '休息'}</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => stateAction({ action: 'rest' })}>恢复精力</Button>
                  </div>
                </div>
              </Field> : state.base.travel?.active ? <><p>当前旅程：{state.base.travel.destination} · 第 {state.base.travel.day} 天</p><Button type="button" variant="secondary" size="sm" onClick={() => stateAction({ action: 'travel-return' })}>结束虚拟旅行</Button></> : null}
            </fieldset>}
          </div>)}</div></ContactProfileCard>
        </ContactProfileSection>
      </fieldset>
      <fieldset disabled={unknown}>
        <ContactProfileSection title="主动交流" hint="在私聊中主动联系你。后台结合近期交流判断是否值得开口，并遵守频率和免打扰设置；修改后立即保存。">
          <ContactProfileCard label="主动交流偏好" fields={false}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0"><label htmlFor="personality-proactive"><strong>允许主动联系我</strong></label><p className="field-hint">有值得聊的话题或需要跟进的约定时再开口。</p></div>
              <div className="flex shrink-0 items-center gap-3"><Switch id="personality-proactive" disabled={saving.includes('proactive:enabled')} checked={draft.proactive.enabled} onCheckedChange={enabled => configure('proactive:enabled', config => ({ ...config, proactive: { ...config.proactive, enabled } }))} /><PromptRuleAction scene="greeting" disabledPrompts={draft.disabledPrompts} onEditSource={onEditSource} label="编辑交流规则" /></div>
            </div>
            {draft.proactive.enabled && <div className="mt-4 space-y-3">
              <Field orientation="horizontal"><FieldTitle>联系频率<FieldHint label="联系频率">频率是最小间隔；没有合适话题或你尚未回应时，会保持安静。</FieldHint></FieldTitle><SelectField aria-label="联系频率" size="sm" className="w-52" disabled={saving.includes('proactive:frequency')} value={draft.proactive.frequency} options={[{ value: 'low', label: '偶尔 · 至少间隔 12 小时' }, { value: 'normal', label: '适中 · 至少间隔 4 小时' }, { value: 'high', label: '较多 · 至少间隔 2 小时' }]} onValueChange={frequency => configure('proactive:frequency', config => ({ ...config, proactive: { ...config.proactive, frequency: frequency as AgentProfileConfig['proactive']['frequency'] } }))} /></Field>
              <Field orientation="horizontal"><FieldTitle>免打扰时段<FieldHint label="免打扰时段">使用本机时间，开始与结束相同表示不设免打扰。</FieldHint></FieldTitle><div className="flex items-center gap-2"><SelectField aria-label="免打扰开始" size="sm" className="w-22" disabled={saving.includes('proactive:quietStart')} value={draft.proactive.quietStart} options={Array.from({ length: 24 }, (_, value) => ({ value, label: `${String(value).padStart(2, '0')}:00` }))} onValueChange={value => configure('proactive:quietStart', config => ({ ...config, proactive: { ...config.proactive, quietStart: Number(value) } }))} /><span className="text-xs text-muted-foreground">至</span><SelectField aria-label="免打扰结束" size="sm" className="w-22" disabled={saving.includes('proactive:quietEnd')} value={draft.proactive.quietEnd} options={Array.from({ length: 24 }, (_, value) => ({ value, label: `${String(value).padStart(2, '0')}:00` }))} onValueChange={value => configure('proactive:quietEnd', config => ({ ...config, proactive: { ...config.proactive, quietEnd: Number(value) } }))} /></div></Field>
            </div>}
          </ContactProfileCard>
        </ContactProfileSection>
      </fieldset>
      {recovery}
      <fieldset disabled={unknown} className="space-y-5">
        {sourceFiles?.(name => {
          const scene = promptScenes.find(scene => name === `prompts/${scene}.md`)
          return scene ? <Switch id={`prompt-${scene}`} aria-label={`加载${agentPromptModules[scene].purpose}补充规则`} disabled={saving.includes(`prompt:${scene}`)} checked={!draft.disabledPrompts.includes(scene)} onCheckedChange={checked => configure(`prompt:${scene}`, config => ({ ...config, disabledPrompts: checked ? config.disabledPrompts.filter(item => item !== scene) : [...config.disabledPrompts, scene] }))} /> : null
        })}
        {saved.behaviors.length > 0 && <p className="field-hint">旧版手动行为计划已停用，原配置保留。后台活动现在由上方功能开关管理。</p>}
        <AgentActivityHistory history={history} disabled={unknown || readingHistory || saving.some(key => key.startsWith('history:'))}
          onStop={id => enqueue({ key: `history:${id}`, perform: async () => { await write('stopBehavior', { runId: id }); await refreshHistory() } })}
          onDelete={id => enqueue({ key: `history:delete:${id}`, perform: async () => { await write('deleteBehaviorHistory', { agentId: agent.id, runId: id }); await refreshHistory() } })}
          onClear={before => enqueue({ key: 'history:clear', perform: async () => { await write('clearBehaviorHistory', { agentId: agent.id, before }); await refreshHistory() } })}
          onRefresh={() => { void readHistory(refreshHistory) }} />
      </fieldset>
  </div>
}
