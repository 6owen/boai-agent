/*
 * [INPUT]: 隔离Desktop、既有材料协议、停止应用后的明确历史种子与生产文件选择/准备/发送API。
 * [OUTPUT]: 核心/自动化长历史预置样本，全部可预览扩展名的真实已发送原件、同名独立材料、草稿/未发布反例；读取/预览仍经过生产宿主。
 * [OUTPUT]: 附件草稿与文件清单共用CRC和解压像素均正确的最小PNG原件，不降低产品图像校验或实际解码断言。
 * [POS]: WV-T01/T05/T09状态与文件范围支撑，预置历史不冒充真实员工执行。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AutomationOccurrence, Conversation, Message } from '../../../src/shared/domain'
import type { ConversationMaterial } from '../../../src/shared/domain/materials'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { Desktop } from './desktop'
import { nextMaterialDialog, prepareMaterialsDesktop } from './materials'

export const workViewPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')

export async function prepareWorkViewHistory(runtime: Desktop, kind: '核心' | '自动化') {
  const fixture = await prepareMaterialsDesktop(runtime), core = kind === '核心', id = core ? 'work-view-core-history' : 'work-view-automation-history'
  const conversation: Conversation = { ...fixture.direct, id, title: `${kind}工作视图长历史`, purpose: core ? 'core' : 'automation', agentIds: core ? ['bobo'] : ['researcher'], workspacePath: join(dirname(fixture.direct.workspacePath), id), ...(core ? {} : { automationId: 'work-view-history-plan', occurrenceId: 'work-view-history-occurrence' }) }
  await runtime.close(); await mkdir(conversation.workspacePath, { recursive: true })
  const store = new ProductStore(join(fixture.dataPath, 'boai.sqlite')); await store.init()
  const messages: Message[] = Array.from({ length: 180 }, (_, index) => ({ id: `${id}-message-${index + 1}`, conversationId: id, senderType: 'agent', senderId: conversation.agentIds[0], senderName: core ? 'bobo' : '研究员', content: `第 ${index + 1} 条原历史。\n工作视图切换应保持原消息位置。`, sequence: index + 1, status: 'completed', createdAt: new Date(Date.UTC(2026, 8, 30) + index * 1000).toISOString() }))
  try {
    await store.write([{ collection: 'conversations', id, value: conversation }, ...messages.map(value => ({ collection: 'messages', id: value.id, value }))])
    if (!core) {
      const occurrence: AutomationOccurrence = { id: conversation.occurrenceId!, schemaVersion: 1, stateVersion: 1, automationId: conversation.automationId!, name: '工作视图历史计划', source: 'manual', conversationId: id, status: 'completed', deliveryStatus: 'unknown', scheduledFor: conversation.createdAt, startedAt: conversation.createdAt, finishedAt: conversation.createdAt, runIds: [], resultMessageIds: [], usageIncomplete: true }
      await store.write([{ collection: 'automationOccurrences', id: occurrence.id, value: occurrence }])
    }
  } finally { await store.close() }
  await runtime.start()
  return { ...fixture, conversation, messages }
}

export async function prepareViewMaterial(runtime: Desktop, conversationId: string, path: string): Promise<ConversationMaterial> {
  await nextMaterialDialog(runtime, { path })
  const selection = await runtime.page.evaluate(() => window.boai.request('chooseMaterialSource', undefined))
  if (!selection) throw new Error('真实原生文件选择未返回授权身份')
  const material = await runtime.page.evaluate(({ conversationId, selectionId }) => window.boai.request('prepareMaterial', { conversationId, selectionId, requestId: crypto.randomUUID() }), { conversationId, selectionId: selection.id })
  if (material.status !== 'ready') throw new Error(material.error ?? '预览原件准备失败')
  return material
}

export interface PreviewSample { name: string; path: string; kind: 'markdown' | 'code' | 'text' | 'image' | 'unsupported'; text?: string; language?: string; material: ConversationMaterial }
const codeExtensions = 'ts tsx mts cts js jsx mjs cjs json jsonc py pyi css scss less html htm svg xml vue svelte yaml yml toml ini conf sh bash zsh fish sql go rs java kt kts c h cpp cc hpp cs rb php swift r lua pl dart diff patch graphql gql cmake tex log csv env'.split(' ')
const languageOf = (extension: string) => ({ ts: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python', pyi: 'python', htm: 'html', svg: 'xml', yml: 'yaml', conf: 'ini', sh: 'bash', zsh: 'bash', rs: 'rust', kt: 'kotlin', kts: 'kotlin', h: 'c', cc: 'cpp', hpp: 'cpp', cs: 'csharp', rb: 'ruby', pl: 'perl', patch: 'diff', gql: 'graphql', tex: 'latex', env: 'dotenv' } as Record<string, string>)[extension] ?? extension
export async function prepareWorkViewFormats(runtime: Desktop) {
  const fixture = await prepareMaterialsDesktop(runtime), sourceRoot = join(await realpath(runtime.root), 'work-view-format-sources'); await mkdir(sourceRoot)
  // This fixture tests real sending/preview, not employee execution. Offline employees still accept attachments.
  await runtime.page.evaluate(async () => {
    for (const agent of (await window.boai.request('snapshot', undefined)).agents.filter(value => ['researcher', 'writer'].includes(value.id))) {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, active: false, expectedConfigVersion: configVersion })
    }
  })
  const definitions: Omit<PreviewSample, 'material'>[] = []
  const add = async (name: string, content: string | Buffer, kind: PreviewSample['kind'], language?: string, directory = sourceRoot) => {
    await mkdir(directory, { recursive: true }); const path = join(directory, name); await writeFile(path, content)
    definitions.push({ name, path, kind, language, ...(typeof content === 'string' ? { text: content } : {}) })
  }
  for (const extension of codeExtensions) {
    const text = extension === 'html' || extension === 'htm' ? '<h1>WV_HTML_SOURCE</h1>\n<script>window.__boaiWorkPreviewExecuted=true</script>\n<iframe src="https://example.invalid/wv-preview"></iframe>\n' : extension === 'svg' ? '<svg onload="window.__boaiWorkPreviewExecuted=true"><image href="https://example.invalid/wv-preview"/><text>WV_SVG_SOURCE</text></svg>\n' : `WV_FORMAT_${extension}\nconst sample = 42\n`
    await add(`预览样本.${extension}`, text, 'code', languageOf(extension))
  }
  for (const [name, language] of [['Dockerfile', 'dockerfile'], ['Makefile', 'makefile'], ['.env.local', 'dotenv']]) await add(name, `WV_FORMAT_${language}\nVALUE=42\n`, 'code', language)
  for (const extension of ['md', 'markdown', 'mdown', 'mkd']) await add(`预览文档.${extension}`, '# WV_MARKDOWN_HEADING\n\n**正文加粗**\n\n![remote](https://example.invalid/wv-preview)\n\n<script>window.__boaiWorkPreviewExecuted=true</script>\n', 'markdown')
  await add('纯文本.txt', 'WV_PLAIN_TEXT\n第二行保留行号\n', 'text')
  await add('未知扩展.custom', 'WV_UNKNOWN_UTF8\n未知扩展按真实文本显示\n', 'text')
  await add('报告.md', '# SAME_NAME_FIRST\n独立原件甲\n', 'markdown', undefined, join(sourceRoot, 'first'))
  await add('报告.md', '# SAME_NAME_SECOND\n独立原件乙\n', 'markdown', undefined, join(sourceRoot, 'second'))
  await add('图片.png', workViewPng, 'image')
  await add('二进制.bin', Buffer.from([0, 1, 2, 3]), 'unsupported')
  const samples: PreviewSample[] = []
  for (const definition of definitions) samples.push({ ...definition, material: await prepareViewMaterial(runtime, fixture.group.id, definition.path) })
  for (let index = 0; index < samples.length; index += 3) {
    const materialSelections = samples.slice(index, index + 3).map(value => ({ id: value.material.id, revision: value.material.revision }))
    await runtime.page.evaluate(({ conversationId, materialSelections, index }) => window.boai.request('sendMessage', { conversationId, materialSelections, content: `已发送预览原件 ${index + 1}`, mentionIds: [], requestId: `wv-format-send-${index}` }), { conversationId: fixture.group.id, materialSelections, index })
  }
  const draftPath = join(sourceRoot, '未发送草稿.txt'); await writeFile(draftPath, 'WV_UNSENT_MATERIAL')
  const draft = await prepareViewMaterial(runtime, fixture.group.id, draftPath)
  const unpublishedPath = join(fixture.group.workspacePath, '尚未发布.txt'); await writeFile(unpublishedPath, 'WV_UNPUBLISHED_PRIVATE_FILE')
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), fixture.group.id)
  for (const sample of samples) sample.material = detail.materials!.find(value => value.id === sample.material.id)!
  return { ...fixture, samples, draft, unpublishedPath }
}
