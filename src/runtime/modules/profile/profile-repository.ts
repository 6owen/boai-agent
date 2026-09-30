/*
 * [INPUT]: ProductStore、资料草稿与宿主调用/技能/执行观测。
 * [OUTPUT]: 版本化原子资料保存、幂等调用观察与一致活动快照。
 * [POS]: 本机资料用例；预算权威仍在 WorkRepository。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import type { AgentRun, BudgetModelCall, Message, ModelUsage, Resource, WorkItem } from '../../../shared/domain'
import { avatarPresets, AVATAR_IMAGE_MAX_LENGTH } from '../../../shared/domain/avatars'
import { defaultUserProfile, type LocalUserProfile, type UserProfileInput } from '../../../shared/domain/profile'
import { ProductStore } from '../../adapters/storage/product-store'
import { validateAvatarImage } from './avatar-image'
import { aggregateActivity, type ExecutionIntervals, type ProfileModelCall, type SkillActivation } from './profile-activity'

const avatarSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('text') }).strict(), z.object({ kind: z.literal('preset'), id: z.enum(avatarPresets.map(item => item.id)) }).strict(), z.object({ kind: z.literal('image'), dataUrl: z.string().max(AVATAR_IMAGE_MAX_LENGTH) }).strict()])
export const userProfileSchema = z.object({ expectedRevision: z.number().int().nonnegative(), displayName: z.string().trim().refine(value => [...value].length >= 1 && [...value].length <= 40, '显示名称需要 1–40 个字符'), username: z.string().trim().nullable().transform(value => value || null).refine(value => value === null || /^[a-zA-Z0-9_-]{3,32}$/.test(value), '用户名需要 3–32 位字母、数字、下划线或连字符'), avatar: avatarSchema }).strict()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, '无效日期')
export const activityQuerySchema = z.object({ from: date, to: date, timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }, '无效时区') }).strict().refine(value => value.to >= value.from && Date.parse(value.to) - Date.parse(value.from) <= 366 * 86_400_000, '日期范围最多 367 天')
export class ProfileRepository {
  constructor(private readonly store: ProductStore) {}
  async get(): Promise<LocalUserProfile> {
    const profile = (await this.store.load<LocalUserProfile>('userProfiles'))[0]
    if (profile && profile.schemaVersion !== 1) throw new Error('资料来自较新版本，请升级应用后查看。')
    if (profile?.avatar?.kind === 'image') { try { validateAvatarImage(profile.avatar.dataUrl) } catch { return { ...profile, avatar: { kind: 'text' } } } }
    return profile ?? structuredClone(defaultUserProfile)
  }
  async update(input: UserProfileInput) {
    const value = userProfileSchema.parse(input)
    if (value.avatar.kind === 'image') validateAvatarImage(value.avatar.dataUrl)
    return this.store.transaction(async tx => {
      const previous = await tx.get<LocalUserProfile>('userProfiles', 'user') ?? defaultUserProfile
      if (previous.schemaVersion !== 1) throw new Error('资料来自较新版本，不能覆盖。')
      if (previous.revision !== value.expectedRevision) throw new Error('资料已在其他位置更新。请重新载入已保存资料后再编辑。')
      const { expectedRevision, ...fields } = value
      const profile: LocalUserProfile = { ...fields, schemaVersion: 1, id: 'user', revision: expectedRevision + 1, updatedAt: new Date().toISOString() }
      await tx.put({ collection: 'userProfiles', id: 'user', value: profile }); return profile
    })
  }
  async start(call: ProfileModelCall) {
    await this.store.transaction(async tx => { if (!await tx.get('profileModelCalls', call.id)) await tx.put({ collection: 'profileModelCalls', id: call.id, value: call }) })
  }
  async settle(id: string, usage: ModelUsage) {
    await this.store.transaction(async tx => {
      const call = await tx.get<ProfileModelCall>('profileModelCalls', id)
      if (!call || call.budgetOwned) return
      const known = { ...call.usage }
      for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
        const count = usage[field]
        if (typeof count === 'number' && Number.isFinite(count) && count >= 0) known[field] = Math.max(known[field] ?? 0, count)
      }
      await tx.put({ collection: 'profileModelCalls', id, value: { ...call, usage: known, finishedAt: new Date().toISOString() } })
    })
  }
  async skill(event: SkillActivation) {
    await this.store.transaction(async tx => { if (!await tx.get('profileSkillActivations', event.id)) await tx.put({ collection: 'profileSkillActivations', id: event.id, value: event }) })
  }
  async execution(run: AgentRun, state: 'start' | 'pause' | 'finish') {
    if (!run.workId) return
    await this.store.transaction(async tx => {
      const prior = await tx.get<ExecutionIntervals>('profileExecutions', run.id)
      const value: ExecutionIntervals = prior ?? { id: run.id, runId: run.id, conversationId: run.conversationId, workId: run.workId!, intervals: [], complete: false }
      const now = new Date().toISOString()
      if (state === 'start') { value.openAt ??= now; value.complete = false }
      else { if (value.openAt) value.intervals.push({ from: value.openAt, to: now }); delete value.openAt; value.complete = state === 'finish' }
      await tx.put({ collection: 'profileExecutions', id: run.id, value })
    })
  }
  async activity(input: unknown) {
    const query = activityQuerySchema.parse(input)
    return this.store.transaction(async tx => aggregateActivity({ calls: await tx.list<ProfileModelCall>('profileModelCalls'), budgets: await tx.list<BudgetModelCall>('budgetModelCalls'), messages: await tx.list<Message>('messages'), runs: await tx.list<AgentRun>('runs'), works: await tx.list<WorkItem>('workItems'), intervals: await tx.list<ExecutionIntervals>('profileExecutions'), skills: await tx.list<SkillActivation>('profileSkillActivations'), resources: await tx.list<Resource>('resources') }, query))
  }
}
