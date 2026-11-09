/*
 * [OUTPUT]: 2026-11-09 无显式目录/版本的空闲主聊和群消息沿当前员工配置；已有任务、待决工作及历史消息保持原目录。
 * [INPUT]: Original conversations, assignments, messages and live execution fences.
 * [OUTPUT]: Versioned project changes and immutable per-message execution locations.
 * [POS]: Owner execution-location snapshots; runtime derives project access separately and does not schedule work.
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
  private async busyReason(tx: RecordTransaction, room: Conversation) {
    if (this.hooks.busy(room.id) || room.employeeTaskId && this.hooks.preparing(room.employeeTaskId)) return '当前工作仍在执行或等待接续，请结束后再切换项目目录'
    const occurrences = await tx.list<AutomationOccurrence>('automationOccurrences')
    if (occurrences.some(item => !item.deletedAt && (item.conversationId === room.id || !!room.employeeTaskId && item.taskId === room.employeeTaskId) && ongoingTaskExecution(item))) return '任务仍有待决执行，不能切换项目目录'
    const works = await tx.list<{ conversationId: string; requiresReview?: boolean; status: string }>('workItems')
    if (works.some(work => work.conversationId === room.id && (work.requiresReview || !['delivered', 'cancelled'].includes(work.status)))) return '原工作尚未结束或结果待核对，不能切换项目目录'
    const transfers = await tx.list<{ source: { conversationId: string }; target: { conversationId: string }; status: string }>('contextHandoffs')
    if (transfers.some(item => item.target.conversationId === room.id && ['pending', 'unknown'].includes(item.status))) return '上下文交接投递仍待核对，不能切换目录绕过原投递'
  }
  private async assertIdle(tx: RecordTransaction, room: Conversation) {
    const reason = await this.busyReason(tx, room)
    if (reason) throw new Error(reason)
  }
  private async employeeDefault(agentId: string, previous: ProjectSelection) {
    const agent = await this.store.get<DigitalAgent>('agents', agentId)
    if (!agent) throw new Error('员工不存在')
    const next = initialProjectSelection(agent)
    return next.source === previous.source && next.mode === previous.mode && next.directory === previous.directory && next.requestedDirectory === previous.requestedDirectory
      ? previous : { ...next, revision: previous.revision + 1 }
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
    // Owner UI no longer chooses a per-chat project. Refresh idle ordinary chats at admission;
    // existing tasks and pending work keep their accepted location, including after restart.
    const followDefault = !room.employeeTaskId && input.expectedProjectRevision === undefined && !input.workingDirectory
    let idle: Promise<boolean> | undefined
    const currentDefault = async (agentId: string, previous: ProjectSelection) => {
      const next = await this.employeeDefault(agentId, previous)
      if (next === previous) return previous
      // Only inspect pending work when the configured location actually changed.
      idle ??= this.store.transaction(async tx => !await this.busyReason(tx, room))
      return await idle ? next : previous
    }
    if (room.kind === 'group' && !input.workingDirectory) {
      message.projectSelections = Object.fromEntries(await Promise.all(room.agentIds.map(async id => {
        const previous = room.projectSelections?.[id] ?? legacyProjectSelection()
        return [id, followDefault ? await currentDefault(id, previous) : previous]
      })))
      room.projectSelections = message.projectSelections
      // Group membership is not permission to touch every member's project. Each actual run rechecks its own snapshot.
      return
    }
    const saved = await this.selection(room)
    if (input.expectedProjectRevision !== undefined && input.expectedProjectRevision !== saved.revision) throw new Error('项目目录已更新，请刷新后发送')
    let selection = followDefault ? await currentDefault(room.agentIds[0], saved) : saved
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
