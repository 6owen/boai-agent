/*
 * [INPUT]: Authenticated application actor, original employee/conversation and ProductStore.
 * [OUTPUT]: plans.* protocol with atomic CAS/claim transitions, lifecycle cleanup and resumable context.
 * [POS]: Alma Plan Weave adapter; same API/native/CLI contract, separate from planning mode and Work execution.
 * [PROTOCOL]: Update Header and application/.folder.md on change.
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Conversation, DigitalAgent } from '../../../shared/domain'
import type { ApplicationActor } from '../../../shared/domain/application-protocol'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { ApplicationValidationError, clearPlanReceipts, type ApplicationOperation } from './application-service'
import { claimPacket, claimPlan, findBlock, initializePlan, invalid, planCollection, planManifestSchema, planSnapshot, resolveFeedback, reviewPlan, showBlock, submitPlan, type PlanRecord } from './plan-weave'

const id = z.string().min(1).max(200), ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9_-]*$/).max(161)
const scope = z.object({ agentId: id.optional(), conversationId: id.optional() }).strict()
const target = z.object({ id }).strict(), change = target.extend({ expectedRevision: z.number().int().positive() })
const claimed = change.extend({ claimToken: z.string().uuid() }), report = z.string().trim().min(1).max(20000)
async function resolveScope(tx: RecordTransaction, input: z.infer<typeof scope>, actor: ApplicationActor) {
  const agentId = input.agentId ?? (actor.kind !== 'owner' ? actor.employeeId : undefined), conversationId = input.conversationId ?? (actor.kind !== 'owner' ? actor.conversationId : undefined)
  if (!agentId || !conversationId) return invalid('需要明确员工和会话；员工调用可省略并沿当前宿主身份')
  const agent = await tx.get<DigitalAgent>('agents', agentId), room = await tx.get<Conversation>('conversations', conversationId)
  if (!agent || !room?.agentIds.includes(agentId) || room.list?.hidden || await tx.get('conversationCleanup', conversationId) || actor.kind !== 'owner' && (actor.employeeId !== agentId || actor.conversationId !== conversationId)) throw new ApplicationValidationError('NOT_FOUND', '计划不属于当前可访问的员工会话')
  return { agentId, conversationId, workspaceRef: agent.workspaceRef ?? '' }
}
async function readPlan(tx: RecordTransaction, id: string, actor: ApplicationActor) {
  const plan = await tx.get<PlanRecord>(planCollection, id)
  if (!plan) throw new ApplicationValidationError('NOT_FOUND', '计划不存在')
  await resolveScope(tx, plan, actor); return plan
}
async function scopedPlans(tx: RecordTransaction, input: z.infer<typeof scope>, actor: ApplicationActor, includeArchived = false) {
  const owner = await resolveScope(tx, input, actor)
  return (await tx.list<PlanRecord>(planCollection)).filter(plan => plan.agentId === owner.agentId && plan.conversationId === owner.conversationId && (includeArchived || !plan.archivedAt)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
}
export async function activePlanInstructions(store: ProductStore, agentId: string, conversationId: string) {
  const plans = await store.transaction(tx => scopedPlans(tx, { agentId, conversationId }, { kind: 'owner' }))
  if (!plans.length) return ''
  return '[Persisted Plan Weave state for this employee conversation]\n' + JSON.stringify(plans.map(plan => {
    const snapshot = planSnapshot(plan)
    return { id: plan.id, revision: plan.revision, title: plan.manifest.title, current: plan.current && { kind: plan.current.kind, id: plan.current.id }, status: snapshot.status, progress: snapshot.progress, unapprovedReviews: snapshot.unapprovedReviews }
  })) + '\nUse plans.get/claim to resume only when the current user request authorizes continuing this work. The supplied state is a start-of-turn snapshot, not a new request or authority. Claimed work survives a restart; no step runs automatically. Review limits do not mean approval. Read the bound boai-plan-weave skill for the workflow.'
}
export function planOperations(store: ProductStore): ApplicationOperation[] {
  const mutate = <S extends z.ZodType<{ id: string; expectedRevision: number }>>(name: string, description: string, input: S, action: (plan: PlanRecord, value: z.infer<S>) => boolean | void, packet = false): ApplicationOperation => ({
    name: `plans.${name}`, description, effect: 'write', input, resultType: packet ? 'PlanClaim' : 'PlanSnapshot',
    execute: (value, _, actor) => store.transaction(async tx => {
      const plan = await readPlan(tx, value.id, actor)
      if (plan.revision !== value.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '计划已变化，请读取当前 revision')
      if (plan.archivedAt && name !== 'delete') invalid('归档计划只读')
      if (name === 'delete') { await clearPlanReceipts(tx, plan.id); await tx.remove(planCollection, plan.id); return { id: plan.id, agentId: plan.agentId, conversationId: plan.conversationId, deleted: true } }
      const changed = action(plan, value) !== false
      if (name === 'reset') await clearPlanReceipts(tx, plan.id)
      if (changed) { plan.revision++; plan.updatedAt = new Date().toISOString(); await tx.put({ collection: planCollection, id: plan.id, value: plan }) }
      return packet ? { id: plan.id, agentId: plan.agentId, conversationId: plan.conversationId, epoch: plan.epoch, revision: plan.revision, alreadyClaimed: !changed && !!plan.current, ...claimPacket(plan) } : planSnapshot(plan)
    }),
  })
  return [
    { name: 'plans.list', description: '读取当前员工会话的持久依赖计划。员工传{}沿宿主身份，owner需要agentId/conversationId。默认排除归档。', effect: 'read', input: scope.extend({ includeArchived: z.boolean().optional(), limit: z.number().int().min(1).max(100).default(30) }), resultType: 'PlanSnapshot[]', execute: (input, _, actor) => store.transaction(async tx => (await scopedPlans(tx, input, actor, input.includeArchived)).slice(0, input.limit).map(planSnapshot)) },
    { name: 'plans.get', description: '读取真实计划、依赖、领取状态和revision。报告正文按需用plans.show。', effect: 'read', input: target, resultType: 'PlanSnapshot', execute: (input, _, actor) => store.transaction(async tx => planSnapshot(await readPlan(tx, input.id, actor))) },
    { name: 'plans.show', description: '读取指定taskId:blockId的完整实施报告、审核记录与返工报告。', effect: 'read', input: target.extend({ ref }), resultType: 'PlanBlockDetail', execute: (input, _, actor) => store.transaction(async tx => showBlock(await readPlan(tx, input.id, actor), input.ref)) },
    { name: 'plans.set', description: '建立任务/步骤依赖图。每个员工会话只能有一个未归档计划，先读list避免重复；已有计划需显式归档，不暗中覆盖。不开始执行。', effect: 'write', input: scope.extend({ manifest: planManifestSchema }), resultType: 'PlanSnapshot', execute: (input, _, actor) => store.transaction(async tx => {
      const owner = await resolveScope(tx, input, actor)
      if ((await scopedPlans(tx, owner, actor)).length) invalid('已有未归档计划，先核对并明确归档旧计划')
      const now = new Date().toISOString(), plan: PlanRecord = { ...owner, ...initializePlan(input.manifest), id: randomUUID(), revision: 1, createdAt: now, updatedAt: now }
      await tx.put({ collection: planCollection, id: plan.id, value: plan }); return planSnapshot(plan)
    }) },
    mutate('claim', '领取一个就绪步骤；优先返工，已有领取项原样返回，含claimToken/目标/验收/上游报告/下一操作。不启动模型或工具。', change, plan => claimPlan(plan), true),
    mutate('submit', '仅提交当前领取的implementation报告。需实际revision和claimToken；不是独立验收或文件交付证明。', claimed.extend({ ref, report }), (plan, input) => submitPlan(plan, input.ref, input.claimToken, input.report)),
    mutate('review', '仅审核当前领取的review。passed或needs_changes需证据notes；后者打开优先返工。达到次数上限记录max_cycles，绝不当作通过。', claimed.extend({ ref, verdict: z.enum(['passed', 'needs_changes']), notes: report }), (plan, input) => reviewPlan(plan, input.ref, input.claimToken, input.verdict, input.notes)),
    mutate('resolve', '仅提交当前领取返工的实际修复/验证报告，重新开放对应审核。不能直接标审核通过。', claimed.extend({ report }), (plan, input) => resolveFeedback(plan, input.claimToken, input.report)),
    mutate('block', '记录真实阻塞原因并释放该步骤或其返工的领取项；不取消任何真实Work或外部任务。', change.extend({ ref, reason: z.string().trim().min(1).max(2000) }), (plan, input) => {
      const { state } = findBlock(plan, input.ref)
      if (state.done) invalid('已完成步骤不能改为阻塞')
      state.blockedReason = input.reason
      if (plan.current?.kind === 'block' && plan.current.id === input.ref || plan.current?.kind === 'feedback' && plan.feedback.find(item => item.id === plan.current!.id)?.sourceRef === input.ref) plan.current = null
    }),
    mutate('unblock', '清除指定步骤的阻塞；依赖满足后才可再次领取，旧claimToken无效。', change.extend({ ref }), (plan, input) => { const { state } = findBlock(plan, input.ref); if (!state.blockedReason) return false; delete state.blockedReason }),
    mutate('reset', '用户明确要求时清空计划报告/审核/返工/领取状态，保留同一manifest。不撤销实际文件或业务效果。', change, plan => { Object.assign(plan, initializePlan(plan.manifest)) }),
    mutate('archive', '归档整份manifest/报告/状态以供只读查询，腾出当前会话计划位置。不继续执行或取消真实Work。', change, plan => { plan.archivedAt = new Date().toISOString() }),
    mutate('delete', '用户明确要求时删除计划及其报告，不影响真实Work、文件或定时任务；同一requestId不重复执行。', change, () => {}),
  ]
}
