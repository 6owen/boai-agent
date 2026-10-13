/*
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 文件证据同时保留精确artifactId和实际已提交交付messageId，支持原消息导航；不推断旧记录来源。
 * [OUTPUT]: API计量随原预算只读投影；本机/混合范围由受理或实际运行来源判定，本机不展示用量预算。
 * [INPUT]: 同一次自动化的持久来源、轮次/工作/正文、已核查文件与实际执行器占用。
 * [OUTPUT]: 同轮多员工按各自公开问题回执保留未答等待，不由回复一个turn推断全部员工问题已答；旧完成/同伴失败轮次仅沿确切已提交Run/Work问题只读投影等待，不改写轮次或恢复执行。
 * [OUTPUT]: 已公开未回答问题优先于工作等待，活跃执行/审批和实际取消仍优先；普通消息不能解除等待。
 * [OUTPUT]: 自动化交付拒绝将 bobo 组织回执作为自身业务证据。
 * [OUTPUT]: 明确接续后的失败归并、累计额度/追加回执与旧证据保留；仅宿主明确补充解除对应提问的等待；新预算用量作为唯一统计来源、旧记录保持未知；跨接续的运行和交付分离汇总；独立依赖不获得归属，缺失证据不算交付。
 * [POS]: 自动化结果的纯投影；不调用模型、不执行或恢复工具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { isNativeBackend } from '../../../shared/domain/backends'
import type { AgentRun, Artifact, AutomationOccurrence, AutomationOrigin, DiscussionTurn, DecisionRecord, Message, WorkBudget, WorkItem, WorkWake } from '../../../shared/domain'
import { workBudgetExhausted } from '../collaboration/work-budget'
import { workEvidenceError } from '../collaboration/work-protocol'
import { publishedWorkQuestionMatches } from '../../../shared/domain/inbox'

const endedRun = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
const endedTurn = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'])
export function belongsToOccurrence(origin: AutomationOrigin | undefined, occurrence: AutomationOccurrence) {
  return origin?.occurrenceId === occurrence.id && origin.automationId === occurrence.automationId
}
/** Only a host-committed continuation in this occurrence answers its waiting turns. */
export function automationQuestionStates(messages: Message[], works: WorkItem[], decisions: DecisionRecord[] = [], runs: AgentRun[] = []) {
  const published = new Map(messages.filter(message => message.status === 'completed' && message.senderType === 'agent' && message.turnId).map(message => [message.id, message])), runById = new Map(runs.map(run => [run.id, run]))
  return [...works.map(work => ({ question: work.userQuestion, work })), ...decisions.map(decision => ({ question: decision.userQuestion, work: undefined }))].flatMap(({ question, work }) => {
    const message = question && published.get(question.messageId)
    return question && message ? [{ turnId: message.turnId!, answeredMessageId: question.answeredMessageId, ...(publishedWorkQuestionMatches(work, runById.get(message.runId ?? ''), message) ? { publishedTaskQuestion: true } : {}) }] : []
  })
}
export function unansweredAutomationTurns(o: AutomationOccurrence, turns: DiscussionTurn[], questions: { turnId: string; answeredMessageId?: string; publishedTaskQuestion?: boolean }[] = []) {
  const owned = turns.filter(turn => turn.conversationId === o.conversationId && belongsToOccurrence(turn.origin, o))
  const answered = new Set(owned.flatMap(turn => turn.replyToTurnIds ?? []))
  return owned.filter(turn => {
    const published = questions.filter(question => question.turnId === turn.id)
    if (turn.status !== 'waiting_user') return ['completed', 'failed'].includes(turn.status) && published.some(question => question.publishedTaskQuestion && !question.answeredMessageId)
    return published.length ? published.some(question => !question.answeredMessageId) : !answered.has(turn.id)
  })
}
interface Results {
  turns: DiscussionTurn[]
  decisions?: DecisionRecord[]
  runs: AgentRun[]
  messages: Message[]
  works: WorkItem[]
  wakes: WorkWake[]
  artifacts: Artifact[]
  verifiedArtifactIds: Set<string>
  activeRunIds: Set<string>
  activeTurnIds: Set<string>
  budget?: WorkBudget
}
export function aggregateAutomation(o: AutomationOccurrence, input: Results): Partial<AutomationOccurrence> | undefined {
  const owns = (origin?: AutomationOrigin) => belongsToOccurrence(origin, o)
  const works = input.works.filter(work => work.conversationId === o.conversationId && owns(work.origin))
  const workIds = new Set(works.map(work => work.id))
  const turns = input.turns.filter(turn => turn.conversationId === o.conversationId && (owns(turn.origin) || (!turn.origin && (turn.id === o.turnId || !!turn.workId && workIds.has(turn.workId)))))
  if (!turns.length && !works.length) return
  const turnIds = new Set(turns.map(turn => turn.id))
  const waitingTurns = unansweredAutomationTurns(o, turns, automationQuestionStates(input.messages, works, input.decisions, input.runs))
  const resumedTurns = new Set(turns.flatMap(turn => turn.resumesTurnIds ?? []))
  const resumedRuns = new Set(turns.flatMap(turn => turn.resumesRunIds ?? []))
  const runs = input.runs.filter(run => run.conversationId === o.conversationId && (owns(run.origin) || (!run.origin && (!!run.turnId && turnIds.has(run.turnId) || !!run.workId && workIds.has(run.workId)))))
  const runIds = new Set(runs.map(run => run.id))
  const messages = input.messages.filter(message => message.conversationId === o.conversationId && message.senderType === 'agent' && message.status === 'completed' && !!message.runId && runIds.has(message.runId))
  const evidence: NonNullable<AutomationOccurrence['resultEvidence']> = []
  const delivered = new Set<string>()
  for (const work of works) {
    if (work.requiresReview || !work.outcome) continue
    // The latest committed result belongs to this exact work/version; an old answer cannot prove a new result.
    const message = messages.find(message => message.id === work.resultMessageIds.at(-1))
    const run = runs.find(run => run.id === message?.runId && run.workId === work.id && run.status === 'completed')
    if (!message || !run) continue
    const artifacts = input.artifacts.filter(artifact => artifact.id && artifact.runId === run.id && work.artifactIds.includes(artifact.id) && input.verifiedArtifactIds.has(artifact.id))
    if (workEvidenceError(work.outcome, { content: message.content, artifactIds: artifacts.map(artifact => artifact.id!) }, work.status === 'waiting')) continue
    if (work.outcome.evidence?.some(item => item.kind === 'collaboration')) continue
    for (const item of work.outcome.evidence ?? []) if (item.kind !== 'collaboration') evidence.push({ kind: item.kind, reference: item.reference, workId: work.id, resultVersion: work.resultVersion, messageId: message.id, ...(item.kind === 'artifact' ? { artifactId: item.reference } : {}) })
    if (work.status === 'delivered' && work.outcome.disposition === 'delivered' && work.outcome.evidence?.length) delivered.add(work.id)
  }
  const live = runs.some(run => !endedRun.has(run.status) || input.activeRunIds.has(run.id)) || turns.some(turn => !endedTurn.has(turn.status) || input.activeTurnIds.has(turn.id))
  const waitingWork = works.some(work => ['ready', 'running', 'waiting'].includes(work.status)) || input.wakes.some(wake => workIds.has(wake.workId) && wake.kind !== 'blocked' && ['pending', 'scheduled'].includes(wake.status))
  const unresolved = (turn: DiscussionTurn) => {
    if (turn.workId && delivered.has(turn.workId)) return false
    const failures = runs.filter(run => run.turnId === turn.id && ['failed', 'cancelled', 'interrupted'].includes(run.status))
    return failures.length ? failures.some(run => run.workId ? !delivered.has(run.workId) : !resumedTurns.has(turn.id) && !resumedRuns.has(run.id)) : !resumedTurns.has(turn.id)
  }
  let status: AutomationOccurrence['status']
  if (o.cancellationRequestedAt) status = live ? 'cancelling' : 'cancelled'
  else if (live) status = runs.some(run => run.status === 'waiting_approval') ? 'waiting_approval' : 'running'
  else if (waitingTurns.length) status = 'waiting_user'
  else if (waitingWork) status = 'waiting_work'
  else if (works.some(work => work.status === 'interrupted') || turns.some(turn => turn.status === 'interrupted')) status = 'interrupted'
  else if (works.some(work => work.status === 'cancelled') || turns.some(turn => turn.status === 'cancelled' && unresolved(turn))) status = 'cancelled'
  else if (works.some(work => work.status === 'failed') || turns.some(turn => ['failed', 'budget_exhausted'].includes(turn.status) && unresolved(turn))) status = 'failed'
  else status = 'completed'
  const pending = ['running', 'waiting_work', 'waiting_user', 'waiting_approval', 'cancelling'].includes(status)
  const deliveryStatus = status === 'completed' && works.length > 0 && delivered.size === works.length ? 'delivered'
    : evidence.length ? 'partial' : pending ? 'pending' : works.length ? 'blocked' : 'unknown'
  const usage: NonNullable<AutomationOccurrence['usage']> = {}
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
    const values = runs.map(run => run.usage?.[key]).filter((value): value is number => value !== undefined)
    if (values.length) usage[key] = values.reduce((sum, value) => sum + value, 0)
  }
  const finishedAt = [...turns.map(turn => turn.finishedAt), ...runs.map(run => run.finishedAt), ...works.map(work => work.updatedAt), o.finishedAt].filter((time): time is string => !!time).sort().at(-1) ?? o.startedAt
  const budget = input.budget?.id === o.budgetId && input.budget?.accounting === 'model-calls-v1' ? input.budget : undefined
  const budgetScope = o.budgetScope ?? (runs.some(run => isNativeBackend(run.backend)) ? runs.every(run => isNativeBackend(run.backend)) ? 'native' as const : 'mixed' as const : undefined)
  return { ...(budgetScope ? { budgetScope } : {}), status, deliveryStatus, turnIds: [...turnIds], waitingTurnIds: waitingTurns.map(turn => turn.id), workIds: [...workIds], rootWorkIds: works.filter(work => !work.parentWorkId).map(work => work.id),
    runIds: [...runIds], resultMessageIds: messages.map(message => message.id), resultEvidence: evidence,
    modelCalls: budget?.modelCalls ?? turns.reduce((sum, turn) => sum + turn.modelCalls, 0), usage: budget?.usage ?? usage, usageIncomplete: budget?.usageIncomplete ?? true,
    ...(budget ? { budget: { ...(budget.callUnit ? { callUnit: budget.callUnit } : {}), maxModelCalls: budget.maxModelCalls, maxRuns: budget.maxRuns, maxOutputTokens: budget.maxOutputTokens, deadlineAt: budget.deadlineAt, runs: budget.runs, exhausted: workBudgetExhausted(budget), ...(budget.renewals ? { renewals: budget.renewals } : {}) } } : {}),
    finishedAt: pending ? undefined : finishedAt,
    reason: o.cancellationRequestedAt ? o.reason : status === 'completed' ? undefined : turns.find(turn => turn.reason && !resumedTurns.has(turn.id))?.reason ?? works.find(work => ['blocked', 'failed', 'interrupted'].includes(work.status))?.outcome?.summary }
}
