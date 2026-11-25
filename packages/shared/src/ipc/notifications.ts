/*
 * [INPUT]: Trusted desktop notifications and explicit Agent upgrade actions.
 * [OUTPUT]: Inbox records and exact saved-profile/version update requests.
 * [POS]: Private desktop IPC; no public runtime or employee operation.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
export interface AgentUpdate {
  profileId: string
  profileRevision: number
  name: string
  currentVersion: string
  latestVersion?: string
  blocked?: string
  phase?: 'installing' | 'verifying' | 'failed'
}

export interface AgentUpdateRequest {
  profileId: string
  profileRevision: number
  version: string
}

export type NotificationTarget =
  | { kind: 'agent-update'; profileId: string }
  | { kind: 'employee-task'; employeeId: string; taskId: string }
  | { kind: 'automation'; occurrenceId: string }
  | { kind: 'app-update' }

export interface DesktopNotice {
  id: string
  title: string
  detail?: string
  createdAt: string
  read: boolean
  target: NotificationTarget
}

export interface NotificationSnapshot {
  revision: number
  items: DesktopNotice[]
  agentUpdates: AgentUpdate[]
  checking: boolean
}

export interface NotificationsApi {
  snapshot(): Promise<NotificationSnapshot>
  read(ids: string[]): Promise<void>
  installAgentUpdate(input: AgentUpdateRequest): Promise<void>
}
