/*
 * [OUTPUT]: 标题修改入口移除，原日期/Word实际内容由正文选区打开浮层。
 * [OUTPUT]: 原版横向SelectionActions直接填写要求；自动选文定位保留，不再填写独立位置表单。
 * [OUTPUT]: 真实修改从选文Popover直接提交；来源标注在更多选项展开，结果仍核对真实交付。
 * [OUTPUT]: 真实文件修改要求从文件侧边会话提交，结果入口同面板；主聊天只用于初始附件输入。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [INPUT]: 真实员工、现有保存连接/本机 profile、实际桌面预览与聊天。
 * [OUTPUT]: 两次 UI 明确发送、原件/版本/不变段落核对；测试只准备输入，不替员工改文件。
 * [POS]: 文件修改真实能力验收；与协议夹具分开登记，隔离目录且零自动重试。
 * [PROTOCOL]: 修改后同步 Header 和所属 .folder.md。
 */
import { expect, type Locator } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { sampleDocx } from '../../lody/office-viewer-files'
import type { Conversation, ConversationDetail, DigitalAgent, LaunchProfile } from '../../../src/shared/domain'
import type { ConversationMaterial } from '../../../src/shared/domain/materials'
import type { ArtifactVersion } from '../../../src/shared/domain/artifacts'
import { prepareV2DataRoot } from '../../../src/main/migration'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import { nextMaterialDialog } from '../support/materials'
import { selectPreviewText } from '../support/file-preview'
import { artifactRecords } from '../support/artifacts'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

const DOCX = Buffer.from(sampleDocx())
const ORIGINAL = '# 项目计划\n\n负责人：小林\n截止日期：2026-11-01\n验收标准：完成代码评审\n'
interface State { backend?: string; dataPath?: string; agent?: DigitalAgent; chat?: Conversation; material?: ConversationMaterial; first?: ArtifactVersion; second?: ArtifactVersion; detail?: ConversationDetail }
export const test = base.extend<{ fileEdit: State }>({ fileEdit: async ({ runtime }, use) => {
  const state: State = {}
  try { await use(state) } finally {
    if (state.dataPath) await archiveNativeFinalReview(runtime, { label: '文件标注修改验收', records: async () => artifactRecords(state.dataPath!) })
  }
} })
const { Given, When, Then } = createBdd(test)
async function selectDate(view: Locator) {
  await expect(view.locator('[data-file-preview-kind]')).toBeVisible()
  const source = view.getByRole('button', { name: '显示源码', exact: true })
  if (await source.count()) await source.click()
  const line = view.locator('[data-file-line]').filter({ hasText: '截止日期：' })
  await expect(line).toHaveCount(1)
  await line.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element.querySelector('.shiki-line-content') ?? element); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
}
async function sendAndWait(d: Desktop, s: State, count: number, content: string) {
  await d.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill(content)
  await d.reviewCheckpoint('发送前文件标注草稿-' + count)
  await d.page.getByRole('button', { name: '发送文件修改', exact: true }).click()
  await expect.poll(async () => {
    s.detail = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat!.id)
    return s.detail.messages.filter(message => message.senderType === 'user').length >= count + 1 && s.detail.runs.length > 0 && s.detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && s.detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))
  }, { timeout: 240000, intervals: [400, 1000] }).toBe(true)
  await d.reviewData('员工实际执行-' + count, s.detail)
  expect(s.detail!.runs.every(run => run.status === 'completed')).toBe(true)
  expect(s.detail!.artifacts).toHaveLength(count)
  expect(s.detail!.workItems?.every(work => work.status === 'delivered')).toBe(true)
}
async function prepareFileEmployee(d: Desktop, s: State, backend: string, format: 'md' | 'docx' = 'md') {
  test.skip(process.env.BOAI_REAL_FILE_EDIT !== '1', 'Explicit real-file acceptance switch required')
  test.setTimeout(600000); test.info().annotations.push({ type: 'model-mode', description: 'real-provider' }); s.backend = backend
  await d.reviewData('本场预登记', { backend, format, modificationMessages: format === 'docx' ? 1 : 2, attachmentPreparationMessages: 1, retries: 0, nativeBudget: 'none', task: 'modify only selected deadline; preserve original and deliver real versions' })
  const connection = backend === 'api' ? (await prepareV2DataRoot(d.root), await prepareSavedModel(d)) : undefined
  await d.start(connection ? await systemKeychainLaunch(d) : undefined)
  s.dataPath = (await d.page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  let profile: LaunchProfile | undefined
  if (backend === 'codex') {
    const executable = process.env.BOAI_NATIVE_CODEX; expect(executable).toBeTruthy()
    const input = { name: '文件修改验收', executable: executable!, args: [], protocol: 'codex-app-server' as const, useExistingLogin: true, hostAccessAcknowledged: true as const }
    await d.page.evaluate(input => window.boai.request('testLaunchProfileDraft', input), input)
    profile = await d.page.evaluate(input => window.boai.request('saveLaunchProfile', input), input)
  }
  s.agent = await d.page.evaluate(({ profile, connection }) => window.boai.request('saveAgent', { name: '文件修改验收员工', role: '按用户标注修改并交付文件', instructions: '读取明确引用的原文件，只修改用户要求的内容，保留其他内容和格式。使用现有 BOAI 工具发布真实交付；成果修订遵守宿主的 revisionRequestId。', connectionId: connection?.id ?? '', modelId: connection?.defaultModel ?? '', ...(profile ? { executionBackend: { kind: 'codex-local' as const, profileId: profile.id }, nativeOptions: { codexSandbox: 'workspace-write' as const, codexApprovalPolicy: 'on-request' as const } } : {}), color: '#3478ce', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }), { profile, connection })
  s.chat = await d.page.evaluate(id => window.boai.request('createConversation', { kind: 'direct', title: '文件修改验收', agentIds: [id] }), s.agent.id)
  const path = join(await realpath(d.root), `计划.${format}`); await writeFile(path, format === 'docx' ? DOCX : ORIGINAL)
  await d.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^文件修改验收/ }).click()
  await nextMaterialDialog(d, { path })
  await d.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await d.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(d.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
  s.material = (await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat.id)).materials![0]
  await d.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('收到这份原始计划后简短确认即可，等我下一条要求再修改和交付文件。')
  await d.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => { const detail = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.chat!.id); return detail.runs.length > 0 && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)) }, { timeout: 120000 }).toBe(true)
  await d.reviewFile('原始计划输入', path)
}
Given('文件修改验收准备真实 {string} 员工和计划附件', async ({ runtime, fileEdit }, backend: string) => prepareFileEmployee(runtime, fileEdit, backend))
Given('文件修改验收准备真实本机员工和Word附件', async ({ runtime, fileEdit }) => prepareFileEmployee(runtime, fileEdit, 'codex', 'docx'))
When('用户在附件预览标注日期并要求员工改为十一月八日', async ({ runtime: d, fileEdit: s }) => {
  await d.page.locator('.messages').getByRole('button', { name: /计划.md/ }).click()
  const view = d.page.locator(`[data-material-preview-id="${s.material!.id}"]:visible`)
  await selectDate(view)
  await sendAndWait(d, s, 1, '请修改引用的计划文件：仅把选中行的截止日期从 2026-11-01 改为 2026-11-08，其余文字、段落和换行保持。交付修改后的计划.md 文件，不要只回复修改说明。')
})
Then('员工交付修改后的真实计划且原附件保持', async ({ runtime: d, fileEdit: s }) => {
  s.first = s.detail!.artifacts[0] as ArtifactVersion
  expect(await readFile(s.first.path, 'utf8')).toBe(ORIGINAL.replace('2026-11-01', '2026-11-08'))
  expect(await readFile(join(s.dataPath!, 'materials', s.chat!.id, s.material!.id, 'original'), 'utf8')).toBe(ORIGINAL)
  await d.reviewFile('第一次真实修改交付', s.first.path)
})
When('用户在成果预览标注日期并要求改为十一月十五日', async ({ runtime: d, fileEdit: s }) => {
  await d.page.getByRole('button', { name: `查看修改结果：${s.first!.name}`, exact: true }).click()
  await selectDate(d.page.locator(`[data-artifact-id="${s.first!.id}"]:visible`))
  await sendAndWait(d, s, 2, '请修订这份固定版本计划：仅把选中行的截止日期从 2026-11-08 改为 2026-11-15，其余文字、段落和换行保持。按此次修订请求交付新版本文件。')
})
Then('员工交付第二版且第一版与其他段落保持', async ({ runtime: d, fileEdit: s }) => {
  s.second = s.detail!.artifacts.find(artifact => artifact.previousArtifactId === s.first!.id) as ArtifactVersion
  expect(s.second).toBeDefined(); expect(s.second.contentVersion).toBe(2)
  expect(await readFile(s.second.path, 'utf8')).toBe(ORIGINAL.replace('2026-11-01', '2026-11-15'))
  expect(await readFile(s.first!.path, 'utf8')).toBe(ORIGINAL.replace('2026-11-01', '2026-11-08'))
  await d.reviewFile('第二次真实修改交付', s.second.path); await d.reviewCheckpoint('员工完成标注修改后的聊天')
})

When('用户在Word预览标注第二段并让员工修改', async ({ runtime: d, fileEdit: s }) => {
  await d.page.locator('.messages').getByRole('button', { name: /计划.docx/ }).click()
  const view = d.page.locator(`[data-material-preview-id="${s.material!.id}"]:visible`)
  await expect(view).toContainText('Revenue increased across all regions.')
  await selectPreviewText(view.getByText('Revenue increased across all regions.', { exact: true }))
  await sendAndWait(d, s, 1, '修改引用的 Word 文件：只把第二段 Revenue increased across all regions. 改成 Revenue increased by 12% across all regions.，保持标题、其他内容和页面格式。交付有效的计划.docx 文件。')
})
Then('真实Word新文件可以预览且原文件和页面格式保持', async ({ runtime: d, fileEdit: s }) => {
  const artifact = s.detail!.artifacts[0] as ArtifactVersion
  const original = unzipSync(DOCX), revised = unzipSync(await readFile(artifact.path))
  const facts = async (xml: string) => d.page.evaluate(xml => {
    const document = new DOMParser().parseFromString(xml, 'application/xml'), ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid Word XML')
    return {
      paragraphs: Array.from(document.getElementsByTagNameNS(ns, 'p')).map(p => Array.from(p.getElementsByTagNameNS(ns, 't')).map(t => t.textContent).join('')),
      page: ['pgSz', 'pgMar'].map(name => Array.from(document.getElementsByTagNameNS(ns, name)).map(e => Object.fromEntries(Array.from(e.attributes).map(a => [a.localName, a.value]).sort())))
    }
  }, xml)
  const before = await facts(strFromU8(original['word/document.xml'])), after = await facts(strFromU8(revised['word/document.xml']))
  expect(after.paragraphs).toEqual(['Quarterly report', 'Revenue increased by 12% across all regions.'])
  expect(after.page).toEqual(before.page)
  expect(await readFile(join(s.dataPath!, 'materials', s.chat!.id, s.material!.id, 'original'))).toEqual(DOCX)
  await d.reviewFile('真实Word修改交付', artifact.path)
  await d.page.locator(`#message-${artifact.sourceMessageId}`).getByRole('button', { name: `打开 ${artifact.name}`, exact: true }).click()
  await expect(d.page.locator(`[data-artifact-id="${artifact.id}"]:visible`)).toContainText('Revenue increased by 12% across all regions.')
  await d.reviewCheckpoint('真实Word修改后的Lody预览')
})
