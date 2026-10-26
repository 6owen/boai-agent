/*
 * [INPUT]: Explicit user terminal operations and host-resolved employee workspace identity.
 * [OUTPUT]: Cancellable output waits, bounded screen frames, attachment/input acknowledgements and real process status.
 * [POS]: Desktop-only interactive terminal contract; not an employee application operation.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { TerminalInfo, TerminalScope } from '../domain/workspace-tools'

export type WorkspaceTerminalRequest =
  | { action: 'create'; requestId: string; scope: TerminalScope }
  | { action: 'list'; scope: TerminalScope }
  | { action: 'attach'; terminalId: string }
  | { action: 'read'; attachmentId: string; wait?: boolean }
  | { action: 'cancelRead'; attachmentId: string }
  | { action: 'ack'; attachmentId: string; sequence: number }
  | { action: 'write'; attachmentId: string; inputSequence: number; data: string }
  | { action: 'resize'; attachmentId: string; cols: number; rows: number }
  | { action: 'detach'; attachmentId: string }
  | { action: 'close'; terminalId: string }

export interface WorkspaceTerminalFrame {
  terminal: TerminalInfo
  sequence: number
  kind: 'snapshot' | 'delta'
  data: string
  cols: number
  rows: number
}
export type WorkspaceTerminalResponse =
  | { kind: 'created'; terminal: TerminalInfo }
  | { kind: 'listed'; terminals: TerminalInfo[] }
  | { kind: 'attached'; attachmentId: string; frame: WorkspaceTerminalFrame; nextInputSequence: number }
  | { kind: 'frame'; frame: WorkspaceTerminalFrame | null }
  | { kind: 'readCancelled' }
  | { kind: 'acknowledged'; sequence: number }
  | { kind: 'written'; inputSequence: number }
  | { kind: 'resized' }
  | { kind: 'detached' }
  | { kind: 'closed'; terminal: TerminalInfo }
