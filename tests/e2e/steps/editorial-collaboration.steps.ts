/*
 * [OUTPUT]: 文件预览正文采用统一名称，不展示版本标记。
 * [OUTPUT]: 群报数/接龙/编辑部全部顺序场景在BDD中直接核对真实前文输入与时间先后，不仅在批后手工审计。
 * [OUTPUT]: 固定公告三轮更正/重启/结束静默及发布摘要实际80–120字断言纳入v1用例集，原五轮输入与断言保持。
 * [OUTPUT]: 独立三轮限字验证与完整五轮共用真实重启零重放；不拼接场景结果。
 * [OUTPUT]: 原120/80字要求增加确定性断言，续聊逐条原生截图供内容审阅。
 * [INPUT]: 真实已保存 Mastra API、pnpm dev 与原 Desktop/成果留证器。
 * [OUTPUT]: 三员工五轮真实对话/两次委派/文件依赖/明确修订及重启；原件、真实消息、模型输入与共享账本逐轮归档。
 * [POS]: 第14组复杂内容协作 BDD；不合成模型输出，不修改产品用户数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { ArtifactVersion } from '../../../src/shared/domain/artifacts'
import type { Conversation, ConversationDetail, DigitalAgent } from '../../../src/shared/domain'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { artifactDetail, artifactOriginal, artifactRecords } from '../support/artifacts'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import type { Desktop } from '../support/desktop'
import { test as base } from '../support/test'
import { verifyOrderedInputs } from '../support/group-coordination'

const BRIEF = '为疲惫的上班族写一篇自媒体文章：把周末的90分钟变成一篇文章。矛盾是收藏了很多工具却迟迟不开写。仅有的素材是一份团队练习安排：15分钟定题、45分钟初稿、30分钟修改，总计90分钟。这是练习安排，不是统计研究或效果保证；不要虚构数据、采访和成功案例。'
const DISCUSSION = `${BRIEF} 现在只讨论，不执行文件任务。请按选题策划、写手、编辑的顺序各说一次：策划提出一个明确立意，写手接着策划的实际想法给开头方向，编辑指出前面方案的一处风险。每人120字以内。`
const ASSIGNMENT = '采用刚才策划提出的立意，开始制作。选题策划负责组织并最终汇总，不代替同事写稿：先把立意和结构交给写手，委派写手写600到900字的Markdown文章并交付“周末90分钟.md”；再委派编辑等待该初稿实际交付后读取原件，交付“审稿意见.md”，引用初稿中的两个原句并给出具体修改建议。策划等待两人的实际成果后，简短说明立意、文章和审稿结果。保留15/45/30合计90分钟的练习安排，正文末尾要有行动清单，不虚构外部事实。其他成员等待正式分工，不另起相同任务。'
const REVISION = '请结合编辑刚交付的审稿意见修改这篇初稿。新增要求：开头直接描写“周六早上，电脑开着，文档却还是空白”的场景；标题不要出现“高效”；结尾给恰好三条可执行清单，分别对应15分钟、45分钟、30分钟；仍保留练习安排的边界。交付这篇文章的新版本，不重复交付原稿或替换审稿意见。'
const SECOND = '请编辑负责第二轮协作：先实际读取写手刚修订的第二版文章，核对开头场景、标题不含“高效”、三条行动清单及15/45/30合计90分钟这四项。然后正式委派选题策划根据第二版文章制作“发布文案.md”，内含3个不同标题及一段80到120字的发布摘要；策划必须实际读取这份第二版原件，不能只用旧初稿或聊天摘要。编辑等待策划交付后汇总核对结果。此轮只审读和制作发布文案，不修改文章原件。'

interface State { group?: Conversation; agents: DigitalAgent[]; dataPath?: string; v1?: ArtifactVersion; v2?: ArtifactVersion; v1Text?: string; detail?: ConversationDetail; saved: Set<string>; stage: number }
export const test = base.extend<{ editorial: State }>({ editorial: async ({ runtime }, use) => {
  const state: State = { agents: [], saved: new Set(), stage: 0 }
  try { await use(state) } finally { if (state.group) await capture(runtime, state, '结束或失败时实际状态') }
} })
const { Given, When, Then } = createBdd(test)
const terminal = new Set(['completed', 'failed', 'cancelled', 'budget_exhausted', 'interrupted'])

async function send(runtime: Desktop, state: State, content: string, mention?: string) {
  state.stage++
  if (mention) {
    await runtime.page.getByRole('button', { name: '提及群聊成员', exact: true }).click()
    await runtime.page.getByRole('option', { name: `@${mention}`, exact: true }).click()
  }
  const composer = runtime.page.getByRole('textbox', { name: '消息内容', exact: true })
  // Preserve the selected member chip while entering the natural-language request.
  if (mention) await composer.pressSequentially(content)
  else await composer.fill(content)
  await runtime.reviewData(`第${state.stage}轮原始用户输入`, { content, mention })
  await runtime.reviewCheckpoint(`第${state.stage}轮发送前`)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
}
async function capture(runtime: Desktop, state: State, label: string) {
  const detail = await artifactDetail(runtime, state.group!.id)
  state.detail = detail
  await runtime.reviewData(label, detail)
  for (const artifact of detail.artifacts as ArtifactVersion[]) if (!state.saved.has(artifact.id)) {
    await runtime.reviewFile(artifact.name, artifact.path, { required: true, expectedSha256: artifact.contentHash })
    state.saved.add(artifact.id)
  }
  for (const turn of detail.turns ?? []) {
    const trace = await runtime.page.evaluate(input => window.boai.request('getConversationTrace', input), { conversationId: state.group!.id, messageId: turn.triggerMessageId, turnId: turn.id })
    // Keep individual actual spans under the existing 1 MiB evidence bound.
    for (let index = 0; index < trace.length; index++) {
      const span = trace[index], key = `trace:${createHash('sha256').update(JSON.stringify(span)).digest('hex')}`
      if (!state.saved.has(key)) { await runtime.reviewData(`模型Trace-${turn.id}-${index}`, span); state.saved.add(key) }
    }
  }
  if (state.dataPath) {
    const store = await ProductStore.openReadOnly(join(state.dataPath, 'boai.sqlite'))
    try { await runtime.reviewData(`${label}共享预算与调用`, { budgets: await store.load('workBudgets'), calls: await store.load('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), executions: await store.load('workExecutions') }) } finally { await store.close() }
  }
  const lastMessage = detail.messages.at(-1)
  if (lastMessage) await runtime.page.locator(`#message-${lastMessage.id}`).scrollIntoViewIfNeeded()
  await runtime.reviewNativeCheckpoint(label)
  return detail
}
async function settle(runtime: Desktop, state: State) {
  await expect.poll(async () => {
    const d = await artifactDetail(runtime, state.group!.id)
    return d.messages.filter(m => m.senderType === 'user').length === state.stage && !!d.turns?.length && d.turns.every(t => terminal.has(t.status)) && d.runs.every(r => terminal.has(r.status)) && d.workItems!.every(w => ['delivered', 'blocked', 'failed', 'cancelled', 'interrupted'].includes(w.status))
  }, { timeout: 240_000, intervals: [500, 1000, 2000] }).toBe(true)
  const detail = await capture(runtime, state, `第${state.stage}轮实际结果`)
  await verifyOrderedInputs(runtime, detail)
  expect(detail.runs.filter(run => run.status === 'failed')).toEqual([])
  expect(detail.turns!.filter(turn => ['failed', 'budget_exhausted'].includes(turn.status))).toEqual([])
  return detail
}
const byName = (state: State, name: string) => state.agents.find(agent => agent.name === name)!
function deliveredChildren(detail: ConversationDetail, rootId: string) { return detail.workItems!.filter(w => w.rootWorkId === rootId && w.parentWorkId) }
async function actualRead(runtime: Desktop, detail: ConversationDetail, artifact: ArtifactVersion, ownerAgentId: string) {
  const original = await artifactOriginal(artifact)
  const reads = detail.runs.filter(run => run.agentId === ownerAgentId).flatMap(run => run.toolEvents.filter(tool => tool.name === 'read_file' && tool.status === 'completed').map(tool => ({ runId: run.id, createdAt: tool.createdAt, result: JSON.parse(tool.detail) as { path: string; content: string } })))
    .filter(read => read.result.path === `shared:/${artifact.managedRelativePath}` && read.result.content === original)
  expect(reads.length, '下游必须实际读取本版原件，不能用聊天摘要冒充').toBeGreaterThan(0)
  expect(reads.every(read => Date.parse(read.createdAt) >= Date.parse(artifact.publishedAt!))).toBe(true)
  await runtime.reviewData(`员工${ownerAgentId}实际读取${artifact.name}第${artifact.contentVersion}版`, { artifactId: artifact.id, contentHash: artifact.contentHash, reads })
}

Given('pnpm开发窗口中已准备真实API编辑部', async ({ runtime, editorial: state }) => {
  test.skip(process.env.BOAI_TEST_REAL_API !== '1' || process.env.BOAI_TEST_DEV_SERVER !== '1', '仅在显式真实API的pnpm dev批次执行')
  test.setTimeout(900_000)
  test.info().annotations.push({ type: 'model-mode', description: 'real-provider' })
  await runtime.start(); await runtime.close()
  const connection = await prepareSavedModel(runtime)
  await runtime.start(await systemKeychainLaunch(runtime))
  const setup = await runtime.page.evaluate(async connection => {
    const roles = [
      { name: '选题策划', role: '选题立意与内容项目协调', instructions: '根据用户需求提出明确立意和结构。受托负责项目时，把写稿和审稿交给对应同事，等待实际交付后汇总。不要代替写手和编辑完成他们的任务。' },
      { name: '写手', role: '自媒体文章写作与修订', instructions: '把确认的立意写成具体、自然、有场景的文章，准确保留给定材料与限制。依据实际编辑意见及用户明确要求修订自己的稿件。' },
      { name: '编辑', role: '稿件审阅与发布前把关', instructions: '阅读实际稿件，检查事实、立意、叙事和可执行性，用原句说明具体问题。用户要求多阶段工作时正式委派并等待同事成果。未经用户明确要求不替作者修改其已发布文件。' },
    ]
    const agents = []
    for (const role of roles) agents.push(await window.boai.request('saveAgent', { ...role, color: '#617764', connectionId: connection.id, modelId: connection.defaultModel, executionBackend: { kind: 'mastra-model' }, thinkingLevel: 'off', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }))
    const group = await window.boai.request('createConversation', { kind: 'group', title: '周末文章编辑部', agentIds: agents.map(a => a.id) })
    return { group, agents, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  }, connection)
  Object.assign(state, setup)
  await runtime.reviewData('独立员工及模型来源', { agents: state.agents, provider: connection.provider, model: connection.defaultModel, dev: true, commandTools: false })
  await runtime.page.reload({ waitUntil: 'domcontentloaded' }); await runtime.page.getByRole('button', { name: /周末文章编辑部/ }).click()
})
When('用户让策划写手编辑依次讨论文章立意', async ({ runtime, editorial }) => send(runtime, editorial, DISCUSSION))
Then('三人的立意讨论使用前置发言且没有执行文件工作', async ({ runtime, editorial: state }) => {
  const d = await settle(runtime, state), replies = d.messages.filter(m => m.senderType === 'agent')
  expect(d.workItems).toEqual([])
  expect(replies.map(m => m.senderId)).toEqual(state.agents.map(a => a.id))
  expect(d.turns![0].coordination).toMatchObject({ mode: 'ordered', revision: 4, maxReplyCharacters: 120 })
  for (const reply of replies) expect([...reply.content.replace(/\s/gu, '')].length, `${reply.senderName}讨论不得超过120字（含标点）`).toBeLessThanOrEqual(120)
})
When('用户确定立意并要求策划组织写稿和依赖审稿', async ({ runtime, editorial }) => send(runtime, editorial, ASSIGNMENT, '选题策划'))
Then('写手和编辑交付真实初稿及审稿文件且策划汇总', async ({ runtime, editorial: state }) => {
  const d = await settle(runtime, state)
  state.v1 = (d.artifacts as ArtifactVersion[]).find(a => a.name === '周末90分钟.md' && a.ownerAgentId === byName(state, '写手').id)
  const review = (d.artifacts as ArtifactVersion[]).find(a => a.name === '审稿意见.md' && a.ownerAgentId === byName(state, '编辑').id)
  expect(state.v1).toBeDefined(); expect(review).toBeDefined()
  state.v1Text = await artifactOriginal(state.v1!)
  const reviewText = await artifactOriginal(review!)
  expect(state.v1Text).toMatch(/15/); expect(state.v1Text).toMatch(/45/); expect(state.v1Text).toMatch(/30/); expect(state.v1Text).toMatch(/90/)
  expect(reviewText.length).toBeGreaterThan(100)
  const root = d.workItems!.find(w => !w.parentWorkId && w.ownerAgentId === byName(state, '选题策划').id)!
  expect(root).toMatchObject({ status: 'delivered' })
  const children = deliveredChildren(d, root.id)
  expect(children.map(w => w.ownerAgentId).sort()).toEqual([byName(state, '写手').id, byName(state, '编辑').id].sort())
  expect(children.every(w => w.status === 'delivered' && w.budgetId === root.budgetId)).toBe(true)
  const draftWork = children.find(w => w.ownerAgentId === byName(state, '写手').id)!, reviewWork = children.find(w => w.ownerAgentId === byName(state, '编辑').id)!
  expect(reviewWork.requiredResults).toContainEqual({ workId: draftWork.id, resultVersion: draftWork.resultVersion })
  await actualRead(runtime, d, state.v1!, byName(state, '编辑').id)
  await runtime.reviewData('第一轮因果与原件', { root, children, draft: state.v1, review, draftText: state.v1Text, reviewText })
})
When('用户从初稿卡片要求按编辑意见修订并补充新限制', async ({ runtime, editorial: state }) => {
  const card = runtime.page.locator(`.messages [data-chat-artifact-id="${state.v1!.id}"]`)
  await card.getByRole('button', { name: '要求修改', exact: true }).click()
  await expect(runtime.page.locator('.reply-preview')).toContainText(state.v1!.name)
  await send(runtime, state, REVISION)
})
Then('写手交付关联原稿的新版本且原稿不变', async ({ runtime, editorial: state }) => {
  const d = await settle(runtime, state)
  state.v2 = (d.artifacts as ArtifactVersion[]).find(a => a.previousArtifactId === state.v1!.id)
  expect(state.v2).toMatchObject({ ownerAgentId: state.v1!.ownerAgentId, contentVersion: 2, logicalArtifactId: state.v1!.logicalArtifactId })
  expect(await artifactOriginal(state.v1!)).toBe(state.v1Text)
  const revised = await artifactOriginal(state.v2!)
  expect(revised).toContain('周六早上'); expect(revised).toContain('文档'); expect(revised.split('\n').find(line => line.startsWith('# '))).not.toContain('高效')
  expect(revised.slice(revised.lastIndexOf('行动清单')).match(/^\s*(?:[-*]|\d+[.、])\s+/gm)).toHaveLength(3)
  const records = await artifactRecords(state.dataPath!), revision = records.revisions.find(r => r.id === state.v2!.revisionRequestId)!
  expect(revision).toMatchObject({ artifactId: state.v1!.id, contentHash: state.v1!.contentHash, targetAgentId: state.v1!.ownerAgentId })
  const originalWork = d.workItems!.find(w => w.id === state.v1!.sourceWorkId)!, newWork = d.workItems!.find(w => w.id === state.v2!.sourceWorkId)!
  expect(newWork).toMatchObject({ status: 'delivered', revisionRequestId: revision.id, rootWorkId: newWork.id })
  expect(newWork.budgetId).not.toBe(originalWork.budgetId)
  await runtime.reviewData('修订原件与独立新根', { v1: state.v1, v2: state.v2, originalWork, newWork, revision, revised })
  await runtime.page.locator(`#message-${state.v2!.sourceMessageId}`).getByRole('button', { name: `打开 ${state.v2!.name}`, exact: true }).click()
  await expect(runtime.page.getByRole('region', { name: '文件正文', exact: true })).toContainText('周六早上')
  await runtime.reviewNativeCheckpoint('原聊天打开第二版文章正文')
})
When('用户请编辑复核修订稿并由策划提炼发布文案', async ({ runtime, editorial }) => send(runtime, editorial, SECOND, '编辑'))
Then('第二轮协作实际读取修订稿并交付发布文案', async ({ runtime, editorial: state }) => {
  const d = await settle(runtime, state), copy = (d.artifacts as ArtifactVersion[]).find(a => a.name === '发布文案.md' && a.ownerAgentId === byName(state, '选题策划').id)
  expect(copy).toBeDefined()
  const latestUser = d.messages.filter(m => m.senderType === 'user').at(-1)!
  const root = d.workItems!.find(w => !w.parentWorkId && w.sourceMessageId === latestUser.id)!
  expect(root).toMatchObject({ ownerAgentId: byName(state, '编辑').id, status: 'delivered' })
  const child = deliveredChildren(d, root.id).find(w => w.ownerAgentId === byName(state, '选题策划').id)!
  expect(child).toMatchObject({ status: 'delivered', budgetId: root.budgetId, artifactIds: [copy!.id] })
  expect(await artifactOriginal(state.v1!)).toBe(state.v1Text)
  expect(d.artifacts.filter(a => a.logicalArtifactId === state.v1!.logicalArtifactId)).toHaveLength(2)
  await actualRead(runtime, d, state.v2!, byName(state, '编辑').id)
  await actualRead(runtime, d, state.v2!, byName(state, '选题策划').id)
  await runtime.reviewData('第二轮协作原件与根工作', { root, child, copy, content: await artifactOriginal(copy!) })
  const copyText = await artifactOriginal(copy!)
  const summary = copyText.split(/^#{1,6}\s+.*摘要.*$/m)[1]?.split(/^#{1,6}\s+/m)[0]?.trim()
  expect(summary, '发布文件必须有可核对的摘要段落').toBeTruthy()
  const count = [...summary!.replace(/\s/gu, '')].length
  await runtime.reviewData('发布摘要实际字数', { artifactId: copy!.id, summary, count, requested: [80, 120] })
  expect(count, '模型自称约100字不能替代对实际文件计数').toBeGreaterThanOrEqual(80)
  expect(count, '发布摘要不得超过原请求的120字').toBeLessThanOrEqual(120)
})
async function restartWithoutReplay(runtime: Desktop, state: State) {
  const before = await artifactDetail(runtime, state.group!.id), recordsBefore = await artifactRecords(state.dataPath!)
  await runtime.restart()
  await runtime.page.getByRole('button', { name: /周末文章编辑部/ }).click()
  const after = await artifactDetail(runtime, state.group!.id), recordsAfter = await artifactRecords(state.dataPath!)
  expect(after.runs).toEqual(before.runs); expect(after.messages).toEqual(before.messages)
  expect(recordsAfter.workItems).toEqual(recordsBefore.workItems); expect(recordsAfter.artifacts).toEqual(recordsBefore.artifacts)
  for (const artifact of after.artifacts as ArtifactVersion[]) await runtime.reviewFile(`重启原件-${artifact.name}`, artifact.path, { required: true, expectedSha256: artifact.contentHash })
  await runtime.reviewData('pnpm dev完整重启零重放', { runIdsBefore: before.runs.map(r => r.id), runIdsAfter: after.runs.map(r => r.id), workIds: after.workItems!.map(w => w.id), artifactIds: after.artifacts.map(a => a.id) })
}
When('编辑部完整重启后用户询问最后确定的文章与限制', async ({ runtime, editorial: state }) => {
  await restartWithoutReplay(runtime, state)
  await send(runtime, state, '我们继续刚才的文章。请按写手、编辑、选题策划的顺序，各用80字以内说明最后确定的版本和一条仍需遵守的内容限制。只聊天回顾，不新建任务、不修改或生成文件。')
})
Then('历史原件不重放且三人依据既有结果续聊', async ({ runtime, editorial: state }) => {
  const before = state.detail!, d = await settle(runtime, state)
  expect(d.workItems).toEqual(before.workItems); expect(d.artifacts).toEqual(before.artifacts)
  const last = d.messages.filter(m => m.senderType === 'user').at(-1)!, turn = d.turns!.find(t => t.triggerMessageId === last.id)!
  expect(turn.coordination).toMatchObject({ mode: 'ordered', revision: 4, maxReplyCharacters: 80, agentIds: ['写手', '编辑', '选题策划'].map(name => byName(state, name).id) })
  const replies = d.messages.filter(m => m.turnId === turn.id && m.senderType === 'agent')
  expect(replies).toHaveLength(3)
  for (const reply of replies) expect([...reply.content.replace(/\s/gu, '')].length, `${reply.senderName}续聊不得超过80字（含标点）`).toBeLessThanOrEqual(80)
  for (const reply of replies) {
    const item = runtime.page.locator(`#message-${reply.id}`)
    await item.scrollIntoViewIfNeeded(); await expect(item).toBeInViewport()
    await runtime.reviewNativeCheckpoint(`${reply.senderName}重启后限字续聊`)
  }
  expect(runtime.errors).toEqual([])
})

When('编辑部重启后依次用80字回顾立意', async ({ runtime, editorial: state }) => {
  await restartWithoutReplay(runtime, state)
  await send(runtime, state, '继续上一轮讨论。请按写手、编辑、选题策划的顺序，每人80字以内，接着前一位说明已讨论的立意和一条需要保留的内容边界。只讨论，不写文件。')
})
Then('本轮三条回顾均符合80字且没有文件工作', async ({ runtime, editorial: state }) => {
  const d = await settle(runtime, state), last = d.messages.filter(m => m.senderType === 'user').at(-1)!, turn = d.turns!.find(t => t.triggerMessageId === last.id)!
  const replies = d.messages.filter(m => m.turnId === turn.id && m.senderType === 'agent')
  expect(turn.coordination).toMatchObject({ mode: 'ordered', revision: 4, maxReplyCharacters: 80 })
  expect(replies.map(m => m.senderId)).toEqual(['写手', '编辑', '选题策划'].map(name => byName(state, name).id))
  expect(d.workItems).toEqual([]); expect(d.artifacts).toEqual([])
  for (const reply of replies) {
    expect([...reply.content.replace(/\s/gu, '')].length).toBeLessThanOrEqual(80)
    const item = runtime.page.locator(`#message-${reply.id}`)
    await item.scrollIntoViewIfNeeded(); await expect(item).toBeInViewport()
    await runtime.reviewNativeCheckpoint(`${reply.senderName}80字立意回顾`)
  }
})
When('用户明确取消字数限制继续接龙', async ({ runtime, editorial: state }) => {
  await send(runtime, state, '这一轮取消此前的字数限制。请按选题策划、写手、编辑的顺序接龙，每人接着前一位补充一个更具体的表达建议；只讨论，不写文件。')
})
Then('本轮没有继承历史字数上限', async ({ runtime, editorial: state }) => {
  const d = await settle(runtime, state), last = d.messages.filter(m => m.senderType === 'user').at(-1)!, turn = d.turns!.find(t => t.triggerMessageId === last.id)!
  expect(turn.coordination).toMatchObject({ mode: 'ordered', revision: 4 })
  expect(turn.coordination?.maxReplyCharacters ?? null).toBeNull()
  expect(d.messages.filter(m => m.turnId === turn.id && m.senderType === 'agent').map(m => m.senderId)).toEqual(state.agents.map(a => a.id))
  expect(d.workItems).toEqual([]); expect(d.artifacts).toEqual([])
  expect(runtime.errors).toEqual([])
})

When('三位员工按实际前置发言接力准备活动公告', async ({ runtime, editorial: state }) => {
  await send(runtime, state, '准备一条内部活动公告。仅有事实：日期周六，时间10:00，地点青松厅，名额30人，报名截止周四。请按选题策划、写手、编辑顺序接力：策划拟一版完整公告；写手接着策划的实际公告改善表达；编辑核对前两人的事实，给出最后完整公告。每人只发一次，正文都要包含上述五项事实。只聊天，不生成文件或任务。')
})
Then('活动公告三次接力使用实际前文且保留五项事实', async ({ runtime, editorial: state }) => {
  const d = await settle(runtime, state), turn = d.turns!.at(-1)!
  expect(turn.coordination).toMatchObject({ mode: 'ordered', revision: 4 })
  const replies = d.messages.filter(m => m.turnId === turn.id && m.senderType === 'agent')
  expect(replies.map(m => m.senderId)).toEqual(state.agents.map(a => a.id))
  for (const reply of replies) for (const fact of ['周六', '10:00', '青松厅', '30', '周四']) expect(reply.content).toContain(fact)
  expect(d.workItems).toEqual([]); expect(d.artifacts).toEqual([])
})
When('用户重启后更正公告时间地点名额并要求再次接力', async ({ runtime, editorial: state }) => {
  await restartWithoutReplay(runtime, state)
  await send(runtime, state, '刚才的公告需要更正：活动改为周日15:30，地点改为白鹭厅，名额改为24人，报名截止仍是周四。旧的周六10:00、青松厅、30人作废。请按编辑、写手、选题策划顺序接力修订，每人基于上一位的实际新公告，输出一份包含五项当前事实的完整短公告。只输出新公告，不复述旧值，也不写文件。')
})
Then('三人只使用更正后的事实且没有自动重放', async ({ runtime, editorial: state }) => {
  const d = await settle(runtime, state), turn = d.turns!.at(-1)!
  expect(turn.coordination).toMatchObject({ mode: 'ordered', revision: 4 })
  const replies = d.messages.filter(m => m.turnId === turn.id && m.senderType === 'agent')
  expect(replies.map(m => m.senderId)).toEqual(['编辑', '写手', '选题策划'].map(name => byName(state, name).id))
  for (const reply of replies) {
    for (const fact of ['周日', '15:30', '白鹭厅', '24', '周四']) expect(reply.content).toContain(fact)
    for (const stale of ['周六', '10:00', '青松厅', '30人']) expect(reply.content).not.toContain(stale)
  }
  expect(d.workItems).toEqual([]); expect(d.artifacts).toEqual([])
})
When('用户明确结束公告协作无需回复', async ({ runtime, editorial: state }) => {
  await send(runtime, state, '公告已确认。本条仅通知，协作到此结束；所有人都不需要回复，也不要创建任务、修改文件或继续接龙。')
})
Then('三人正常判断后保持静默且没有后续任务', async ({ runtime, editorial: state }) => {
  const d = await settle(runtime, state), turn = d.turns!.at(-1)!
  expect(turn.coordination).toMatchObject({ mode: 'independent' })
  expect(d.messages.filter(m => m.turnId === turn.id && m.senderType === 'agent')).toEqual([])
  const decisions = d.decisions!.filter(item => item.turnId === turn.id)
  expect(decisions.map(item => item.agentId).sort()).toEqual(state.agents.map(a => a.id).sort())
  expect(decisions.every(item => item.action === 'pass')).toBe(true)
  expect(d.workItems).toEqual([]); expect(d.artifacts).toEqual([])
  expect(runtime.errors).toEqual([])
})
