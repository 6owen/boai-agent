/*
 * [INPUT]: D2 中文成果场景、生产 Electron UI/IPC、真实模型工具与隔离 SQLite/原件。
 * [OUTPUT]: 所见版本/原交付和真实材料来源、按实际发布 run 核对工具/判断零工具、同名独立/重复采用、未知修订/采用跨关闭重启冻结原请求、原件失效及明确冲突弹窗/清理隔离业务断言。
 * [POS]: 成果 Electron 业务步骤；HTTP、文件准备和传输故障由 support 承担。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { nextMaterialDialog } from '../support/materials'
import { artifactDetail, artifactOriginal, artifactPendingRequests, artifactRecords, artifactReplyFault, changeArtifactOriginal, prepareArtifactsDesktop, removeArtifactOriginal } from '../support/artifacts'
import type { ArtifactAdoptionInput, ArtifactRevisionInput, ArtifactVersion } from '../../../src/shared/domain/artifacts'
import type { ConversationDetail } from '../../../src/shared/domain'
import type { ConversationMaterial } from '../../../src/shared/domain/materials'

type Fault = Awaited<ReturnType<typeof artifactReplyFault>>
interface State {
  fixture?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>
  originals: ArtifactVersion[]
  other?: ArtifactVersion
  v2?: ArtifactVersion
  material?: ConversationMaterial
  originalDetail?: ConversationDetail
  fault?: Fault
  frozen?: ArtifactAdoptionInput | ArtifactRevisionInput
  beforeRecovery?: Awaited<ReturnType<typeof artifactRecords>>
  calls?: number
}
export const test = base.extend<{ artifactsState: State }>({ artifactsState: async ({}, use) => use({ originals: [] }) })
const { Given, When, Then } = createBdd(test)
const panel = (page: Page, artifact: ArtifactVersion) => page.locator(`[data-artifact-id="${artifact.id}"]:visible`)
async function selectChat(runtime: Desktop, title: string) { await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click() }
async function settled(runtime: Desktop, conversationId: string, artifactCount: number) {
  await expect.poll(async () => {
    const detail = await artifactDetail(runtime, conversationId)
    return detail.artifacts.length === artifactCount && !!detail.runs.length && detail.runs.every(run => ['completed', 'cancelled', 'failed', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'cancelled', 'failed', 'interrupted'].includes(turn.status))
  }, { timeout: 30_000 }).toBe(true)
  const detail = await artifactDetail(runtime, conversationId)
  expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  return detail
}
async function publish(runtime: Desktop, state: State, conversationId: string, title: string, count: number, content = '请执行文件任务，发布可检查的交付报告。') {
  await selectChat(runtime, title)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const detail = await settled(runtime, conversationId, count)
  expect(state.fixture!.errors).toEqual([])
  return detail.artifacts.at(-1) as ArtifactVersion
}
async function openArtifact(runtime: Desktop, artifact: ArtifactVersion) {
  const detail = await artifactDetail(runtime, artifact.conversationId), message = detail.messages.find(value => value.id === artifact.sourceMessageId)
  expect(message).toBeDefined()
  await runtime.page.locator(`#message-${message!.id}`).getByRole('button', { name: `打开 ${artifact.name}`, exact: true }).click()
  await expect(panel(runtime.page, artifact)).toBeVisible()
  await expect(panel(runtime.page, artifact).getByRole('region', { name: `成果第 ${artifact.contentVersion} 版正文`, exact: true })).toBeVisible()
}
async function version(runtime: Desktop, artifact: ArtifactVersion, number: number) {
  const view = panel(runtime.page, artifact), summary = view.locator('summary').filter({ hasText: /^版本 · / })
  if (!(await summary.evaluate(element => (element.parentElement as HTMLDetailsElement).open))) await summary.click()
  await view.getByRole('button', { name: new RegExp(`^第 ${number} 版 · `) }).click()
}
async function requestRevision(runtime: Desktop, artifact: ArtifactVersion, content = '补充明确验收条件，并发布修订后的报告。') {
  const view = panel(runtime.page, artifact)
  await view.getByRole('button', { name: '要求修改', exact: true }).click()
  await view.getByRole('textbox', { name: '修改要求', exact: true }).fill(content)
  await view.getByRole('button', { name: '提交修改要求', exact: true }).click()
}
async function initial(runtime: Desktop, state: State) {
  const fixture = state.fixture!, artifact = await publish(runtime, state, fixture.group.id, fixture.group.title, 1)
  state.originals = [artifact]; state.originalDetail = await artifactDetail(runtime, fixture.group.id)
  await openArtifact(runtime, artifact)
}
async function createV2(runtime: Desktop, state: State) {
  const fixture = state.fixture!, original = state.originals[0]
  await requestRevision(runtime, original)
  const detail = await settled(runtime, fixture.group.id, 2)
  state.v2 = detail.artifacts.find(value => value.previousArtifactId === original.id) as ArtifactVersion
  expect(state.v2).toBeDefined(); expect(fixture.errors).toEqual([])
}
async function expectFrozen(runtime: Desktop, state: State, kind: 'adoption' | 'revision') {
  const values = Object.values(await artifactPendingRequests(runtime)), pending = values.find(value => value.conversationId === state.fixture!.group.id && value.logicalArtifactId === state.originals[0].logicalArtifactId)
  expect(pending?.[kind]?.status).toBe('unknown'); expect(pending?.[kind]?.input).toEqual(state.frozen)
}

Given('成果协作组和独立私聊已连接真实工具协议模型', async ({ runtime, artifactsState }) => {
  artifactsState.fixture = await prepareArtifactsDesktop(runtime)
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  expect(artifactsState.fixture.endpoint.requests).toHaveLength(0)
})
When('用户用真实文本材料要求发布第一版报告', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!
  await selectChat(runtime, fixture.group.title); await nextMaterialDialog(runtime, { path: fixture.source })
  await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click(); await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(runtime.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
  artifactsState.material = (await artifactDetail(runtime, fixture.group.id)).materials![0]
  await initial(runtime, artifactsState)
})
Then('第一版原文和材料引用都能检查来源', async ({ runtime, artifactsState }) => {
  const artifact = artifactsState.originals[0], material = artifactsState.material!, view = panel(runtime.page, artifact)
  expect(artifact.materialSources?.map(value => value.id)).toEqual([material.id])
  expect(await artifactOriginal(artifact)).toContain('ARTIFACT_V1')
  const raw = await runtime.page.evaluate(id => window.boai.request('getArtifactPreview', { id }), artifact.id)
  expect(raw.text).toBe(await artifactOriginal(artifact)); expect(raw.text).toContain(`material:${material.id}:text-v1:L2`)
  await expect(view).toContainText('未记录本版审核')
  await view.getByRole('button', { name: '查看材料 依据.txt 第 2 至 2 行', exact: true }).click()
  const source = runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)
  await expect(source).toContainText('ARTIFACT_MATERIAL_EVIDENCE')
  await expect(source.getByRole('button', { name: '定位材料第 2 行', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await openArtifact(runtime, artifact)
})
When('用户明确要求修改第一版报告', async ({ runtime, artifactsState }) => createV2(runtime, artifactsState))
Then('新版发布后当前审阅仍是第一版且原交付保持', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0], v2 = artifactsState.v2!, view = panel(runtime.page, original), detail = await artifactDetail(runtime, fixture.group.id)
  await expect(view.getByRole('region', { name: '成果第 1 版正文', exact: true })).toContainText('ARTIFACT_V1')
  await expect(view).toContainText('有新版本。当前仍在审阅第 1 版。')
  expect(await artifactOriginal(original)).toContain('ARTIFACT_V1'); expect(await artifactOriginal(v2)).toContain('ARTIFACT_V2')
  expect(v2).toMatchObject({ logicalArtifactId: original.logicalArtifactId, previousArtifactId: original.id, contentVersion: 2 })
  expect(v2.sourceWorkId).not.toBe(original.sourceWorkId)
  expect(detail.workItems?.find(value => value.id === original.sourceWorkId)).toEqual(artifactsState.originalDetail!.workItems!.find(value => value.id === original.sourceWorkId))
  expect(detail.workBudgets?.find(value => value.id === artifactsState.originalDetail!.workItems!.find(value => value.id === original.sourceWorkId)!.budgetId)).toEqual(artifactsState.originalDetail!.workBudgets!.find(value => value.id === artifactsState.originalDetail!.workItems!.find(value => value.id === original.sourceWorkId)!.budgetId))
  expect(fixture.replacements).toEqual([{ runId: v2.runId, revisionRequestId: v2.revisionRequestId }])
  const records = await artifactRecords(fixture.dataPath)
  expect(records.adoptionEvents).toHaveLength(0)
  const executionRuns = detail.runs.filter(run => run.phase === 'execution')
  expect(executionRuns).toHaveLength(2)
  expect(executionRuns.map(run => run.id).sort()).toEqual([original.runId, v2.runId].sort())
  const publicationRuns = [original, v2].map(artifact => detail.runs.find(run => run.id === artifact.runId))
  expect(new Set(publicationRuns.map(run => run?.id)).size).toBe(2)
  for (const run of publicationRuns) {
    expect(run).toBeDefined()
    expect(run!.phase).toBe('execution')
    expect(run!.status).toBe('completed')
    expect(run!.toolEvents.filter(value => value.status === 'completed').map(value => value.name)).toEqual(['write_file', 'publish_artifact', 'report_work'])
    expect(run!.toolEvents.some(value => value.status === 'failed')).toBe(false)
  }
  for (const run of detail.runs.filter(run => run.phase === 'decision')) expect(run.toolEvents).toEqual([])
})
When('用户打开并采用第二版报告', async ({ runtime, artifactsState }) => {
  await panel(runtime.page, artifactsState.originals[0]).getByRole('button', { name: '查看新版', exact: true }).click()
  const view = panel(runtime.page, artifactsState.v2!)
  await expect(view.getByRole('region', { name: '成果第 2 版正文', exact: true })).toContainText('ARTIFACT_V2')
  await expect(view).toContainText('未记录本版审核')
  await view.getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(view.getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
})
Then('版本和采用随切页切聊天与重启保留且不重放工具', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, v2 = artifactsState.v2!, original = artifactsState.originals[0], material = artifactsState.material!, calls = fixture.endpoint.requests.length
  await runtime.page.getByRole('button', { name: '通讯录', exact: true }).click(); await expect(runtime.page.locator('[data-artifact-id]:visible')).toHaveCount(0)
  await runtime.page.getByRole('button', { name: '会话', exact: true }).click(); await expect(panel(runtime.page, v2)).toBeVisible()
  await selectChat(runtime, fixture.other.title); await selectChat(runtime, fixture.group.title)
  await expect(panel(runtime.page, v2).getByRole('region', { name: '采用记录', exact: true })).toContainText('当前采用：第 2 版')
  const before = await artifactRecords(fixture.dataPath)
  await runtime.restart(); await selectChat(runtime, fixture.group.title); await openArtifact(runtime, original)
  await expect(panel(runtime.page, original)).toContainText('当前采用：第 2 版'); await version(runtime, original, 2)
  await expect(panel(runtime.page, v2).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  await panel(runtime.page, v2).getByRole('button', { name: '查看材料 依据.txt 第 2 至 2 行', exact: true }).click()
  await expect(runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)).toContainText('ARTIFACT_MATERIAL_EVIDENCE')
  const after = await artifactRecords(fixture.dataPath)
  expect(after.artifacts).toEqual(before.artifacts); expect(after.materials).toEqual(before.materials); expect(after.adoptionEvents).toEqual(before.adoptionEvents)
  expect(fixture.endpoint.requests).toHaveLength(calls)
})

When('用户用两个独立请求发布同名报告', async ({ runtime, artifactsState }) => {
  await initial(runtime, artifactsState)
  const fixture = artifactsState.fixture!, second = await publish(runtime, artifactsState, fixture.group.id, fixture.group.title, 2, '请执行另一个独立文件任务，发布同名报告。')
  artifactsState.originals.push(second)
})
Then('同名报告各有独立内容身份与版本家族', async ({ runtime, artifactsState }) => {
  const [first, second] = artifactsState.originals
  expect(first.name).toBe(second.name); expect(first.contentHash).not.toBe(second.contentHash); expect(first.id).not.toBe(second.id)
  for (const artifact of artifactsState.originals) {
    expect(artifact.logicalArtifactId).toBe(artifact.id); expect(artifact.contentVersion).toBe(1); expect(artifact.previousArtifactId).toBeUndefined()
    await openArtifact(runtime, artifact); await expect(panel(runtime.page, artifact).locator('summary').filter({ hasText: /^版本 · 1$/ })).toBeVisible()
  }
})
When('用户采用第一份同名报告并重复明确选择同版', async ({ runtime, artifactsState }) => {
  const first = artifactsState.originals[0]; await openArtifact(runtime, first)
  await panel(runtime.page, first).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(panel(runtime.page, first).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  // A second actual user API intent must also be idempotent, even though the UI disables duplicate clicks.
  await runtime.page.evaluate(artifact => window.boai.request('adoptArtifact', { artifactId: artifact.id, contentHash: artifact.contentHash, expectedAdoptionRevision: 1, requestId: crypto.randomUUID() }), first)
})
Then('采用只记录一次且另一份报告没有被采用', async ({ runtime, artifactsState }) => {
  const records = await artifactRecords(artifactsState.fixture!.dataPath), [first, second] = artifactsState.originals
  expect(records.adoptionEvents).toHaveLength(1); expect(records.adoptionCurrent).toHaveLength(1); expect(records.adoptionCurrent[0].artifactId).toBe(first.id)
  expect(new Set(records.adoptionReceipts.map(value => value.eventId)).size).toBe(1)
  await openArtifact(runtime, second); await expect(panel(runtime.page, second)).toContainText('未记录人工采用')
  await expect(panel(runtime.page, second).getByRole('button', { name: '采用此版本', exact: true })).toBeEnabled()
})

When('用户取得报告的第一版', async ({ runtime, artifactsState }) => initial(runtime, artifactsState))
When('用户取得报告的第一版和第二版', async ({ runtime, artifactsState }) => { await initial(runtime, artifactsState); await createV2(runtime, artifactsState); await version(runtime, artifactsState.originals[0], 2) })
When('用户采用第二版后回复与采用回执暂时失联', async ({ runtime, artifactsState }) => {
  artifactsState.fault = await artifactReplyFault(runtime, 'adoption')
  await panel(runtime.page, artifactsState.v2!).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(panel(runtime.page, artifactsState.v2!).getByRole('button', { name: '核对采用结果', exact: true })).toBeVisible()
  const state = await artifactsState.fault.inspect(); expect(state.submissions).toHaveLength(1); expect(state.lostReplies).toBe(1)
  artifactsState.frozen = state.submissions[0]; artifactsState.beforeRecovery = await artifactRecords(artifactsState.fixture!.dataPath); artifactsState.calls = artifactsState.fixture!.endpoint.requests.length
})
Then('切到旧版与关闭详情仍冻结第二版采用身份', async ({ runtime, artifactsState }) => {
  await version(runtime, artifactsState.v2!, 1); await expectFrozen(runtime, artifactsState, 'adoption')
  await expect(panel(runtime.page, artifactsState.originals[0]).getByRole('region', { name: '未决采用请求', exact: true })).toContainText('采用 · 第 2 版')
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click(); await expectFrozen(runtime, artifactsState, 'adoption')
  expect((await artifactsState.fault!.inspect()).submissions).toHaveLength(1)
})
When('用户重启后明确核对原采用结果', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!
  await runtime.restart(); artifactsState.fault = await artifactReplyFault(runtime, 'adoption', { loseReply: false, lookupUnavailable: false })
  await selectChat(runtime, fixture.group.title); await openArtifact(runtime, artifactsState.originals[0]); await expectFrozen(runtime, artifactsState, 'adoption')
  await panel(runtime.page, artifactsState.originals[0]).getByRole('button', { name: '核对采用结果', exact: true }).click()
  await expect(panel(runtime.page, artifactsState.originals[0]).getByRole('region', { name: '未决采用请求', exact: true })).toHaveCount(0)
})
Then('只恢复原采用回执且后续采用旧版保留真实历史', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0], fault = await artifactsState.fault!.inspect(), records = await artifactRecords(fixture.dataPath)
  expect(fault.submissions).toHaveLength(0); expect(fault.lookups).toEqual([(artifactsState.frozen as ArtifactAdoptionInput).requestId])
  expect(records.adoptionEvents).toEqual(artifactsState.beforeRecovery!.adoptionEvents)
  await expect(panel(runtime.page, original)).toContainText('当前采用：第 2 版')
  await panel(runtime.page, original).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(panel(runtime.page, original)).toContainText('当前采用：第 1 版')
  expect((await artifactRecords(fixture.dataPath)).adoptionEvents.map(value => value.contentVersion)).toEqual([2, 1])
  expect(fixture.endpoint.requests).toHaveLength(artifactsState.calls!)
})

When('用户要求修改第一版后回复与消息回执暂时失联', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0]
  artifactsState.fault = await artifactReplyFault(runtime, 'revision')
  await requestRevision(runtime, original, '原修改要求：增加可检查来源并保留第一版原文。')
  await expect(panel(runtime.page, original).getByRole('button', { name: '核对修改结果', exact: true })).toBeVisible()
  const state = await artifactsState.fault.inspect(); expect(state.submissions).toHaveLength(1); expect(state.lostReplies).toBe(1); artifactsState.frozen = state.submissions[0]
  const detail = await settled(runtime, fixture.group.id, 2); artifactsState.v2 = detail.artifacts.find(value => value.previousArtifactId === original.id) as ArtifactVersion
  artifactsState.beforeRecovery = await artifactRecords(fixture.dataPath); artifactsState.calls = fixture.endpoint.requests.length
})
Then('新版和详情关闭都不能覆盖原修改要求与身份', async ({ runtime, artifactsState }) => {
  await version(runtime, artifactsState.originals[0], 2); const view = panel(runtime.page, artifactsState.v2!)
  await expect(view).toContainText((artifactsState.frozen as ArtifactRevisionInput).content)
  await expect(view.getByRole('textbox', { name: '修改要求', exact: true })).toHaveCount(0)
  await expect(view.getByRole('button', { name: '要求修改', exact: true })).toBeDisabled(); await expectFrozen(runtime, artifactsState, 'revision')
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click(); await expectFrozen(runtime, artifactsState, 'revision')
  expect((await artifactsState.fault!.inspect()).submissions).toHaveLength(1)
})
When('用户重启后明确核对原修改结果', async ({ runtime, artifactsState }) => {
  await runtime.restart(); artifactsState.fault = await artifactReplyFault(runtime, 'revision', { loseReply: false, lookupUnavailable: false })
  await selectChat(runtime, artifactsState.fixture!.group.title); await openArtifact(runtime, artifactsState.v2!)
  await expectFrozen(runtime, artifactsState, 'revision')
  await panel(runtime.page, artifactsState.v2!).getByRole('button', { name: '核对修改结果', exact: true }).click()
  await expect(panel(runtime.page, artifactsState.v2!).getByRole('button', { name: '核对修改结果', exact: true })).toHaveCount(0)
})
Then('只恢复原用户消息且没有重复轮次工作或模型调用', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, input = artifactsState.frozen as ArtifactRevisionInput, fault = await artifactsState.fault!.inspect(), after = await artifactRecords(fixture.dataPath), before = artifactsState.beforeRecovery!
  expect(fault.submissions).toHaveLength(0); expect(fault.lookups).toEqual([input.requestId])
  expect(after.messages.map(value => value.id)).toEqual(before.messages.map(value => value.id)); expect(after.turns.map(value => value.id)).toEqual(before.turns.map(value => value.id)); expect(after.workItems).toEqual(before.workItems); expect(after.revisions).toEqual(before.revisions)
  expect(after.revisions).toHaveLength(1); const request = after.revisions[0]
  expect(request).toMatchObject({ id: input.requestId, artifactId: input.artifactId, contentHash: input.contentHash, targetAgentId: input.targetAgentId, content: input.content })
  expect(after.messages.filter(value => value.id === request.messageId)).toHaveLength(1); expect(after.turns.filter(value => value.triggerMessageId === request.messageId)).toHaveLength(1)
  expect(after.artifacts.filter(value => value.revisionRequestId === input.requestId)).toHaveLength(1)
  expect(fixture.endpoint.requests).toHaveLength(artifactsState.calls!)
})

When('用户取得同聊两份报告和其他聊天独立报告', async ({ runtime, artifactsState }) => {
  await initial(runtime, artifactsState); const fixture = artifactsState.fixture!
  artifactsState.originals.push(await publish(runtime, artifactsState, fixture.group.id, fixture.group.title, 2, '发布另一份独立报告。'))
  artifactsState.other = await publish(runtime, artifactsState, fixture.other.id, fixture.other.title, 1, '发布其他聊天的独立报告。')
  await selectChat(runtime, fixture.group.title); await openArtifact(runtime, artifactsState.originals[0])
})
When('第一份报告被外部修改而第二份原件被移走', async ({ artifactsState }) => {
  await changeArtifactOriginal(artifactsState.originals[0], '# 外部修改必须保留\nEXTERNAL_ARTIFACT_PRESERVED\n'); await removeArtifactOriginal(artifactsState.originals[1])
})
Then('原版本不可预览且陈旧内容身份不能采用', async ({ runtime, artifactsState }) => {
  const first = artifactsState.originals[0], view = panel(runtime.page, first)
  // The still-visible stale button is the user's real attempt; host byte identity must refuse it.
  await view.getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(view).toContainText('外部修改')
  await expect(view.getByRole('region', { name: '成果第 1 版正文', exact: true })).toHaveCount(0)
  const rejected = await runtime.page.evaluate(async artifacts => {
    const failures: string[] = []
    for (const artifact of artifacts) { try { await window.boai.request('getArtifactPreview', { id: artifact.id, expectedHash: artifact.contentHash }); failures.push('unexpected success') } catch (error) { failures.push(String(error)) } }
    return failures
  }, artifactsState.originals)
  expect(rejected[0]).toContain('外部修改'); expect(rejected[1]).toContain('不存在')
  expect((await artifactRecords(artifactsState.fixture!.dataPath)).adoptionEvents).toHaveLength(0)
})
When('用户清空发生原件冲突的成果聊天', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!
  const row = runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${fixture.group.title}`) })
  await row.click({ button: 'right' }); await runtime.page.getByRole('menuitem', { name: '清空聊天记录', exact: true }).click()
  await runtime.page.getByRole('button', { name: '确认清空', exact: true }).click()
  await expect.poll(async () => (await artifactRecords(fixture.dataPath)).cleanupGates.some(value => value.id === fixture.group.id)).toBe(true)
  const dialog = runtime.page.getByRole('alertdialog', { name: '清空聊天记录？', exact: true })
  await expect(dialog.getByRole('alert')).toContainText('成果已被外部修改，原文件已保留')
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})
Then('清理门禁保留外改文件且其他聊天成果仍可使用', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0], other = artifactsState.other!, records = await artifactRecords(fixture.dataPath)
  expect(await artifactOriginal(original)).toContain('EXTERNAL_ARTIFACT_PRESERVED')
  expect(records.artifacts.filter(value => value.conversationId === fixture.group.id)).toHaveLength(0)
  expect(records.cleanups.find(value => value.id === original.id)?.status).toBe('conflict')
  const refused = await runtime.page.evaluate(async id => { try { await window.boai.request('getArtifactPreview', { id }); return 'unexpected success' } catch (error) { return String(error) } }, original.id)
  expect(refused).not.toBe('unexpected success')
  await selectChat(runtime, fixture.other.title); await openArtifact(runtime, other)
  await expect(panel(runtime.page, other).getByRole('region', { name: '成果第 1 版正文', exact: true })).toContainText('ARTIFACT_V1')
  await panel(runtime.page, other).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(panel(runtime.page, other).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  const calls = fixture.endpoint.requests.length
  await runtime.restart(); await selectChat(runtime, fixture.other.title); await openArtifact(runtime, other)
  expect(await artifactOriginal(original)).toContain('EXTERNAL_ARTIFACT_PRESERVED')
  expect((await artifactRecords(fixture.dataPath)).cleanupGates.some(value => value.id === fixture.group.id)).toBe(true)
  expect(fixture.endpoint.requests).toHaveLength(calls)
})
