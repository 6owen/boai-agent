/*
 * [INPUT]: Desktop event receipts, installed Agent checks and explicit user actions.
 * [OUTPUT]: Profile-local notice history, current-process delivery and update progress. Profile changes only invalidate cached offers.
 * [POS]: Electron main owns storage and the desktop-only update ticket.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { AppEvent } from '@boai/shared/ipc'
import type { AgentUpdate, AgentUpdateRequest, DesktopNotice, NotificationSnapshot } from '@boai/shared/ipc/notifications'

const limit = 200
const key = z.string().min(1).max(500)
const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agent-update'), profileId: key }),
  z.object({ kind: z.literal('employee-task'), employeeId: key, taskId: key }),
  z.object({ kind: z.literal('automation'), occurrenceId: key }),
  z.object({ kind: z.literal('app-update') }),
])
const saved = z.object({ version: z.literal(1), items: z.array(z.object({
  id: key, title: z.string(), detail: z.string().optional(), level: z.enum(['success', 'info', 'warning']).optional(), createdAt: z.iso.datetime(), read: z.boolean(), target,
})).max(limit) })

type UpdatePort = {
  check(): Promise<{ updates: AgentUpdate[]; unavailableProfileIds: string[] }>
  install(input: AgentUpdateRequest): Promise<AgentUpdate>
}
const updateId = (profileId: string, version: string) => `agent:${profileId}:${version}`

export class DesktopNotifications {
  private readonly state: Omit<NotificationSnapshot, 'pendingIds'> = { revision: 0, items: [], agentUpdates: [], checking: false }
  private readonly pending = new Set<string>()
  private writes: Promise<unknown> = Promise.resolve()
  private checking?: Promise<void>
  private installing?: Promise<void>
  private unreadable = false
  constructor(private readonly path: string, private readonly updates: UpdatePort,
    private readonly changed: (snapshot: NotificationSnapshot) => void, private readonly log: (error: unknown) => void) {}

  async init(currentAppVersion?: string) {
    try {
      this.state.items = saved.parse(JSON.parse(await readFile(this.path, 'utf8'))).items
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.unreadable = true; this.log(error) }
    }
    if (currentAppVersion && this.state.items.some(item => item.id === `app:${currentAppVersion}`)) {
      await this.persist(items => items.filter(item => item.id !== `app:${currentAppVersion}`)).catch(() => {})
    }
  }

  snapshot(): NotificationSnapshot { return structuredClone({ ...this.state, pendingIds: [...this.pending] }) }
  private publish() { this.state.revision++; this.changed(this.snapshot()) }
  private persist(change: (items: DesktopNotice[]) => DesktopNotice[]) {
    const work = this.writes.then(async () => {
      const items = change(this.state.items)
      if (items === this.state.items) return
      const previousIds = new Set(this.state.items.map(item => item.id))
      const unreadIds = new Set(items.filter(item => !item.read).map(item => item.id))
      for (const id of this.pending) if (!unreadIds.has(id)) this.pending.delete(id)
      for (const id of unreadIds) if (!previousIds.has(id)) this.pending.add(id)
      this.state.items = items
      this.publish()
      if (!this.unreadable) {
        const temp = `${this.path}.${randomUUID()}.tmp`
        try {
          await writeFile(temp, JSON.stringify({ version: 1, items }), { mode: 0o600 })
          await rename(temp, this.path)
        } finally { await rm(temp, { force: true }) }
      }
    })
    this.writes = work.catch(this.log)
    return work
  }
  private append(items: DesktopNotice[], value: Omit<DesktopNotice, 'createdAt' | 'read'>, read = false) {
    if (items.some(item => item.id === value.id)) return items
    return [{ ...value, createdAt: new Date().toISOString(), read }, ...items].slice(0, limit)
  }
  record(value: Omit<DesktopNotice, 'createdAt' | 'read'>) {
    return this.persist(items => this.append(items, value))
  }
  read(ids: string[]) {
    const selected = new Set(ids)
    return this.persist(items => items.some(item => selected.has(item.id) && !item.read)
      ? items.map(item => selected.has(item.id) ? { ...item, read: true } : item) : items)
  }
  observe(event: AppEvent) {
    if (event.type === 'agent-update:verifying') {
      const item = this.state.agentUpdates.find(update => update.profileId === event.profileId && update.phase === 'installing')
      if (item) { item.phase = 'verifying'; this.publish() }
    } else if (event.type === 'employee-task:result') {
      void this.record({ id: `task:${event.occurrenceId}`, title: `${event.employeeName} 的任务${event.status === 'in_review' ? '待确认' : '有新结果'}`, level: 'success',
        target: { kind: 'employee-task', employeeId: event.employeeId, taskId: event.taskId } }).catch(() => {})
    } else if (event.type === 'automation:history-deleted') {
      void this.persist(items => items.some(item => item.target.kind === 'automation' && item.target.occurrenceId === event.occurrenceId)
        ? items.filter(item => item.target.kind !== 'automation' || item.target.occurrenceId !== event.occurrenceId) : items).catch(() => {})
    } else if (event.type === 'app:update' && event.state.phase === 'ready' && event.state.availableVersion) {
      const version = event.state.availableVersion
      const id = `app:${version}`
      void this.persist(items => {
        const retained = items.filter(item => item.target.kind !== 'app-update' || item.id === id)
        return this.append(retained.length === items.length ? items : retained, {
          id, title: 'BoAI 应用可更新', detail: `v${version}`, target: { kind: 'app-update' },
        })
      }).catch(() => {})
    }
  }

  check(manual: boolean): Promise<void> {
    if (this.installing) return manual ? Promise.reject(new Error('Agent 正在更新，请稍后检查')) : Promise.resolve()
    this.checking ??= this.runCheck().finally(() => {
      this.checking = undefined
      this.state.checking = false
      this.publish()
    })
    return manual ? this.checking : this.checking.catch(() => {})
  }

  async invalidateAgentOffer(profileId: string, identity?: { profileRevision: number; currentVersion?: string }) {
    await (this.checking ?? this.installing)?.catch(() => {})
    const offer = this.state.agentUpdates.find(item => item.profileId === profileId)
    if (offer && offer.profileRevision === identity?.profileRevision && offer.currentVersion === identity.currentVersion) return
    if (offer) {
      this.state.agentUpdates = this.state.agentUpdates.filter(item => item.profileId !== profileId)
      this.publish()
    }
    await this.persist(items => {
      const retained = items.filter(item => !(item.id.startsWith('agent:') && item.target.kind === 'agent-update' && item.target.profileId === profileId))
      return retained.length === items.length ? items : retained
    })
  }

  private async runCheck() {
    this.state.checking = true
    this.publish()
    const { updates, unavailableProfileIds } = await this.updates.check()
    const unavailable = new Set(unavailableProfileIds)
    const previous = new Map(this.state.agentUpdates.map(item => [item.profileId, item]))
    this.state.agentUpdates = updates.map(item => {
      const prior = previous.get(item.profileId)
      if (!prior || prior.profileRevision !== item.profileRevision) return item
      if (unavailable.has(item.profileId)) return prior
      return prior.latestVersion === item.latestVersion ? { ...item, phase: prior.phase } : item
    })
    const active = this.state.agentUpdates.filter(item => item.latestVersion && !item.blocked)
    const activeIds = new Set(active.map(item => updateId(item.profileId, item.latestVersion!)))
    await this.persist(items => {
      const retained = items.filter(item => !item.id.startsWith('agent:') || activeIds.has(item.id) ||
        (item.target.kind === 'agent-update' && unavailable.has(item.target.profileId)))
      return active.reduce((all, item) => this.append(all, {
        id: updateId(item.profileId, item.latestVersion!), title: `${item.name} 可更新`,
        detail: `v${item.currentVersion} → v${item.latestVersion}`, target: { kind: 'agent-update', profileId: item.profileId },
      }), retained.length === items.length ? items : retained)
    })
    if (unavailable.size) throw new Error('部分 Agent 的版本检查失败，请稍后重试')
  }

  install(input: AgentUpdateRequest) {
    if (this.checking || this.installing) throw new Error('已有 Agent 检查或更新正在进行')
    const item = this.state.agentUpdates.find(update => update.profileId === input.profileId)
    if (!item || item.profileRevision !== input.profileRevision || item.latestVersion !== input.version || item.blocked) throw new Error('更新信息已变化，请重新检查')
    this.installing = this.runInstall(input, item).finally(() => { this.installing = undefined })
    return this.installing
  }
  private async runInstall(input: AgentUpdateRequest, item: AgentUpdate) {
    item.phase = 'installing'
    this.publish()
    let verified: AgentUpdate
    try { verified = await this.updates.install(input) }
    catch (error) { item.phase = 'failed'; this.publish(); throw error }
    this.state.agentUpdates = this.state.agentUpdates.map(update => update === item ? verified : update)
    this.publish()
    await this.persist(items => this.append(items.filter(value => value.id !== updateId(item.profileId, input.version)), {
      id: `agent-installed:${item.profileId}:${input.version}`, title: `${item.name} 已更新`, detail: `v${verified.currentVersion}`,
      target: { kind: 'agent-update', profileId: item.profileId },
    }, true)).catch(() => {})
  }

  async flush() { await this.installing?.catch(() => {}); await this.writes }
}
