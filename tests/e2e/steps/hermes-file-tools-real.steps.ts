/*
 * [INPUT]: 真实 API 连接、隔离桌面和包含 BOM/CRLF 的长文件输入。
 * [OUTPUT]: 一次实际聊天触发 read_file 分页、edit_file 和 publish_artifact；逐字核对交付与工具记录。
 * [POS]: Hermes 文件工具真实业务验收；仅准备输入，不替员工改文件，零自动重试。
 * [PROTOCOL]: 修改后同步 Header 和所属 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Conversation, ConversationDetail, DigitalAgent } from '../../../src/shared/domain'
import { prepareV2DataRoot } from '../../../src/main/migration'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import { artifactRecords } from '../support/artifacts'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { test as base } from '../support/test'

const ORIGINAL = '\uFEFF# Long project plan\r\n' + Array.from({ length: 650 }, (_, i) => `Record ${String(i).padStart(4, '0')}: preserve the original sample information and spacing exactly as written.\r\n`).join('') + '\r\n负责人：小林😀\r\n唯一截止日期：2026-11-01\r\n验收标准：其他原始字节保持。\r\n'
interface State { dataPath?: string; source?: string; agent?: DigitalAgent; chat?: Conversation; detail?: ConversationDetail }
export const test = base.extend<{ hermesFiles: State }>({ hermesFiles: async ({ runtime }, use) => {
  const state: State = {}
  try { await use(state) } finally {
    if (state.dataPath) await archiveNativeFinalReview(runtime, { label: 'Hermes 长文件精确修改', records: async () => artifactRecords(state.dataPath!) })
  }
} })
const { Given, When, Then } = createBdd(test)

Given('Hermes 文件验收准备真实 API 员工和长文件', async ({ runtime: d, hermesFiles: s }) => {
  test.skip(process.env.BOAI_REAL_HERMES_FILES !== '1', 'Explicit real-provider file tool acceptance required')
  test.setTimeout(480000)
  test.info().annotations.push({ type: 'model-mode', description: 'real-provider' })
  await d.reviewData('本场预登记', { backend: 'api', userMessages: 1, retries: 0, inputBytes: Buffer.byteLength(ORIGINAL), task: 'read all pages, edit only the unique date at EOF, publish and preserve every other byte' })
  await prepareV2DataRoot(d.root)
  const connection = await prepareSavedModel(d)
  await d.start(await systemKeychainLaunch(d))
  s.dataPath = (await d.page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  s.agent = await d.page.evaluate(connection => window.boai.request('saveAgent', { name: '长文件修改验收员工', role: '精确修改文本文件', instructions: '按用户要求使用 read_file 分页读取、edit_file 精确修改和 publish_artifact 交付，保留其他内容。', connectionId: connection.id, modelId: connection.defaultModel, color: '#3478ce', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }), connection)
  s.chat = await d.page.evaluate(id => window.boai.request('createConversation', { kind: 'direct', title: '长文件修改验收', agentIds: [id] }), s.agent.id)
  const work = join(s.dataPath, 'agents', s.agent.id, 'workspace', 'sessions', s.chat.id, 'work')
  await mkdir(work, { recursive: true })
  s.source = join(work, 'plan.md')
  await writeFile(s.source, ORIGINAL)
  await d.reviewFile('原始长文件输入', s.source, { required: true })
  await d.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^长文件修改验收/ }).click()
})
When('用户要求员工只修改长文件末尾的日期', async ({ runtime: d, hermesFiles: s }) => {
  await d.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('请处理现有 self:/work/plan.md：先用 read_file 从开头跟随 nextOffset 读完全部页面，然后用 edit_file 仅把末尾唯一的日期 2026-11-01 改为 2026-11-08，其余所有文字、空格、BOM 和 CRLF 换行逐字保持。完成后用 publish_artifact 交付 plan.md，不要只回复说明。')
  await d.reviewCheckpoint('长文件修改请求发送前')
  await d.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => {
    s.detail = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat!.id)
    return s.detail.runs.length > 0 && s.detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && s.detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))
  }, { timeout: 300000, intervals: [500, 1000] }).toBe(true)
  await d.reviewData('真实员工执行记录', s.detail)
})
Then('员工通过分页和精确修改工具交付且其他字节保持', async ({ runtime: d, hermesFiles: s }) => {
  const detail = s.detail!
  expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  expect(detail.artifacts).toHaveLength(1)
  expect(detail.workItems?.every(work => work.status === 'delivered')).toBe(true)
  const events = detail.runs.flatMap(run => run.toolEvents).filter(event => event.status === 'completed')
  expect(events.filter(event => event.name === 'read_file').length).toBeGreaterThanOrEqual(2)
  expect(events.filter(event => event.name === 'edit_file')).toHaveLength(1)
  expect(events.filter(event => event.name === 'publish_artifact')).toHaveLength(1)
  const expected = Buffer.from(ORIGINAL.replace('2026-11-01', '2026-11-08'))
  expect(await readFile(detail.artifacts[0].path)).toEqual(expected)
  expect(await readFile(s.source!)).toEqual(expected)
  await d.reviewFile('员工实际长文件交付', detail.artifacts[0].path, { required: true })
  await d.reviewCheckpoint('长文件修改交付后的聊天')
})
