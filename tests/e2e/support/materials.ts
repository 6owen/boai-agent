/*
 * [OUTPUT]: 第14组API群请求解释与持久顺序接续；保留独立并行、原Work和本机旧路径，实际验收归第14组05。
 * [OUTPUT]: 消息故障可定向阻断受理前或丢失受理后IPC回复，重启后仅观测原请求与回执。
 * [INPUT]: 场景独立 Desktop、真实本机文本文件、共享 Mastra 兼容 HTTP fixture 与生产原生 IPC。
 * [OUTPUT]: Markdown/TypeScript/HTML真实预览原件、通用PDF/超过20MiB夹具；同名来源/严格文本失败、原生File授权及准备/发送失联观测；资源随场景回收。
 * [OUTPUT]: 取证读取使用已有库只读连接，不执行启动迁移或使正文索引失效；真实移走/恢复同字节原件验证显式核对。
 * [OUTPUT]: 旧材料名单仅在应用停止后准备，可指定实际创建的员工；原消息和受管原件保持，不模拟旧版二进制升级。
 * [POS]: D1 材料桌面验收支撑；文件路径只交给原生选择端，不进入公开 prepareMaterial 输入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Desktop } from './desktop'
import { teamEndpoint, sendTeamOutput } from '../../fixtures/team-planner'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { MATERIAL_LIMITS, type ConversationMaterial } from '../../../src/shared/domain/materials'
import type { DiscussionTurn, Message } from '../../../src/shared/domain'
import type { Methods } from '../../../src/shared/ipc'

type PreparationInput = Methods['prepareMaterial']['input']
type SendInput = Methods['sendMessage']['input']
interface ReplyState { preparations: PreparationInput[]; lookups: string[]; committedIds: string[]; lostReplies: number; unavailableLookups: number; lookupUnavailable: boolean }
interface SendReplyState { rejectedBeforeAdmission: number; sends: SendInput[]; lookups: string[]; committedMessages: Message[]; lostReplies: number; unavailableLookups: number; lookupUnavailable: boolean }
interface NativeDrop { path: string; selectionId: string; name: string }
type MaterialGlobals = typeof globalThis & { __boaiMaterialReplyFault: ReplyState; __boaiMaterialSendReplyFault: SendReplyState; __boaiMaterialNativeDrops: NativeDrop[] }

export async function prepareMaterialsDesktop(runtime: Desktop) {
  const endpoint = await teamEndpoint((body, response) => {
    const messages = body.messages as { role: string; content: string }[]
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
    if (system.includes('Private group request interpretation')) { sendTeamOutput(response, { mode: 'independent' }); return }
      if (system.includes('Private participation decision')) {
      const data = JSON.parse(messages.at(-1)!.content).data
      sendTeamOutput(response, data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length ? { action: 'pass' } : { action: 'reply', responseKind: 'chat' })
    } else if (system.includes('Private memory maintenance')) sendTeamOutput(response, { candidates: [] })
    else {
      const text = messages.map(message => message.content).join('\n')
      const ids = [...new Set([...text.matchAll(/"materialId":"([0-9a-f-]{36})"/g)].map(match => match[1]))]
      sendTeamOutput(response, `已阅读获准材料。${ids.map(id => `来源 material:${id}:text-v1:L2`).join('\n')}`)
    }
  })
  runtime.trackServer(endpoint.server)
  const sources = join(await realpath(runtime.root), 'material-sources')
  await mkdir(join(sources, 'first'), { recursive: true }); await mkdir(join(sources, 'second'))
  const texts = {
    first: '# 同名材料甲\r\nFIRST_PRIVATE_TOKEN_A：只共享给研究员。\r\n第三行甲\r\n',
    second: '# 同名材料乙\nSECOND_SHARED_TOKEN_B：共享给两位员工。\n第三行乙\n',
    valid: '有效材料第一行\nVALID_DRAFT_TOKEN_C：应保留的原文。\n第三行\n',
    markdown: '# 可预览的聊天文档\n\n这里有 **加粗正文**。\n\n```typescript\nconst greeting: string = "CHAT_MARKDOWN_CODE"\n```\n\n<script>window.__boaiPreviewExecuted = true</script>\n',
    code: 'export const previewLabel: string = "CHAT_TYPESCRIPT_PREVIEW"\nconst literal = "<script>not executable</script>"\n',
    html: '<!doctype html>\n<html><body><h1>HTML_SOURCE_ONLY</h1><script>window.__boaiPreviewExecuted = true</script><iframe src="https://example.invalid/preview"></iframe></body></html>\n',
  }
  const files = { first: join(sources, 'first', '报告.md'), second: join(sources, 'second', '报告.md'), valid: join(sources, '有效材料.txt'), encoding: join(sources, '坏编码.txt'), large: join(sources, '超限.txt'), unsupported: join(sources, '通用资料.pdf'), oversized: join(sources, '超限文件.pdf'), markdown: join(sources, '预览说明.md'), code: join(sources, 'preview.ts'), html: join(sources, 'preview.html') }
  await Promise.all([
    writeFile(files.first, texts.first), writeFile(files.second, texts.second), writeFile(files.valid, texts.valid),
    writeFile(files.encoding, Buffer.from([0xff, 0xfe, 0x00, 0x61])), writeFile(files.large, Buffer.alloc(MATERIAL_LIMITS.bytes + 1, 'a')), writeFile(files.unsupported, '%PDF-1.4\nfixture'), writeFile(files.oversized, Buffer.alloc(MATERIAL_LIMITS.attachmentBytes + 1, 'x')),
    writeFile(files.markdown, texts.markdown), writeFile(files.code, texts.code), writeFile(files.html, texts.html),
  ])
  await runtime.start()
  const setup = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '材料离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'materials-fixture' })
    const snapshot = await window.boai.request('snapshot', undefined)
    for (const agent of snapshot.agents.filter(agent => ['researcher', 'writer', 'reviewer'].includes(agent.id))) {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, name: ({ researcher: '研究员', writer: '写手', reviewer: '审核员' } as Record<string, string>)[agent.id], connectionId: connection.id, modelId: `materials-${agent.id}`, allowCommands: false, expectedConfigVersion: configVersion })
    }
    const group = await window.boai.request('createConversation', { kind: 'group', title: '材料协作组', agentIds: ['researcher', 'writer'] })
    const direct = await window.boai.request('createConversation', { kind: 'direct', title: '材料私聊', agentIds: ['researcher'] })
    return { group, direct, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  }, endpoint.url)
  return { ...setup, endpoint, files, texts }
}

/** Restore the actual native dialog as soon as this one authorised choice is consumed. */
export async function nextMaterialDialog(runtime: Desktop, selection: { path: string } | { error: string }) {
  await runtime.app.evaluate(({ dialog }, selection) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = (async () => {
      dialog.showOpenDialog = original
      if ('error' in selection) throw new Error(selection.error)
      return { canceled: false, filePaths: [selection.path] }
    }) as typeof dialog.showOpenDialog
  }, selection)
}

/** Fault replies only after production IPC has committed; no importer or transaction is replaced. */
export async function materialReplyFault(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    const state: ReplyState = { preparations: [], lookups: [], committedIds: [], lostReplies: 0, unavailableLookups: 0, lookupUnavailable: true }
    Object.assign(globalThis, { __boaiMaterialReplyFault: state })
    let loseReply = true
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'prepareMaterial') state.preparations.push(structuredClone(payload.input))
      if (payload.method === 'getMaterialPreparation') state.lookups.push(payload.input.requestId)
      const result = await original(event, payload)
      if (payload.method === 'prepareMaterial') {
        state.committedIds.push((result as ConversationMaterial).id)
        if (loseReply) { loseReply = false; state.lostReplies++; throw new Error('验收：材料已准备，但回复丢失') }
      }
      if (payload.method === 'getMaterialPreparation' && state.lookupUnavailable) { state.unavailableLookups++; throw new Error('验收：材料回执暂不可读') }
      return result
    })
  })
  return {
    inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as MaterialGlobals).__boaiMaterialReplyFault)),
    allowLookup: () => runtime.app.evaluate(() => { (globalThis as MaterialGlobals).__boaiMaterialReplyFault.lookupUnavailable = false }),
  }
}

export async function materialRecords(dataPath: string) {
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  try {
    return {
      materials: await store.load<ConversationMaterial>('materials'), preparations: await store.load<{ id: string; materialId: string; conversationId: string; fingerprint: string }>('materialPreparations'),
      messages: await store.load<Message>('messages'), turns: await store.load<DiscussionTurn>('turns'),
      requests: await store.load<{ id: string; fingerprint: string; messageId: string }>('requests'),
      messageReceipts: await store.load<{ id: string; fingerprint: string; conversationId: string; messageId: string }>('messageReceipts'),
    }
  } finally { await store.close() }
}

export async function managedMaterialFiles(dataPath: string) {
  try { return (await readdir(join(dataPath, 'materials'), { recursive: true })).sort() }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
}
export const materialOriginal = (dataPath: string, material: ConversationMaterial) => readFile(join(dataPath, 'materials', material.conversationId, material.id, 'original'), 'utf8')

/** Change only the actual isolated original; production startup and preview detect its absence. */
export async function temporarilyRemoveMaterialOriginal(dataPath: string, material: ConversationMaterial) {
  const original = join(dataPath, 'materials', material.conversationId, material.id, 'original')
  const saved = `${original}.bdd-saved`
  await rename(original, saved)
  return async () => { await rename(saved, original) }
}

/** Use Chromium's real file input File, retaining Electron's native path metadata. Never construct File(bytes). */
export async function dropNativeMaterialFile(runtime: Desktop, path: string) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:material-file')!
    const drops: NativeDrop[] = []; Object.assign(globalThis, { __boaiMaterialNativeDrops: drops })
    ipcMain.removeHandler('boai:material-file')
    ipcMain.handle('boai:material-file', async (event, input) => {
      const result = await original(event, input) as { id: string; name: string }
      drops.push({ path: input.path, selectionId: result.id, name: result.name }); return result
    })
  })
  await runtime.page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.hidden = true; input.dataset.materialTestFile = 'native'; document.body.append(input) })
  try {
    await runtime.page.locator('input[data-material-test-file="native"]').setInputFiles(path)
    const file = await runtime.page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[data-material-test-file="native"]')!, file = input.files?.[0]
      if (!file) throw new Error('真实文件输入没有获得本机 File')
      const target = document.querySelector('.chat-panel .composer-wrap')
      if (!target) throw new Error('没有找到当前聊天材料拖入区域')
      const transfer = new DataTransfer(); transfer.items.add(file)
      for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
      return { name: file.name, size: file.size }
    })
    return { file, inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as MaterialGlobals).__boaiMaterialNativeDrops)) }
  } finally { await runtime.page.locator('input[data-material-test-file="native"]').evaluate(input => input.remove()) }
}

export async function forgedMaterialRequests(runtime: Desktop, conversationId: string, path: string) {
  return runtime.page.evaluate(async ({ conversationId, path }) => {
    const results: { accepted: boolean; error: string }[] = []
    const shared = { conversationId, authorizedAgentIds: ['researcher'] }
    for (const input of [{ ...shared, path, selectionId: crypto.randomUUID(), requestId: crypto.randomUUID() }, { ...shared, selectionId: crypto.randomUUID(), requestId: crypto.randomUUID() }]) {
      try { await window.boai.request('prepareMaterial', input as never); results.push({ accepted: true, error: '' }) }
      catch (error) { results.push({ accepted: false, error: error instanceof Error ? error.message : String(error) }) }
    }
    return results
  }, { conversationId, path })
}

/** Observe real sends; optionally reject before admission or lose only the committed IPC reply. */
export async function materialSendReplyFault(runtime: Desktop, mode: 'after' | 'before' | 'observe' = 'after') {
  await runtime.app.evaluate(({ ipcMain }, mode) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    const state: SendReplyState = { rejectedBeforeAdmission: 0, sends: [], lookups: [], committedMessages: [], lostReplies: 0, unavailableLookups: 0, lookupUnavailable: mode !== 'observe' }
    Object.assign(globalThis, { __boaiMaterialSendReplyFault: state })
    let loseReply = mode === 'after', rejectBefore = mode === 'before'
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'sendMessage') state.sends.push(structuredClone(payload.input))
      if (payload.method === 'getMessageReceipt') state.lookups.push(payload.input.requestId)
      if (payload.method === 'sendMessage' && rejectBefore) { rejectBefore = false; state.lookupUnavailable = true; state.rejectedBeforeAdmission++; throw new Error('验收：发送未进入宿主受理事务') }
      const result = await original(event, payload)
      if (payload.method === 'sendMessage') {
        state.committedMessages.push(structuredClone(result as Message))
        if (loseReply) { loseReply = false; state.lostReplies++; throw new Error('验收：材料消息已提交，但回复丢失') }
      }
      if (payload.method === 'getMessageReceipt' && state.lookupUnavailable) { state.unavailableLookups++; throw new Error('验收：消息回执暂不可读') }
      return result
    })
  }, mode)
  return {
    inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as MaterialGlobals).__boaiMaterialSendReplyFault)),
    allowLookup: () => runtime.app.evaluate(() => { (globalThis as MaterialGlobals).__boaiMaterialSendReplyFault.lookupUnavailable = false }),
  }
}

/** Prepare an old persisted explicit grant while the app is stopped; current UI never offers this setting. */
export async function legacyMaterialGrant(runtime: Desktop, dataPath: string, id: string, authorizedAgentIds = ['researcher']) {
  await runtime.close()
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  try {
    const material = (await store.load<ConversationMaterial>('materials')).find(value => value.id === id)!
    const { deliveryScope, ...legacy } = material
    await store.write([{ collection: 'materials', id, value: { ...legacy, authorizedAgentIds } }])
  } finally { await store.close() }
  await runtime.start()
}
