/*
 * [INPUT]: Conversation-owned PTY sessions and loopback preview services.
 * [OUTPUT]: Internal process snapshots and preview-scoped bounded read-only diagnostics; public terminal operations retired.
 * [POS]: Application protocol and sidebar view contract.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
export interface TerminalScope { employeeId: string; conversationId: string }
export interface TerminalInfo extends TerminalScope { id: string; title: string; cwd: string; createdAt: string; status: 'starting' | 'running' | 'exited'; exitCode?: number }
export interface TerminalOutput { session: TerminalInfo; text: string; cursor: number; truncated: boolean }
export interface TerminalExecution { id: string; status: 'running' | 'exited'; output: string; exitCode?: number }
export interface PreviewInfo extends TerminalScope { id: string; directory: string; url: string; kind: 'static' | 'command'; terminalId?: string; status: 'starting' | 'ready' | 'stopped' | 'failed'; error?: string; diagnostics?: { output: string; truncated: boolean; exitCode?: number } }
