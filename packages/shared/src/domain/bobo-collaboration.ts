/*
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [INPUT]: 宿主冻结的原核心请求、真实员工配置和 bobo 的有界组织方案。
 * [OUTPUT]: 既有/新员工、独立群与真实开场消息的组织账本和无私有配置的发现/回执；模式与预算只由原 Work 授权。
 * [POS]: bobo 群协作跨进程合同；员工身份不属于群生命周期。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import type { Conversation, DigitalAgent, Message } from './index'
import type { BoboOrganizationMode, CollaborationStartIntent } from './work'

export const BOBO_COLLABORATION_LIMITS = { employees: 11, candidatePage: 20, candidateSearch: 100, instructions: 16000, announcement: 4000, operationsPage: 30 } as const
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes('\0'), '文本不能含空字符')
const id = text(200)
export const boboCollaborationPlanSchema = z.object({
  existingMembers: z.array(z.object({ agentId: id, configVersion: z.number().int().positive() }).strict()).max(BOBO_COLLABORATION_LIMITS.employees),
  newEmployees: z.array(z.object({ name: text(80), role: text(300), instructions: text(2000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).strict()).max(BOBO_COLLABORATION_LIMITS.employees),
  groupTitle: text(200).optional(), announcement: text(BOBO_COLLABORATION_LIMITS.announcement).optional(),
}).strict().refine(value => {
  const size = value.existingMembers.length + value.newEmployees.length
  return size > 0 && size <= BOBO_COLLABORATION_LIMITS.employees && new Set(value.existingMembers.map(member => member.agentId)).size === value.existingMembers.length && new Set(value.newEmployees.map(member => member.name)).size === value.newEmployees.length && value.newEmployees.reduce((sum, member) => sum + member.instructions.length, 0) <= BOBO_COLLABORATION_LIMITS.instructions
}, '员工身份不能重复，总人数须为 1–11，新增规则合计不能超过 16000 字符')
export type BoboCollaborationPlan = z.infer<typeof boboCollaborationPlanSchema>
export const employeeCandidateQuerySchema = z.object({ search: z.string().trim().max(BOBO_COLLABORATION_LIMITS.candidateSearch).optional(), cursor: z.string().max(4000).optional(), limit: z.number().int().min(1).max(BOBO_COLLABORATION_LIMITS.candidatePage).optional() }).strict()
export type EmployeeCandidateQuery = z.infer<typeof employeeCandidateQuerySchema>
export interface EmployeeCandidate {
  agentId: string; name: string; role: string; configVersion: number
  capabilities: { browser: boolean; commands: boolean; skills: { id: string; name: string }[]; knowledge: { id: string; name: string }[] }
}
export interface EmployeeCandidatePage { employees: EmployeeCandidate[]; revision: number; cursor?: string }
/** All identities are captured from the actual active holder by the host, never model arguments. */
export interface BoboOrganizationAuthority {
  workId: string; runId: string; workVersion: number; sourceConversationId: string; sourceMessageId: string; agentConfigVersion: number
}
export interface BoboCollaborationSource { kind: 'bobo-collaboration'; operationId: string; requestId: string }
export interface BoboCollaborationOperation {
  id: string; schemaVersion: 1; requestId: string; payloadHash: string; version: number
  organizationWorkId: string; sourceConversationId: string; sourceMessageId: string; sourceMessageHash: string
  mode: BoboOrganizationMode; goal: string; budgetId: string; contactRevision: number
  authority: BoboOrganizationAuthority
  existingMembers: { agentId: string; configVersion: number; name: string; role: string }[]
  /** Only new employees owned by this operation. Existing workspaces are never prepared or cleaned. */
  agents: DigitalAgent[]
  existingConnectionFingerprints: { agentId: string; fingerprint: string }[]
  executionBackend?: import('./backends').ExecutionBackend
  connectionId: string; modelId: string; connectionFingerprint: string
  groupConversationId?: string; conversation?: Conversation; announcement?: Message
  announcementSource: { runId: string; modelCallId?: string; toolCallId: string }
  groupRootWorkId?: string; startIntentId?: string
  status: 'accepted' | 'preparing' | 'ready_to_commit' | 'interrupted' | 'needs_attention' | 'committed' | 'cancelled'
  createdAt: string; committedAt?: string; attemptId?: string; cancelRequested?: boolean; error?: string; sourceCleared?: boolean; groupCleared?: boolean
  files: { path: string; hash: string; status: 'pending' | 'writing' | 'ready' }[]; directories: string[]
}
/** Public receipt contains current object identities and bounded summaries, never file paths or private rules. */
export interface BoboCollaborationReceipt {
  id: string; requestId: string; version: number; sourceConversationId: string; mode: BoboOrganizationMode; goal: string
  status: BoboCollaborationOperation['status']; createdAt: string; committedAt?: string; error?: string
  existingMembers: BoboCollaborationOperation['existingMembers']
  agents: Pick<DigitalAgent, 'id' | 'name' | 'role' | 'color' | 'configVersion'>[]
  groupConversationId?: string; groupTitle?: string; announcementMessageId?: string; groupRootWorkId?: string; startIntentId?: string
  sourceCleared?: boolean; groupCleared?: boolean; startStatus?: CollaborationStartIntent['status']
}
