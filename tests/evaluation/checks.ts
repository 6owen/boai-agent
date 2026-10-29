/*
 * [OUTPUT]: 2026-10-11 原生完整执行和只读后工作区hash纳入评分输入及样本身份；旧无此字段样本hash保持。
 * [INPUT]: 保存的完整样本、评分侧答案、可选独立评审。
 * [OUTPUT]: SG-v1分工/字节读取链与故障检查；相关输入合同、阶段时间与夹具hash绑定评审身份，旧样本hash不变。
 * [OUTPUT]: 原确定性/语义评分及共享的合法评审引用ID；判分语义与旧样本hash不变，供judge明确引用合同。
 * [POS]: tests/evaluation/checks.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { relative } from 'node:path'
import type { CheckResult, CheckSpec, EvaluationCase, EvaluationRecord, EvaluationScore, ExternalReview } from './schema'
import { SCORER_VERSION } from './schema'
import { checkMaterialDelivery } from './material-delivery'
import { checkGroupSupervision } from './group-supervision'
export const sampleHash = (record: EvaluationRecord) => createHash('sha256').update(JSON.stringify({ caseId: record.caseId, prompt: record.prompt, metadata: record.metadata, detail: record.detail, artifacts: record.artifacts, events: record.events, ...(record.nativeEvidence ? { nativeEvidence: record.nativeEvidence } : {}), ...(record.delivery ? { delivery: record.delivery, deliveryContract: { contract: record.scenario?.delivery, prompt: record.scenario?.prompt, checks: record.scenario?.checks, semantic: record.scenario?.semantic } } : {}), ...(record.scenario?.checks.some(check => check.kind === 'group-supervision') ? { supervision: { phases: record.phases, fixtureFiles: record.fixtureFiles, checks: record.scenario.checks, semantic: record.scenario.semantic, memberInstructions: record.scenario.memberInstructions } } : {}) })).digest('hex')
export const reviewEvidenceIds = (record: EvaluationRecord) => new Set([...(record.detail?.messages.map(message => message.id) ?? []), ...record.artifacts.flatMap(artifact => [artifact.id, artifact.path].filter((id): id is string => !!id)), ...(record.detail?.runs.map(run => run.id) ?? []), ...(record.delivery?.materials.map(value => value.material.id) ?? []), ...(record.delivery?.beforeRestart?.revisionRequests.map(value => value.id) ?? []), ...(record.delivery?.beforeRestart?.previews.flatMap(value => value.adoption.events.map(event => event.id)) ?? [])])
const result = (name: string, passed: boolean | undefined, reason: string, evidence: string[] = []): CheckResult => ({ name, status: passed === undefined ? 'incomplete' : passed ? 'passed' : 'failed', reason, evidence })
function measured(record: EvaluationRecord) {
  const primary = record.detail?.messages.find(message => message.senderType === 'user' && Date.parse(message.createdAt) >= record.sentAt)
  const turns = record.detail?.turns?.filter(turn => primary && Date.parse(turn.createdAt) >= Date.parse(primary.createdAt)) ?? []
  const ids = new Set(turns.map(turn => turn.id))
  return { turns, runs: record.detail?.runs.filter(run => run.turnId && ids.has(run.turnId)) ?? [], replies: record.detail?.messages.filter(message => message.senderType === 'agent' && message.status === 'completed' && message.turnId && ids.has(message.turnId)) ?? [], ids }
}
function check(record: EvaluationRecord, spec: Exclude<CheckSpec, { kind: 'material-delivery' | 'group-supervision' }>): CheckResult {
  const data = measured(record), detail = record.detail!
  const name = spec.kind + ('name' in spec ? `:${spec.name}` : '')
  if (spec.kind === 'first-opportunity') {
    if (!detail.decisions || !detail.deliveries) return result(name, undefined, '缺少判断/投递证据')
    const first = data.turns.find(turn => !turn.workId)
    const got = new Set(detail.decisions.filter(decision => decision.turnId === first?.id && detail.events?.some(event => event.type === 'user_message' && detail.deliveries?.some(delivery => delivery.id === decision.deliveryId && delivery.eventId === event.id))).map(decision => decision.agentId))
    const eligible = record.scenario?.mention === undefined ? record.metadata.members : record.metadata.members.filter((_, index) => index === record.scenario!.mention)
    return result(name, eligible.length > 0 && eligible.every(member => got.has(member.id)), '逐正式收件人检查原始用户投递的有效决定，模型失败不算 pass', [...got])
  }
  if (spec.kind === 'no-tools') return result(name, data.runs.every(run => run.toolEvents.every(tool => spec.allowed?.includes(tool.name))), '不得调用题设许可之外的工具', data.runs.flatMap(run => run.toolEvents.map(tool => `${run.id}:${tool.name}`)))
  if (spec.kind === 'no-replies') return result(name, data.replies.length === 0, '明确无需确认时保持沉默', data.replies.map(message => message.id))
  if (spec.kind === 'no-work') return result(name, detail.workItems ? detail.workItems.length === 0 : undefined, '普通聊天不创建工作项', detail.workItems?.map(work => work.id))
  if (spec.kind === 'only-member') {
    const member = record.metadata.members[spec.member]?.id
    return result(name, !!member && data.replies.length > 0 && data.replies.every(message => message.senderId === member), '正式/题设收件人有回复且无人抢答', data.replies.map(message => message.id))
  }
  if (spec.kind === 'text-pattern') return result(name, new RegExp(spec.pattern, 'u').test(data.replies.map(message => message.content).join('\n')), '目标模式只用于可客观核对的字段，不能替代语义评审', data.replies.map(message => message.id))
  if (spec.kind === 'event-hit') { const event = record.events?.find(event => event.id === spec.id); return result(name, event ? event.status === 'applied' : undefined, '故障/途中输入必须确实命中，未触发不能通过', event ? [JSON.stringify(event)] : []) }
  if (spec.kind === 'delegation') {
    if (!detail.workItems || !detail.workWakes) return result(name, undefined, '缺少工作与等待版本证据')
    const child = detail.workItems.find(work => work.parentWorkId && work.status === 'delivered')
    const parent = detail.workItems.find(work => work.id === child?.parentWorkId && work.status === 'delivered')
    const wait = detail.workWakes.find(wake => wake.workId === parent?.id && wake.waitRevision >= 1 && wake.status === 'consumed' && wake.requiredResults.some(required => required.workId === child?.id && required.resultVersion >= 1))
    const dependency = parent?.observedResults.some(result => result.workId === child?.id && result.resultVersion >= 1)
    const childReply = detail.messages.filter(message => child?.resultMessageIds.includes(message.id)).sort((a, b) => b.sequence - a.sequence)[0]
    const parentReply = detail.messages.filter(message => parent?.resultMessageIds.includes(message.id)).sort((a, b) => b.sequence - a.sequence)[0]
    return result(name, !!(child && parent && wait && dependency && childReply && parentReply && parentReply.sequence > childReply.sequence), '子工作实际交付，父工作等待对应结果后交付', [child?.id, parent?.id, wait?.id].filter((id): id is string => !!id))
  }
  if (spec.kind === 'review-lineage') {
    const draft = record.artifacts.find(artifact => artifact.name === 'draft.md'), final = record.artifacts.find(artifact => artifact.name === 'report.md')
    const reviewer = record.metadata.members.find(member => /审核/.test(member.role))
    if (!draft || !final) return result(name, false, '缺少草稿或最终报告')
    const reads = data.runs.filter(run => run.agentId === reviewer?.id && run.status === 'completed').flatMap(run => run.toolEvents.filter(tool => tool.name === 'read_file' && tool.status === 'completed').map(tool => { try { return { run, value: JSON.parse(tool.detail) as { path: string; content: string } } } catch { return { run, value: undefined } } }))
    const review = reads.find(read => read.value?.path === `shared:/${relative(detail.conversation.workspacePath, draft.path).replaceAll('\\', '/')}`)
    if (!draft.complete || !final.complete || !review?.value?.content) return result(name, undefined, '审核读取正文或完整产物留证不足，不能根据“已审核”判通过')
    const reviewedHash = createHash('sha256').update(review.value.content).digest('hex')
    return result(name, !!(draft.sha256 === reviewedHash && final.sha256 === reviewedHash && final.content === draft.content && createHash('sha256').update(final.content ?? '').digest('hex') === reviewedHash && review.run.finishedAt && final.publishedAt && Date.parse(final.publishedAt) >= Date.parse(review.run.finishedAt)), '最终报告必须与实际读取审核的草稿同 hash，且在审核运行完成后发布', [draft.id, final.id, review.run.id].filter((id): id is string => !!id))
  }
  const artifact = record.artifacts.find(artifact => artifact.name === spec.name)
  if (!artifact) return result(name, false, `缺少真实发布产物 ${spec.name}`)
  if (!artifact.complete || !artifact.sha256 || artifact.content === undefined) return result(name, undefined, '缺少完整正文/hash，不能把截断文本算作完整产物', [artifact.id ?? artifact.path])
  if (createHash('sha256').update(artifact.content).digest('hex') !== artifact.sha256) return result(name, false, '产物正文与留证 hash 不匹配', [artifact.id ?? artifact.path])
  if (spec.kind === 'artifact') return result(name, (spec.member === undefined || artifact.ownerAgentId === record.metadata.members[spec.member]?.id) && (spec.contains ?? []).every(text => artifact.content!.includes(text)), '核对产物存在、内容和员工归属', [artifact.id ?? artifact.path])
  try {
    const parsed = JSON.parse(artifact.content)
    const correct = Object.entries(spec.fields).every(([key, expected]) => typeof expected === 'number' ? typeof parsed[key] === 'number' && Math.abs(parsed[key] - expected) <= (spec.tolerance ?? 0.005) : JSON.stringify(parsed[key]) === JSON.stringify(expected))
    return result(name, correct, '按评分侧公式结果核对 JSON 字段与误差，不依赖聊天宣称已完成', [artifact.id ?? artifact.path])
  } catch { return result(name, false, '产物不是有效 JSON', [artifact.id ?? artifact.path]) }
}
export function scoreRecord(record: EvaluationRecord, scenario: EvaluationCase, review?: ExternalReview, calibrated = false): EvaluationScore {
  record = { ...record, scenario }
  const data = measured(record), hash = sampleHash(record)
  const executionStatus = !record.sentAt || !record.detail || !data.turns.length ? 'incomplete' : record.error || data.turns.some(turn => ['failed', 'budget_exhausted', 'interrupted', 'cancelled'].includes(turn.status)) ? 'failed' : data.turns.every(turn => ['completed', 'waiting_user'].includes(turn.status)) ? 'completed' : 'incomplete'
  const hardChecks = record.detail ? scenario.checks.flatMap(spec => { try { return spec.kind === 'group-supervision' ? checkGroupSupervision(record, spec.exportConflict) : spec.kind === 'material-delivery' ? scenario.delivery ? checkMaterialDelivery(record, scenario.delivery) : [result(spec.kind, undefined, '缺少专用交付合同')] : [check(record, spec)] } catch (error) { return [result(spec.kind, undefined, `评分器异常：${String(error)}`)] } }) : [result('evidence', undefined, '没有完整运行记录')]
  let judgeStatus: EvaluationScore['judgeStatus'] = scenario.semantic.length ? 'pending' : 'not-required'
  let semanticVerdict: EvaluationScore['goalVerdict'] = scenario.semantic.length ? 'review-needed' : 'passed'
  if (review && scenario.semantic.length) {
    const references = reviewEvidenceIds(record)
    const valid = review.caseId === record.caseId && review.sampleHash === hash && review.scorerVersion === SCORER_VERSION && !!review.reviewer?.trim() && ['human', 'model-assisted'].includes(review.source) && Array.isArray(review.criteria) && scenario.semantic.every(criterion => review.criteria.filter(item => item?.criterion === criterion).length === 1 && review.criteria.some(item => item?.criterion === criterion && [0, 1, 2].includes(item.score) && typeof item.reason === 'string' && item.reason.trim() && Array.isArray(item.evidence) && item.evidence.length && item.evidence.every(id => references.has(id))))
    judgeStatus = valid ? review.source : 'invalid'
    semanticVerdict = !valid ? 'incomplete' : scenario.semantic.every(criterion => review.criteria.find(item => item.criterion === criterion)!.score === 2) ? 'passed' : 'failed'
    if (valid && review.source === 'model-assisted' && !calibrated) { judgeStatus = 'pending'; semanticVerdict = 'review-needed' }
  }
  const goalVerdict = hardChecks.some(check => check.status === 'failed') ? 'failed' : hardChecks.some(check => check.status === 'incomplete') ? 'incomplete' : semanticVerdict
  const runtimeErrors = [...record.runtimeErrors, ...data.runs.filter(run => ['failed', 'interrupted'].includes(run.status)).map(run => `${run.id}: ${run.error ?? run.status}`)]
  const completed = data.replies.map(message => Date.parse(data.runs.find(run => run.id === message.runId)?.finishedAt ?? message.createdAt)).filter(Number.isFinite)
  const usage = record.metrics?.usage
  return { caseId: record.caseId, matrixId: scenario.matrixId, category: scenario.category, cluster: scenario.cluster, split: scenario.split, scorerVersion: SCORER_VERSION, sampleHash: hash, executionStatus, hardChecks, goalVerdict, judgeStatus,
    verdict: executionStatus === 'failed' || goalVerdict === 'failed' ? 'failed' : executionStatus === 'incomplete' || goalVerdict === 'incomplete' ? 'incomplete' : goalVerdict,
    runtimeErrors, firstReplyMs: completed.length ? Math.min(...completed) - record.sentAt : null, lastReplyMs: completed.length ? Math.max(...completed) - record.sentAt : null,
    turnCompletedMs: data.turns.length && data.turns.every(turn => turn.finishedAt) ? Math.max(...data.turns.map(turn => Date.parse(turn.finishedAt!))) - record.sentAt : null,
    totalMs: record.elapsedMs, providerRequests: record.requests.length, totalTokens: usage && usage.totalRuns > 0 && usage.runsReportingEachField.totalTokens === usage.totalRuns ? usage.reported.totalTokens ?? null : null,
    usageCoverage: usage?.totalRuns ? (usage.runsReportingEachField.totalTokens ?? 0) / usage.totalRuns : null,
    decisionRuns: data.runs.filter(run => run.phase === 'decision').length, supersededDecisions: record.detail?.deliveries?.filter(delivery => delivery.supersededByDeliveryId).length ?? 0 }
}
