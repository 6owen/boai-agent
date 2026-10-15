/*
 * [INPUT]: 单次自动化冻结分工、当前Work持有者与SQLite事务。
 * [OUTPUT]: 固定子任务身份/职责、同次真实依赖与汇总交付门禁；不创建第二套调度器。
 * [POS]: WorkRepository复用的自动化分工规则，旧无分工计划保持原行为。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createHash } from 'node:crypto'
import type { AutomationOccurrence, WorkDelegation, WorkItem } from '../../../shared/domain'
import type { RecordTransaction } from '../../adapters/storage/product-store'
import { WorkUnavailableError } from '../collaboration/work-budget'

export const AUTOMATION_ROOT_KEY = 'automation-root'
export const automationAssignmentKey = (employeeId: string) => 'automation-assignment-' + createHash('sha256').update(employeeId).digest('hex').slice(0, 32)
async function collaboration(tx: RecordTransaction, work: WorkItem) {
  if (!work.origin) return
  const occurrence = await tx.get<AutomationOccurrence>('automationOccurrences', work.origin.occurrenceId)
  if (occurrence?.automationId !== work.origin.automationId || occurrence.conversationId !== work.conversationId) throw new WorkUnavailableError('自动化分工来源不一致')
  return occurrence.plan?.collaboration
}
async function ownedChild(tx: RecordTransaction, root: WorkItem, employeeId: string) {
  // Same stable parent/key identity as WorkRepository.delegate; direct reads remain bounded by the saved plan.
  const key = automationAssignmentKey(employeeId)
  const id = 'work-' + createHash('sha256').update(JSON.stringify([root.rootWorkId, key])).digest('hex')
  const item = await tx.get<WorkItem>('workItems', id)
  return item && item.ownerAgentId === employeeId && item.rootWorkId === root.rootWorkId && item.parentWorkId === root.rootWorkId && item.origin?.occurrenceId === root.origin?.occurrenceId && item.key === key ? item : undefined
}
export async function automationDelegation(tx: RecordTransaction, parent: WorkItem, proposal: WorkDelegation): Promise<WorkDelegation> {
  const plan = await collaboration(tx, parent)
  if (!plan) return proposal
  if (parent.parentWorkId || parent.ownerAgentId !== plan.coordinatorId) throw new WorkUnavailableError('本次固定分工由汇总负责人统一委派')
  const assignment = plan.assignments.find(item => item.employeeId === proposal.ownerAgentId)
  if (!assignment || assignment.employeeId === plan.coordinatorId) throw new WorkUnavailableError('委派对象不在本次固定分工内')
  const dependencies = []
  for (const employeeId of assignment.dependsOn) {
    const dependency = await ownedChild(tx, parent, employeeId)
    if (!dependency) throw new WorkUnavailableError(`请先登记前置员工 ${employeeId} 的本次工作，再委派依赖它的任务`)
    dependencies.push({ workId: dependency.id, resultVersion: 1 })
  }
  return { key: automationAssignmentKey(assignment.employeeId), ownerAgentId: assignment.employeeId, scope: assignment.instruction, deliverable: assignment.deliverable, dependencies }
}

/** Called in the same transaction as the public result; a fluent answer alone cannot finish a group plan. */
export async function assertAutomationDelivery(tx: RecordTransaction, work: WorkItem) {
  const plan = await collaboration(tx, work)
  if (!plan) return
  const assignment = plan.assignments.find(item => item.employeeId === work.ownerAgentId)
  if (!assignment) throw new WorkUnavailableError('工作不属于本次固定分工')
  for (const employeeId of assignment.dependsOn) {
    const dependency = await ownedChild(tx, work, employeeId)
    const required = dependency && work.requiredResults.find(item => item.workId === dependency.id)
    if (!dependency || !required || dependency.status !== 'delivered' || dependency.requiresReview || dependency.resultVersion < required.resultVersion) throw new WorkUnavailableError('本次必需分工尚未真实交付并纳入依赖，不能发布完成结果；请登记并等待本次工作')
  }
}
