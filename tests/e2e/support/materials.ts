/*
 * [INPUT]: 场景独立 Desktop、真实本机文本文件、共享 Mastra 兼容 HTTP fixture 与生产原生 IPC。
 * [OUTPUT]: 同名异内容/严格文本失败材料、一次原生对话框替换和真实本机 File 拖入观测、伪造公开授权请求拒绝、真实准备/消息提交后丢回复与只读回执故障观测；资源随场景回收。
 * [POS]: D1 材料桌面验收支撑；文件路径只交给原生选择端，不进入公开 prepareMaterial 输入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
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
interface SendReplyState { sends: SendInput[]; lookups: string[]; committedMessages: Message[]; lostReplies: number; unavailableLookups: number; lookupUnavailable: boolean }
interface NativeDrop { path: string; selectionId: string; name: string }
type MaterialGlobals = typeof globalThis & { __boaiMaterialReplyFault: ReplyState; __boaiMaterialSendReplyFault: SendReplyState; __boaiMaterialNativeDrops: NativeDrop[] }

export async function prepareMaterialsDesktop(runtime: Desktop) {
  const endpoint = await teamEndpoint((body, response) => {
    const messages = body.messages as { role: string; content: string }[]
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
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
  }
  const files = { first: join(sources, 'first', '报告.md'), second: join(sources, 'second', '报告.md'), valid: join(sources, '有效材料.txt'), encoding: join(sources, '坏编码.txt'), large: join(sources, '超限.txt'), unsupported: join(sources, '不支持.pdf') }
  await Promise.all([
    writeFile(files.first, texts.first), writeFile(files.second, texts.second), writeFile(files.valid, texts.valid),
    writeFile(files.encoding, Buffer.from([0xff, 0xfe, 0x00, 0x61])), writeFile(files.large, Buffer.alloc(MATERIAL_LIMITS.bytes + 1, 'a')), writeFile(files.unsupported, '%PDF-1.4\nfixture'),
  ])
  await runtime.start()
  const setup = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '材料离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'materials-fixture' })
    const snapshot = await window.boai.request('snapshot', undefined)
    for (const agent of snapshot.agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, name: agent.id === 'researcher' ? '研究员' : '写手', connectionId: connection.id, modelId: `materials-${agent.id}`, allowCommands: false, expectedConfigVersion: configVersion })
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
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
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

/** Preserve real sendMessage association/round/model execution and lose only its committed IPC reply. */
export async function materialSendReplyFault(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    const state: SendReplyState = { sends: [], lookups: [], committedMessages: [], lostReplies: 0, unavailableLookups: 0, lookupUnavailable: true }
    Object.assign(globalThis, { __boaiMaterialSendReplyFault: state })
    let loseReply = true
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'sendMessage') state.sends.push(structuredClone(payload.input))
      if (payload.method === 'getMessageReceipt') state.lookups.push(payload.input.requestId)
      const result = await original(event, payload)
      if (payload.method === 'sendMessage') {
        state.committedMessages.push(structuredClone(result as Message))
        if (loseReply) { loseReply = false; state.lostReplies++; throw new Error('验收：材料消息已提交，但回复丢失') }
      }
      if (payload.method === 'getMessageReceipt' && state.lookupUnavailable) { state.unavailableLookups++; throw new Error('验收：消息回执暂不可读') }
      return result
    })
  })
  return {
    inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as MaterialGlobals).__boaiMaterialSendReplyFault)),
    allowLookup: () => runtime.app.evaluate(() => { (globalThis as MaterialGlobals).__boaiMaterialSendReplyFault.lookupUnavailable = false }),
  }
}
