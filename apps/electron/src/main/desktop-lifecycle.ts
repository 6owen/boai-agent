/*
 * [INPUT]: Electron powerMonitor events and a synchronous host event/diagnostic consumer.
 * [OUTPUT]: Current power/lock snapshot with process session and revision; disposal removes all listeners.
 * [POS]: Desktop lifecycle authority for UI/plugins; never starts or resends employee work.
 * [PROTOCOL]: Update this Header and the owning .folder.md when this file changes.
 */
import { randomUUID } from 'node:crypto'
import type { DesktopLifecycle } from '@boai/shared/ipc/desktop'

type PowerEvent = 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen'
interface PowerSource {
  on(event: PowerEvent, listener: () => void): unknown
  removeListener(event: PowerEvent, listener: () => void): unknown
  getSystemIdleState(idleThreshold: number): string
}
export class DesktopLifecycleMonitor {
  private state: DesktopLifecycle = { sessionId: randomUUID(), revision: 0, power: 'awake', locked: false, changedAt: new Date().toISOString() }
  private dispose?: () => void
  constructor(private readonly changed: (state: DesktopLifecycle, event: PowerEvent) => void) {}
  snapshot(): DesktopLifecycle { return { ...this.state } }
  start(source: PowerSource) {
    if (this.dispose) return
    try { this.state.locked = source.getSystemIdleState(1) === 'locked' } catch { /* Unsupported platforms start unlocked; events remain authoritative. */ }
    const listeners = (['suspend', 'resume', 'lock-screen', 'unlock-screen'] as const).map(event => {
      const listener = () => {
        const patch = event === 'suspend' ? { power: 'suspended' as const } : event === 'resume' ? { power: 'awake' as const } : { locked: event === 'lock-screen' }
        this.state = { ...this.state, ...patch, revision: this.state.revision + 1, changedAt: new Date().toISOString() }
        this.changed(this.snapshot(), event)
      }
      source.on(event, listener)
      return { event, listener }
    })
    this.dispose = () => { for (const { event, listener } of listeners) source.removeListener(event, listener) }
  }
  stop() { this.dispose?.(); this.dispose = undefined }
}
