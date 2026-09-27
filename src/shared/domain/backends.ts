export type ExecutionBackend = { kind: 'mastra-model' } | { kind: 'acp-local'; profileId: string }
export interface LaunchProfile { id: string; name: string; executable: string; args: string[]; useExistingLogin: boolean; hostAccessAcknowledged: true; revision: number; executableHash: string; verified?: { name: string; version: string; protocolVersion: number; checkedAt: string } }
export type LaunchProfileInput = Omit<LaunchProfile,'id'|'revision'|'executableHash'|'verified'> & { id?: string; expectedRevision?: number }

export const externalTaskCapabilities = {
  phases: { task: 'supported', chat: 'unsupported', decision: 'unsupported', memory: 'unsupported' },
  toolControl: 'external', isolation: 'host', filesystemBridge: 'unsupported', terminalBridge: 'unsupported',
  skills: 'unsupported', knowledge: 'unsupported', usage: 'unknown', sessionPolicy: 'fresh', cancellation: 'managed-process',
} as const
