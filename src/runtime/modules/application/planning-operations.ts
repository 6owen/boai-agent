/*
 * [INPUT]: Original ProductStore, real employee/conversation identity and authenticated application actor.
 * [OUTPUT]: Persistent scoped planning mode, CAS transitions and runtime context; no execution or extra authority.
 * [POS]: Application planning domain, distinct from tasks, execution Work and a dependency plan graph.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Conversation, DigitalAgent } from '../../../shared/domain'
import type { ApplicationActor } from '../../../shared/domain/application-protocol'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'

const id = z.string().min(1).max(200)
const scope = z.object({ agentId: id, conversationId: id }).strict()
const change = scope.extend({ expectedRevision: z.number().int().nonnegative() }).strict()
export interface PlanningState { id: string; agentId: string; conversationId: string; active: boolean; since: string | null; revision: number; updatedAt: string }
const collection = 'agentPlanningModes'
const key = (agentId: string, conversationId: string) => createHash('sha256').update(JSON.stringify([agentId, conversationId])).digest('hex')
async function read(tx: RecordTransaction, input: z.infer<typeof scope>, actor: ApplicationActor) {
  const agent = await tx.get<DigitalAgent>('agents', input.agentId), room = await tx.get<Conversation>('conversations', input.conversationId)
  if (!agent || !room?.agentIds.includes(agent.id) || room.list?.hidden || actor.kind !== 'owner' && (actor.employeeId !== agent.id || actor.conversationId !== room.id)) throw new ApplicationValidationError('NOT_FOUND', '规划状态不属于当前员工会话')
  const stateId = key(agent.id, room.id)
  return await tx.get<PlanningState>(collection, stateId) ?? { id: stateId, agentId: agent.id, conversationId: room.id, active: false, since: null, revision: 0, updatedAt: '' }
}
export const readPlanningState = (store: ProductStore, agentId: string, conversationId: string) => store.transaction(tx => read(tx, { agentId, conversationId }, { kind: 'owner' }))

export function planningInstructions(state: PlanningState) {
  if (!state.active) return ''
  return '[Current conversation planning mode]\n' + JSON.stringify(state) + '\nYou are outlining an approach in this employee conversation. Keep planning separate from carrying out the business task. Preserve the full goal, dependencies, concrete acceptance and unresolved questions. Use planning.get/exit through the supplied application protocol when appropriate; a newer tool result supersedes this start-of-turn snapshot. Exit when the plan is finalized. Entering or exiting mode does not grant authorization, execute any step, create a scheduled task or prove completion. Follow the current user request: if they only asked for a plan, deliver the plan and do not implement it. An explicitly requested file plan can use the existing file workflow. This mode is not a filesystem sandbox or a permission change.'
}

export function planningOperations(store: ProductStore): ApplicationOperation[] {
  return [
    { name: 'planning.get', description: '读取规划状态和 revision。员工工具传 {} 即由宿主确定当前员工/会话；owner CLI 必须明确 agentId/conversationId。只读，不创建任务。', effect: 'read', input: scope.partial().strict(), resultType: 'PlanningState', execute: (input, _, actor) => {
      const resolved = scope.parse({ agentId: input.agentId ?? (actor.kind !== 'owner' ? actor.employeeId : undefined), conversationId: input.conversationId ?? (actor.kind !== 'owner' ? actor.conversationId : undefined) })
      return store.transaction(tx => read(tx, resolved, actor))
    } },
    ...(['enter', 'exit'] as const).map(action => ({ name: `planning.${action}`, description: action === 'enter' ? '进入当前员工会话的结构化规划状态；持久保存但不启动执行、不改变权限。已进入时保持原 since。' : '退出当前员工会话的规划状态；不启动工作、不把计划标记为已执行。', effect: 'write' as const, input: change, resultType: 'PlanningState',
      validate: async (input: z.infer<typeof change>) => {
        const current = await readPlanningState(store, input.agentId, input.conversationId)
        if (current.revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '规划状态已变化，请先读取当前版本')
      },
      execute: (input: z.infer<typeof change>, _: string | undefined, actor: ApplicationActor) => store.transaction(async tx => {
        const current = await read(tx, input, actor)
        if (current.revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '规划状态已变化，请先读取当前版本')
        const active = action === 'enter'
        if (current.active === active) return current
        const time = new Date().toISOString(), next = { ...current, active, since: active ? time : null, revision: current.revision + 1, updatedAt: time }
        await tx.put({ collection, id: current.id, value: next }); return next
      }),
    })),
  ]
}
