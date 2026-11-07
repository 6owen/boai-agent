/*
 * [INPUT]: Original conversations, assignments, messages and live execution fences.
 * [OUTPUT]: Versioned project changes and immutable per-message execution locations.
 * [POS]: Owner project selection service; does not grant filesystem permission or schedule work.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { realpath } from 'node:fs/promises'
import type { Conversation, DigitalAgent, Message, ProjectChoice, ProjectSelection } from '@boai/shared/domain'
import type { TrackedTask } from '@boai/shared/domain/tracked-tasks'
import type { AutomationOccurrence } from '@boai/shared/domain/automations'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { ongoingTaskExecution } from '../automations/employee-task-records'
import { chooseProject, initialProjectSelection, legacyProjectSelection, validateProjectSelection } from './project-directory'

export class ProjectDirectoryService {
  constructor(private store: ProductStore, private dataPath: string, private hooks: {
    busy(conversationId: string): boolean
    preparing(taskId: string): boolean
    changed(room: Conversation): void
  }) {}
  initialize(room: Conversation, agents: DigitalAgent[]) {
    if (room.kind === 'direct') room.projectSelection = initialProjectSelection(agents[0])
    else room.projectSelections = Object.fromEntries(agents.map(agent => [agent.id, initialProjectSelection(agent)]))
  }
  async selection(room: Conversation, tx?: RecordTransaction): Promise<ProjectSelection> {
    if (room.projectSelection) return room.projectSelection
    const task = room.employeeTaskId ? await (tx ?? this.store).get<TrackedTask>('agentTasks', room.employeeTaskId) : undefined
    if (task?.projectSelection) return task.projectSelection
    // Legacy work is reconstructed only from its own accepted messages, never today's employee default.
    const messages = tx ? await tx.list<Message>('messages') : await this.store.load<Message>('messages')
    const previous = messages.filter(message => message.conversationId === room.id && message.senderType === 'user').sort((a, b) => b.sequence - a.sequence)[0]
    return previous?.projectSelection ?? legacyProjectSelection(previous?.workingDirectory)
  }
  private async assertIdle(tx: RecordTransaction, room: Conversation) {
    if (this.hooks.busy(room.id) || room.employeeTaskId && this.hooks.preparing(room.employeeTaskId)) throw new Error('当前工作仍在执行或等待接续，请结束后再切换项目目录')
    const occurrences = await tx.list<AutomationOccurrence>('automationOccurrences')
    if (occurrences.some(item => !item.deletedAt && (item.conversationId === room.id || !!room.employeeTaskId && item.taskId === room.employeeTaskId) && ongoingTaskExecution(item))) throw new Error('任务仍有待决执行，不能切换项目目录')
    const works = await tx.list<{ conversationId: string; requiresReview?: boolean; status: string }>('workItems')
    if (works.some(work => work.conversationId === room.id && (work.requiresReview || !['delivered', 'cancelled'].includes(work.status)))) throw new Error('原工作尚未结束或结果待核对，不能切换项目目录')
    const transfers = await tx.list<{ source: { conversationId: string }; target: { conversationId: string }; status: string }>('contextHandoffs')
    if (transfers.some(item => item.target.conversationId === room.id && ['pending', 'unknown'].includes(item.status))) throw new Error('上下文交接投递仍待核对，不能切换目录绕过原投递')
  }
  async update(input: { conversationId: string; expectedRevision: number } & ProjectChoice) {
    const next = await chooseProject(input.mode === 'managed' ? { mode: 'managed' } : { mode: 'directory', directory: input.directory }, input.expectedRevision + 1, [await realpath(this.dataPath)])
    const room = await this.store.transaction(async tx => {
      const room = await tx.get<Conversation>('conversations', input.conversationId)
      if (!room || room.mergedInto || room.kind !== 'direct' || room.agentIds.length !== 1 || await tx.get('conversationCleanup', room.id)) throw new Error('请选择员工的有效聊天或任务')
      const previous = await this.selection(room, tx)
      if (previous.revision !== input.expectedRevision) throw new Error('项目目录已更新，请刷新后选择')
      await this.assertIdle(tx, room)
      await validateProjectSelection(next, [await realpath(this.dataPath)])
      const changed = { ...room, projectSelection: next, configVersion: (room.configVersion ?? 0) + 1, updatedAt: new Date().toISOString() }
      if (room.employeeTaskId) {
        const task = await tx.get<TrackedTask>('agentTasks', room.employeeTaskId)
        if (!task || task.sessionConversationId !== room.id || task.agentId !== room.agentIds[0]) throw new Error('原任务归属已变化')
        await tx.put({ collection: 'agentTasks', id: task.id, value: { ...task, projectSelection: next, revision: task.revision + 1, updatedAt: changed.updatedAt } })
      }
      await tx.put({ collection: 'conversations', id: room.id, value: changed })
      return changed
    })
    this.hooks.changed(room)
    return room
  }
  async prepareMessage(room: Conversation, input: { workingDirectory?: string; expectedProjectRevision?: number }, message: Message) {
    const roots = [await realpath(this.dataPath)]
    if (room.kind === 'group' && !input.workingDirectory) {
      message.projectSelections = Object.fromEntries(room.agentIds.map(id => [id, room.projectSelections?.[id] ?? legacyProjectSelection()]))
      // Group membership is not permission to touch every member's project. Each actual run rechecks its own snapshot.
      return
    }
    const saved = await this.selection(room)
    if (input.expectedProjectRevision !== undefined && input.expectedProjectRevision !== saved.revision) throw new Error('项目目录已更新，请刷新后发送')
    let selection = saved
    if (input.workingDirectory) {
      const explicit = await chooseProject({ mode: 'directory', directory: input.workingDirectory }, saved.revision + 1, roots)
      if (explicit.directory !== saved.directory || saved.mode !== 'directory') {
        if (room.employeeTaskId) throw new Error('任务项目目录已固定，请先在任务中明确切换目录后发送')
        await this.store.transaction(tx => this.assertIdle(tx, room))
        selection = explicit
      }
    }
    message.workingDirectory = await validateProjectSelection(selection, roots)
    message.projectSelection = selection
    // Saved by the caller's original message receipt transaction.
    if (room.kind === 'group') { room.projectSelections = Object.fromEntries(room.agentIds.map(id => [id, selection])); message.projectSelections = room.projectSelections }
    else room.projectSelection = selection
  }
  async workingDirectory(message: Message | undefined, agentId: string) {
    if (!message) return undefined
    const selection = message.projectSelections?.[agentId] ?? message.projectSelection ?? legacyProjectSelection(message.workingDirectory)
    return validateProjectSelection(selection, [await realpath(this.dataPath)])
  }
}
