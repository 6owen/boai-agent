/*
 * [INPUT]: 团队需求、模型输出和用户编辑；无凭据或工具权限。
 * [OUTPUT]: planner v5 的 T2 连续记忆能力说明；旧来源版本保留；严格方案校验、版本草稿、有界生成和冻结创建账本合同。
 * [POS]: shared/domain 团队创建跨进程合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import { avatarPresets } from './avatars'
import type { DigitalAgent, Conversation } from './index'

export const TEAM_PLANNER_VERSION = 'team-planner-v5'
export const TEAM_LIMITS = { members: 12, attempts: 2, deadlineMs: 120_000, outputTokens: 8192 } as const
export const teamColors = ['#6675a4', '#438b80', '#ad8054', '#638ac5', '#a76c90', '#777b8d'] as const
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes('\0'), '文本不能包含空字符')
export const teamId = text(200)
const memberFields = { name: text(80), role: text(300), instructions: text(2000) }
const planFields = {
  kind: z.literal('plan'), schemaVersion: z.literal(1), name: text(80), purpose: text(1000),
  scenarioKind: z.enum(['work', 'roleplay']), assumptions: z.array(text(300)).max(5),
  collaborationGuide: z.string().trim().max(2000), capabilityNotes: z.array(text(300)).max(8),
}
const validMembers = (value: { members: { name: string; instructions: string }[] }) =>
  new Set(value.members.map(member => member.name)).size === value.members.length && value.members.reduce((sum, member) => sum + member.instructions.length, 0) <= 16000
export const teamModelPlanSchema = z.object({ ...planFields, members: z.array(z.object(memberFields).strict()).min(1).max(TEAM_LIMITS.members) }).strict().refine(validMembers, '成员姓名不能重复，工作规则合计不能超过 16000 字符')
export const teamPlannerOutputSchema = z.discriminatedUnion('kind', [teamModelPlanSchema, z.object({ kind: z.literal('needs_adjustment'), schemaVersion: z.literal(1), reason: text(500), suggestedPrompt: text(4000) }).strict()])
export const teamMemberSchema = z.object({ ...memberFields, memberKey: teamId, avatarId: z.enum(avatarPresets.map(preset => preset.id)), color: z.enum(teamColors) }).strict()
export const teamPlanSchema = z.object({ ...planFields, members: z.array(teamMemberSchema).min(1).max(TEAM_LIMITS.members), plannerVersion: text(80), generationId: teamId }).strict()
  .refine(validMembers, '成员姓名不能重复，工作规则合计不能超过 16000 字符')
export type TeamPlan = z.infer<typeof teamPlanSchema>
export type TeamPlannerOutput = z.infer<typeof teamPlannerOutputSchema>
// Product facts are deterministic; the model does not grant or describe permissions.
export function teamCapabilityNotes(scenarioKind: TeamPlan['scenarioKind']): string[] {
  return [
    '新员工使用所选同一 API 模型，默认无命令权限、无 Skills、无知识绑定，不自动安装工具或联网。',
    '成员可读写个人工作区文件并产生文件产物。',
    '同一员工的新交流可在相关私聊与群聊中接续；仅此聊天限制、来源授权和有效期仍适用，旧会话记忆不自动开放。',
    '命令权限、Skills 和知识绑定需用户通过现有设置另行配置；本方案不授予读取其他员工私有聊天的权限。',
    '创建仅保存员工和可选群聊，不发送欢迎词、不自动开始任务或发布到外部平台。',
    ...(scenarioKind === 'roleplay' ? ['仅创建玩家互动群；未支持正式游戏规则、隐藏身份、投票和胜负裁定。'] : []),
  ]
}
// A new member omits memberKey; only the host can allocate that identity.
export const teamEditableSchema = z.object({
  prompt: z.string().trim().max(4000), selectedConnectionId: z.string().max(200), selectedModelId: z.string().trim().max(300),
  createGroup: z.boolean(), groupTitle: z.string().trim().max(200),
  plan: z.object({ ...planFields, plannerVersion: text(80), generationId: teamId, members: z.array(teamMemberSchema.partial({ memberKey: true })).min(1).max(TEAM_LIMITS.members) }).strict().refine(validMembers, '成员姓名不能重复，工作规则合计不能超过 16000 字符').optional(),
}).strict()
export type TeamEditable = z.infer<typeof teamEditableSchema>
export type TeamGenerationStatus = 'idle' | 'running' | 'succeeded' | 'needs_adjustment' | 'failed' | 'cancelled' | 'interrupted'
export interface TeamDraft extends TeamEditable {
  id: string; schemaVersion: 1; version: number; createdAt: string; updatedAt: string
  status: 'open' | 'committed' | 'cancelled'; generationStatus: TeamGenerationStatus
  resolvedModelId?: string; connectionFingerprint?: string; planInputHash?: string; generationId?: string
  manuallyEdited: boolean; creationOperationId?: string; planHash?: string; validationErrors: string[]
}
export interface TeamGeneration {
  id: string; draftId: string; requestId: string; requestHash: string; draftVersion: number; inputHash: string
  plannerVersion: string; schemaVersion: 1; connectionId: string; modelId: string; connectionFingerprint: string
  status: Exclude<TeamGenerationStatus, 'idle'>; deadline: string; startedAt: string; finishedAt?: string
  attempts: { callId: string; phase: 'initial' | 'repair'; status: 'running' | 'succeeded' | 'failed' | 'interrupted'; usage: { inputTokens: number; outputTokens: number } | 'unknown' }[]
  error?: string; adjustment?: { reason: string; suggestedPrompt: string }
}
export interface TeamCreationSource { kind: 'team-planner'; operationId: string; memberKey?: string; plannerVersion: string }
export const teamSetupSchema = z.object({ purpose: text(1000), collaborationGuide: z.string().trim().max(2000), scenarioKind: z.enum(['work', 'roleplay']) }).strict()
export type TeamSetup = z.infer<typeof teamSetupSchema>
export interface TeamCreationOperation {
  id: string; requestId: string; requestHash: string; draftId: string; acceptedDraftVersion: number; payloadHash: string
  version: number; status: 'accepted' | 'preparing' | 'ready_to_commit' | 'interrupted' | 'needs_attention' | 'committed' | 'cancelled'
  createdAt: string; committedAt?: string; attemptId?: string; cancelRequested?: boolean; error?: string
  connectionId: string; connectionFingerprint: string; modelId: string
  agents: DigitalAgent[]; conversation?: Conversation; memberIds: { memberKey: string; agentId: string }[]; conversationId?: string
  files: { path: string; hash: string; status: 'pending' | 'writing' | 'ready' }[]; directories: string[]
}
export interface TeamDraftView { draft: TeamDraft; generation?: TeamGeneration; operation?: TeamCreationOperation }
export interface TeamRecovery { drafts: TeamDraft[]; operations: TeamCreationOperation[] }
