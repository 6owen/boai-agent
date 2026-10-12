/*
 * [OUTPUT]: 文件打开可选reveal动作，完成同一realpath/受管根校验后在文件夹定位；默认外开和扩展名规则保持。
 * [OUTPUT]: 2026-10-11 原生执行IPC白名单与原宿主处理接线；参数/生命周期仍归运行服务。
 * [OUTPUT]: 2026-10-10 放行已验证本机模型目录、员工有界执行清单和固定运行详情IPC；不新增执行或路径读取授权。
 * [OUTPUT]: 扫描候选按真实程序身份预填，无外部执行；未接入程序不生成可运行配置。
 * [OUTPUT]: 按已保存ID删除本机启动配置通过既有typed白名单，不接外部程序或登录目录清理参数。
 * [OUTPUT]: 目录登录预填与新草稿来源重核携明确ACP/原生Codex协议；旧ACP导入保持，不运行程序。
 * [OUTPUT]: 已保存启动项ID的当前程序只读状态列入typed白名单，零外部执行。
 * [OUTPUT]: 放行工作/文件只读有界查询和精确原目标解析，沿唯一runtime请求桥。
 * [OUTPUT]: 聊天附件准备缺省按当前聊天发送，短期来源失效仅核对原发送范围与稳定回执；旧显式名单只保留兼容。
 * [INPUT]: Electron、共享领域/IPC 合同、材料原生选择/拖入/真实粘贴与宿主服务及技能库保存请求。
 * [OUTPUT]: 有界截图/文件来源 token、Finder 多文件复制引用；临时副本持久归属/hash、启动回收旧来源并等待实际准备退出后清理，来源过期先只读核对原回执。
 * [OUTPUT]: bobo 组织结果/明确恢复 IPC 沿既有私有窗口白名单。
 * [OUTPUT]: 单一 runtime 内置浏览器桥、全局固定窗口与独立工具调用审计、实际动作开始回执、旧连接退出门禁、窗口局部事件与实际 Chromium 退出后应用退出。
 * [OUTPUT]: D6 无正文会话元信息白名单；D6 有界个人历史/搜索/精确来源复核、阅读观测及独立锚点白名单，沿唯一类型化请求通道。
 * [OUTPUT]: 放行只读待处理分页/来源、原问题补充和显式本人固定版成果验收资格/回执；放行本机发现 ID 的单技能准备、原子员工绑定和只读请求回执；不暴露任意路径绑定。
 * [OUTPUT]: 放行固定 hash 成果预览、独立修订/采用及只读采用回执 IPC；仅原生选取的材料来源 token、严格 prepareMaterial 公共输入及材料/消息核对接口；放行员工删除和真实群解散 IPC；放行核心助手新会话/团队需求受理 IPC；T1.3 批量创建/原子安装与显式恢复； 放行个人资料保存与只读活动查询；放行日程草稿提取、创建回执和显式恢复 IPC；T1.2 生成/取消与可编辑方案； 放行团队草稿 IPC； 放行持久消息表情回应 IPC；扫描来源 API 草稿测试复用宿主密钥重读/校验，不先保存连接；放行通讯录分类与排序偏好 IPC；ACP 扫描候选只读预填、保存/测试前重核扫描来源与草稿测试 IPC；本机技能目录/详情/预览 IPC 与精确 SKILL.md 编辑/定位；真实拖入目录/ZIP 的来源授权；持久通知串行领取/提交/失败回执及窗口重载后精确导航；放行纯日程预览与分页历史 IPC；放行按 occurrence 明确补充信息的 IPC；原生选择并授权技能目录/ZIP，自动化通知区分运行结束与交付，放行 Skills 管理/更新/清理重试和只读会话 Trace 查询；本地配置扫描/目录选择/宿主密钥导入及 Codex 登录的 ACP 启动项导入、桌面窗口、持久化界面缩放、编辑时读取密钥/模型目录/草稿连接测试、区分未知方法的 IPC 路由与运行进程生命周期。
 *           放行核心首发按请求身份只读核对，响应失联不重发创建。
 * [OUTPUT]: 同hash材料显式重新核对及ACP原任务受理回执白名单。
 * [POS]: src/main/main.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { AutomationNotificationConsumer } from './automation-notifications'
import { BrowserService } from './browser/browser-service'
import type { BrowserHostMethods, BrowserLease } from '../shared/ipc/browser'
import type { AutomationNotice } from '../shared/domain/automations'
import { z } from 'zod'
import { LocalConfigDiscovery } from './local-configs/discovery'
import { decodeImage } from './decode-image'
import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess, nativeTheme, protocol, Notification, Menu, clipboard } from 'electron'
import type { UtilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, stat, rm, readFile, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AppearanceStore } from './appearance'
import { resolveTheme, zoomFactors } from '../shared/appearance'
import { unsupportedRequestMessage, type Methods } from '../shared/ipc'
import { CredentialVault } from './vault'
import { prepareV2DataRoot } from './migration'
import type { Method, RpcResponse } from '../shared/ipc'
import type { Snapshot } from '../shared/domain'
import { MATERIAL_LIMITS } from '../shared/domain/materials'
import { MaterialSources } from './material-sources'
import { readClipboardMaterialPaths } from './clipboard-material-files'

protocol.registerSchemesAsPrivileged([{ scheme: 'boai-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.setName('BoAI Agent')
if (process.env.BOAI_DATA_DIR) app.setPath('userData', resolve(process.env.BOAI_DATA_DIR))
const legacyDataPath = app.getPath('userData')
const dataPath = join(legacyDataPath, 'v2')
let window: BrowserWindow | null = null
let runtime: UtilityProcess | null = null
let pendingAutomationNavigation: Methods['getPendingAutomationNavigation']['output'] = null
let ready: Promise<void> | null = null
let quitting = false
let quitApproved = false
let stopped: (() => void) | null = null
const dirtySources = new Set<string>()
const hasUnsavedChanges = () => dirtySources.size > 0
let confirmingClose = false
let appearanceFlushed:(()=>void)|undefined
const vault = new CredentialVault(join(dataPath, 'credentials.enc.json'))
const appearance = new AppearanceStore(join(dataPath, 'appearance'), () => nativeTheme.shouldUseDarkColors, value => {
  nativeTheme.themeSource = value.preferences.mode
  if (window && !window.isDestroyed()) window.webContents.setZoomFactor(value.preferences.zoomFactor)
  sendEvent({ type: 'appearance:changed', appearance: appearance.snapshot() })
}, decodeImage)
const localConfigs = new LocalConfigDiscovery()
const selectedPaths = new Set<string>()
const materialSources = new MaterialSources(join(dataPath, 'material-sources'), error => sendEvent({ type: 'runtime-error', error: `临时附件清理失败：${String(error)}` }))
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout> }>()
let browserConnectionDrain: Promise<void> = Promise.resolve()
const browsers = new BrowserService({
  rendererDirectory: join(__dirname, '../renderer'),
  preloadPath: join(__dirname, 'browser-toolbar-preload.cjs'),
  developmentUrl: process.env.BOAI_RENDERER_URL,
  profileRegistryPath: join(legacyDataPath, 'browser', 'profile-scopes.json'),
  managedDataDirectory: dataPath,
  onStateChanged: () => sendEvent({ type: 'browser:changed' }),
  onUserControl: async ({ action, lease }) => {
    if (quitting || !runtime) throw new Error('任务运行服务已退出，浏览器不会自动续行。')
    if (action === 'stop') {
      if (!lease) throw new Error('当前浏览器没有正在执行的员工任务。')
      await requestRuntime('cancelRun', { conversationId: lease.conversationId, workId: lease.workId })
    } else await requestRuntime('browserControl', { action })
  },
})
const methods = new Set<Method>(['scanLocalConnections', 'importLocalConnection', 'importLocalAgent', 'prepareLocalAgent', 'prepareDetectedLocalAgent', 'testLaunchProfileDraft', 'listExternalFiles', 'publishExternalArtifact', 'listAutomations', 'listAutomationHistory', 'getAutomationOccurrence', 'getPendingAutomationNavigation', 'saveAutomation', 'previewAutomation', 'pauseAutomation', 'deleteAutomation', 'runAutomation', 'stopAutomation', 'replyAutomation', 'listLaunchProfiles', 'getLaunchProfileStatus', 'saveLaunchProfile', 'deleteLaunchProfile', 'testLaunchProfile', 'sendExternalTask', 'getAppearance', 'updateAppearance', 'importAppearanceBackground', 'removeAppearanceBackground', 'resetAppearance', 'snapshot', 'saveAgent', 'saveConnection', 'getConnectionApiKey', 'deleteConnection', 'testConnection', 'testConnectionDraft', 'listConnectionModels', 'createConversation', 'updateConversationList', 'clearConversationHistory', 'getConversation', 'getConversationTrace', 'sendMessage', 'cancelRun', 'approve', 'importResource', 'removeResource', 'retryRun', 'getAgentHome', 'readAgentFile', 'saveAgentFile', 'regenerateAgentViews', 'getMemory', 'saveMemory', 'deleteMemory', 'clearMemory', 'choosePath', 'openPath', 'exportBackup', 'setUnsavedChanges'])
for (const method of ['listExecutionHistory', 'listExecutionWindow', 'listExecutionEvidence', 'getExecutionContent', 'listNativeActions', 'respondNativeAction', 'stopNativeExecution'] as const) methods.add(method)
for (const method of ['listBoboCollaborationOperations', 'getBoboCollaborationOperation', 'resumeBoboCollaboration', 'abandonBoboCollaboration', 'resumeBoboCollaborationStart'] as const) methods.add(method)
for (const method of ['listLocalSkills', 'getLocalSkillDetail', 'scanLocalSkill', 'openLocalSkill', 'chooseSkillSource', 'cancelSkillScan', 'discardSkillScan', 'getSkillPreview', 'readSkillPreviewFile', 'listSkillOperations', 'listSkillInstallations', 'listSkillMarketplace', 'getSkillMarketplaceDetail', 'refreshSkillMarketplace', 'getSkillDetail', 'readSkillFile', 'getSkillCollections', 'updateSkillCollections', 'scanSkillSource', 'installSkills', 'getSkillOperation', 'cancelSkillOperation'] as const) methods.add(method)
for (const method of ['checkSkillUpdate', 'listSkillUpdateChecks', 'updateSkill'] as const) methods.add(method)
for (const method of ['checkAllSkillUpdates', 'getSkillUpdateBatch', 'cancelSkillUpdateBatch'] as const) methods.add(method)
for (const method of ['planSkillLibraryExport', 'discardSkillLibraryExport', 'cancelSkillLibraryPreview', 'exportSkillLibrary'] as const) methods.add(method)
for (const method of ['listResourceCleanups', 'retryResourceCleanup'] as const) methods.add(method)
for (const method of ['acceptTeamCreation', 'getTeamCreation', 'resumeTeamCreation', 'generateTeamPlan', 'cancelTeamGeneration', 'openTeamDraft', 'saveTeamDraft', 'getTeamDraft', 'abandonTeamDraft', 'listTeamCreationRecovery'] as const) methods.add(method)
for (const method of ['getContactList', 'updateContactList'] as const) methods.add(method)
methods.add('testLocalConnection')
for (const method of ['generateAutomationDraft', 'getAutomationCreation', 'resumeAutomation'] as const) methods.add(method)
methods.add('setMessageReaction')
methods.add('updateUserProfile')
methods.add('getProfileActivity')
for (const method of ['listEmployeeExecutions', 'getEmployeeExecution', 'listLaunchProfileModels'] as const) methods.add(method)
methods.add('startCoreConversation')
methods.add('getCoreConversationStart')
methods.add('deleteAgent')
methods.add('deleteConversation')
methods.add('getBrowserWindows')
methods.add('openBrowser')
methods.add('browserControl')
for (const method of ['chooseMaterialSource', 'prepareMaterial', 'getMaterialPreparation', 'getMaterialPreview', 'recheckMaterial', 'discardMaterial', 'setMaterialAuthorization', 'getMessageReceipt', 'getExternalTaskReceipt'] as const) methods.add(method)
for (const method of ['getArtifactPreview', 'reviseArtifact', 'adoptArtifact', 'getArtifactAdoptionReceipt'] as const) methods.add(method)
for (const method of ['prepareLocalSkillBinding', 'bindLocalSkill', 'getSkillBindingReceipt'] as const) methods.add(method)
for (const method of ['listInbox', 'getInboxItem', 'replyInboxQuestion', 'requestArtifactAcceptance', 'getArtifactAcceptanceReceipt'] as const) methods.add(method)
for (const method of ['listConversationMessages', 'searchConversations', 'resolveConversationSearchTarget', 'getConversationReading', 'observeConversationReading', 'saveConversationAnchor', 'getConversationView', 'getConversationMetadata'] as const) methods.add(method)
for (const method of ['queryWorkViews', 'queryConversationFiles', 'resolveWorkViewTarget', 'resolveConversationFileTarget'] as const) methods.add(method)

function sendEvent(event: unknown) {
  if (window && !window.isDestroyed()) window.webContents.send('boai:event', event)
}

const automationNotifications = new AutomationNotificationConsumer({
  take: () => quitting ? Promise.resolve(null) : requestRuntime('__takeAutomationNotice') as Promise<AutomationNotice | null>,
  settle: async receipt => { if (quitting || !runtime) throw new Error('运行服务已退出，通知提交状态未知'); await requestRuntime('__settleAutomationNotice', receipt) },
  error: error => sendEvent({ type: 'runtime-error', error: `通知回执保存失败：${String(error)}` }),
  submit: (record, failed) => {
    if (!Notification.isSupported()) throw new Error('此设备不支持系统通知，结果仍保存在应用内')
    const notice = new Notification({ title: 'BoAI 定时任务', body: record.kind === 'attention' ? '本次运行需要处理，点击查看记录。' : '本次运行已有结果，点击查看记录。' })
    notice.on('failed', (_event, error) => failed(error))
    notice.on('click', () => { pendingAutomationNavigation = { automationId: record.automationId, occurrenceId: record.occurrenceId, conversationId: record.conversationId, messageId: record.messageId }; void (async () => {
      if (!window || window.isDestroyed()) await createWindow()
      window?.show(); window?.focus()
      sendEvent({ type: 'automation:navigate' })
    })().catch(error => sendEvent({ type: 'runtime-error', error: String(error) })) })
    notice.show()
  },
})
function flushAutomationNotifications() { void automationNotifications.flush().catch(error => sendEvent({ type: 'runtime-error', error: `通知提交状态未能保存：${String(error)}` })) }

function startRuntime() {
  if (ready) return ready
  ready = browserConnectionDrain.then(() => new Promise<void>((resolveReady, rejectReady) => {
    // Only carry platform essentials into the worker. Model credentials arrive through the vault.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|USER|SHELL|LANG|LC_.*|TMPDIR|TEMP|TMP|SystemRoot|APPDATA|LOCALAPPDATA|USERPROFILE)$/i.test(key)))
    const child = utilityProcess.fork(join(__dirname, '../runtime/worker.mjs'), [dataPath], {
      serviceName: 'BoAI Agent Runtime', stdio: 'pipe', env: { ...env, BOAI_NATIVE_PROCESS_GUARD: join(__dirname,'../native/boai-process-guard').replace('app.asar/','app.asar.unpacked/') },
    })
    runtime = child
    const timer = setTimeout(() => { rejectReady(new Error('本地运行服务启动超时。')); child.kill() }, 90_000)
    child.on('message', async (message) => {
      if (runtime !== child) return
      if (message?.type === 'ready') { clearTimeout(timer); resolveReady(); flushAutomationNotifications(); return }
      if (message?.type === 'stopped') { stopped?.(); return }
      if (message?.type === 'response') {
        const response = message.response as RpcResponse
        const request = pending.get(response.id)
        if (!request) return
        clearTimeout(request.timer)
        pending.delete(response.id)
        if (response.error) request.reject(new Error(response.error))
        else request.resolve(response.result)
      } else if (message?.type === 'event') { if (message.event?.type === 'automation:notice') flushAutomationNotifications(); else sendEvent(message.event) }

      else if (message?.type === 'browser-host') {
        try {
          if (quitting && (message.method === 'acquire' || message.method === 'executeSingle')) throw new Error('应用正在退出，浏览器不再受理新动作。')
          const result = await handleBrowserHostRequest(child, message.method, message.input)
          if (runtime === child) child.postMessage({ type: 'browser-host-result', id: message.id, result })
        } catch (error) {
          if (runtime === child) child.postMessage({ type: 'browser-host-result', id: message.id, error: error instanceof Error ? error.message : '浏览器操作结果未知，请核对原动作。' })
        }
      }
      else if (message?.type === 'secret') {
        try {
          if (typeof message.key !== 'string' || message.key.length > 200) throw new Error('无效凭据标识。')
          let value: string | undefined
          if (message.operation === 'get') value = await vault.get(message.key)
          else if (message.operation === 'set' && typeof message.value === 'string') await vault.set(message.key, message.value)
          else if (message.operation === 'delete') await vault.delete(message.key)
          else throw new Error('无效凭据操作。')
          child.postMessage({ type: 'secret-result', id: message.id, value })
        } catch (error) {
          child.postMessage({ type: 'secret-result', id: message.id, error: error instanceof Error ? error.message : '凭据操作失败。' })
        }
      }
    })
    child.stderr?.on('data', (chunk) => { if (!app.isPackaged) process.stderr.write(chunk) })
    child.stdout?.on('data', (chunk) => { if (!app.isPackaged) process.stdout.write(chunk) })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (runtime !== child) return
      // Replacing the connection cannot issue a new lease until old actions really exit.
      browserConnectionDrain = browsers.disconnectAll().catch(error => { sendEvent({ type: 'runtime-error', error: String(error) }); throw error })
      void browserConnectionDrain.catch(() => {})
      runtime = null
      ready = null
      stopped?.()
      const error = new Error(`本地运行服务已退出（${code}），下一次操作会重新启动。`)
      rejectReady(error)
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error) }
      pending.clear()
      if (!quitting) sendEvent({ type: 'runtime-error', error: error.message })
    })
  }))
  return ready
}

async function handleBrowserHostRequest(child: UtilityProcess, method: keyof BrowserHostMethods, input: unknown): Promise<unknown> {
  await browserConnectionDrain
  if (runtime !== child) throw new Error('浏览器原运行连接已失效。')
  switch (method) {
    case 'manualOpen': return browsers.manualOpen(input as BrowserHostMethods['manualOpen']['input'])
    case 'currentLease': return browsers.currentLease()
    case 'acquire': return browsers.acquire(input as BrowserLease)
    case 'inspect': return browsers.inspect(input as BrowserLease)
    case 'resumeSnapshot': return browsers.resumeSnapshot(input as BrowserLease)
    case 'executeSingle': {
      const value = input as BrowserHostMethods['executeSingle']['input']
      return browsers.executeSingle(value, async () => {
        if (runtime !== child || quitting) throw new Error('浏览器动作尚未开始，原连接已经退出。')
        await requestRuntime('__startBrowserAction', { actionId: value.actionId, generation: value.lease.generation, runId: value.lease.runId, workId: value.lease.workId })
      })
    }
    case 'lookup': return browsers.lookup(input as BrowserHostMethods['lookup']['input'])
    case 'drain': await browsers.drain(input as BrowserLease); return { drained: true }
    case 'clearScope': await browsers.clearScope(input as BrowserHostMethods['clearScope']['input']); return { cleared: true }
    case 'list': return browsers.list()
    case 'userControl': return browsers.userControl(input as BrowserHostMethods['userControl']['input'])
    case 'disconnect': return browsers.disconnectAll()
    default: throw new Error('未知浏览器宿主操作。')
  }
}

async function requestRuntime(method: string, input?: unknown, waitForCompletion = false) {
  await startRuntime()
  return new Promise<unknown>((resolveRequest, reject) => {
    const id = randomUUID()
    // Temporary input files must remain until the importer responds or its worker really exits.
    const timer = waitForCompletion ? undefined : setTimeout(() => { pending.delete(id); reject(new Error('操作超时，请查看任务状态。')) }, 120_000)
    pending.set(id, { resolve: resolveRequest, reject, timer })
    try { runtime!.postMessage({ type: 'request', request: { id, method, input } }) }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
  })
}

function inside(root: string, target: string) {
  const path = relative(root, target)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

async function openResource(input: unknown) {
  const value = z.object({ path: z.string().min(1), action: z.enum(['open', 'reveal']).optional() }).strict().parse(input)
  const target = await realpath(value.path)
  const snapshot = await requestRuntime('snapshot') as Snapshot
  const roots = await Promise.all([...snapshot.conversations.map((c) => c.workspacePath), ...snapshot.resources.map((r) => r.path), ...snapshot.agents.map(a => join(dataPath, 'agents', a.id, 'workspace')), ...snapshot.agents.map(a => join(dataPath,'external-workspaces',a.id))].map((p) => realpath(p).catch(() => '')))
  const info = await stat(target)
  const dataRoot = await realpath(dataPath)
  if (!(info.isDirectory() && target === dataRoot) && !roots.some((root) => root && inside(root, target))) throw new Error('只能打开当前工作区或已导入的资源。')
  const safeExtensions = new Set(['.md', '.txt', '.markdown', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.csv', '.json', '.xlsx', '.docx', '.pptx', '.svg', '.log'])
  if (value.action === 'reveal' || !info.isDirectory() && !safeExtensions.has(extname(target).toLowerCase())) {
    shell.showItemInFolder(target)
    return
  }
  const error = await shell.openPath(target)
  if (error) throw new Error(error)
}

function registerIpc() {
  ipcMain.on('boai:appearance-initial', event => { if (window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame) event.returnValue = appearance.snapshot() })
  ipcMain.handle('boai:material-file', async (event, input: unknown) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的请求来源。')
    const value = z.union([
      z.object({ path: z.string().min(1).max(8000) }).strict(),
      z.object({ name: z.string().min(1).max(200), bytes: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= MATERIAL_LIMITS.attachmentBytes, '附件大小不能超过 20 MiB') }).strict(),
    ]).parse(input)
    return 'path' in value ? materialSources.selectPath(value.path) : materialSources.selectBytes(value.name, value.bytes)
  })
  ipcMain.handle('boai:clipboard-material-files', async (event) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的请求来源。')
    const paths = await readClipboardMaterialPaths(clipboard)
    return Promise.all(paths.map(path => materialSources.selectPath(path)))
  })
  ipcMain.handle('boai:skill-file', async (event, input: unknown) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的请求来源。')
    const value = z.object({ path: z.string().min(1).max(8000), kind: z.enum(['folder', 'zip']) }).strict().parse(input)
    if (!isAbsolute(value.path)) throw new Error('无法读取拖入文件的本地路径')
    const selected = await realpath(value.path), info = await stat(selected)
    if (value.kind === 'folder' ? !info.isDirectory() : !info.isFile() || extname(selected).toLowerCase() !== '.zip') throw new Error(value.kind === 'folder' ? '请拖入技能文件夹' : '请拖入 ZIP 文件')
    selectedPaths.add(selected)
    return selected
  })
  ipcMain.handle('boai:request', async (event, payload: { method: Method; input: unknown }) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的请求来源。')
    if (!payload || typeof payload.method !== 'string' || JSON.stringify(payload).length > 2_000_000) throw new Error('无效请求。')
    if (!methods.has(payload.method)) throw new Error(unsupportedRequestMessage)
    const { method, input } = payload
    if (method === 'chooseMaterialSource') {
      z.undefined().parse(input)
      const selection = await dialog.showOpenDialog(window, { title: '添加聊天材料', properties: ['openFile'] })
      return selection.canceled || !selection.filePaths[0] ? null : materialSources.selectPath(selection.filePaths[0])
    }
    if (method === 'prepareMaterial') {
      const value = z.object({ conversationId: z.string().min(1).max(200), selectionId: z.string().uuid(), requestId: z.string().min(1).max(200), authorizedAgentIds: z.array(z.string().min(1).max(200)).max(12).optional() }).strict().parse(input)
      const { selectionId: _, ...request } = value
      if (!materialSources.has(value.selectionId)) {
        const prior = await requestRuntime('getMaterialPreparation', { requestId: value.requestId }) as Methods['getMaterialPreparation']['output']
        if (!prior) throw new Error('原请求尚未受理，请重新选择文件')
        const sameDelivery = value.authorizedAgentIds === undefined ? prior.deliveryScope === 'conversation' : prior.deliveryScope === undefined && JSON.stringify([...prior.authorizedAgentIds].sort()) === JSON.stringify([...new Set(value.authorizedAgentIds)].sort())
        if (prior.conversationId !== value.conversationId || !sameDelivery) throw new Error('原准备请求的聊天或发送范围不一致')
        return prior
      }
      return materialSources.prepare(value.selectionId, (source, temporary) => requestRuntime('prepareMaterial', { ...request, ...source }, temporary))
    }
    if (method === 'getPendingAutomationNavigation') { z.undefined().parse(input); const target = pendingAutomationNavigation; pendingAutomationNavigation = null; return target }
    if (method === 'scanLocalConnections') {
      const options = z.object({ chooseDirectory: z.boolean().optional() }).strict().parse(input)
      if (!options.chooseDirectory) return localConfigs.scan()
      const selection = await dialog.showOpenDialog(window, { title: '选择本地 Agent 配置目录', properties: ['openDirectory', 'showHiddenFiles'] })
      if (selection.canceled || !selection.filePaths[0]) return null
      return localConfigs.scan({ directory: await realpath(selection.filePaths[0]) })
    }
    if (method === 'importLocalConnection' || method === 'testLocalConnection') {
      const selected = z.object({ configId: z.string().regex(/^[a-f0-9]{64}$/), model: z.string().trim().min(1).max(300).optional() }).strict().parse(input)
      return requestRuntime(method === 'testLocalConnection' ? 'testConnectionDraft' : 'saveConnection', localConfigs.connection(selected.configId, selected.model))
    }
    if (method === 'saveLaunchProfile' || method === 'testLaunchProfileDraft') {
      const source = z.object({ id: z.string().optional(), localConfigId: z.string().regex(/^[a-f0-9]{64}$/).optional(), protocol: z.enum(['acp', 'codex-app-server', 'claude-cli']).optional() }).passthrough().parse(input)
      if (!source.id && source.localConfigId) {
        if (source.protocol === 'claude-cli') throw new Error('Claude程序配置不接受Codex登录来源')
        localConfigs.launchProfile(source.localConfigId, source.protocol)
      }
    }
    if (method === 'prepareDetectedLocalAgent') {
      const selected = z.object({ candidateId: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input)
      const { hostAccessAcknowledged: _, ...draft } = localConfigs.detectedProfile(selected.candidateId)
      return draft
    }
    if (method === 'prepareLocalAgent') {
      const selected = z.object({ configId: z.string().regex(/^[a-f0-9]{64}$/), protocol: z.enum(['acp', 'codex-app-server']).optional() }).strict().parse(input)
      const { hostAccessAcknowledged: _, ...draft } = localConfigs.launchProfile(selected.configId, selected.protocol)
      return draft
    }
    if (method === 'importLocalAgent') {
      const selected = z.object({ configId: z.string().regex(/^[a-f0-9]{64}$/), hostAccessAcknowledged: z.literal(true) }).strict().parse(input)
      return requestRuntime('saveLaunchProfile', localConfigs.launchProfile(selected.configId))
    }
    if (method === 'getAppearance') return appearance.snapshot()
    if (method === 'updateAppearance') { const value=input as Methods['updateAppearance']['input']; if(!Number.isSafeInteger(value?.expectedRevision))throw new Error('无效外观版本'); return appearance.update(value.patch,value.expectedRevision) }
    if (method === 'removeAppearanceBackground') return appearance.remove()
    if (method === 'resetAppearance') return appearance.reset()
    if (method === 'importAppearanceBackground') { const result=await dialog.showOpenDialog(window,{title:'选择背景图片',properties:['openFile'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp']}]}); return result.canceled||!result.filePaths[0]?null:appearance.import(result.filePaths[0]) }
    if (method === 'setUnsavedChanges') {
      if (typeof (input as { dirty?: unknown })?.dirty !== 'boolean') throw new Error('无效编辑状态')
      const source=(input as {source?:string}).source??'business'; if(!['business','appearance'].includes(source))throw new Error('无效编辑来源'); if((input as {dirty:boolean}).dirty)dirtySources.add(source);else{dirtySources.delete(source);if(source==='appearance')appearanceFlushed?.()}
      return
    }
    if (method === 'openLocalSkill') {
      const value = z.object({ id: z.string().min(1).max(200), action: z.enum(['edit', 'reveal']) }).strict().parse(input)
      const detail = await requestRuntime('getLocalSkillDetail', { id: value.id }) as Methods['getLocalSkillDetail']['output']
      const file = detail.filePath
      if (value.action === 'reveal') shell.showItemInFolder(file)
      else { const error = await shell.openPath(file); if (error) throw new Error(error) }
      return
    }
    if (method === 'chooseSkillSource') {
      const { kind } = z.object({ kind: z.enum(['folder', 'zip']) }).strict().parse(input)
      const result = await dialog.showOpenDialog(window, { title: kind === 'folder' ? '选择技能目录' : '选择技能 ZIP', properties: [kind === 'folder' ? 'openDirectory' : 'openFile'], ...(kind === 'zip' ? { filters: [{ name: '技能压缩包', extensions: ['zip'] }] } : {}) })
      if (result.canceled || !result.filePaths[0]) return null
      const selected = await realpath(result.filePaths[0]); selectedPaths.add(selected); return selected
    }
    if (method === 'choosePath') {
      const kind = (input as { kind?: string })?.kind
      if (kind !== 'skill' && kind !== 'knowledge') throw new Error('无效资源类型。')
      const result = await dialog.showOpenDialog(window, {
        title: kind === 'skill' ? '选择包含 SKILL.md 的技能目录' : '导入知识文档',
        properties: [kind === 'skill' ? 'openDirectory' : 'openFile'],
        ...(kind === 'knowledge' ? { filters: [{ name: '文本文档', extensions: ['md', 'txt', 'markdown'] }] } : {}),
      })
      const selected = result.filePaths[0]
      if (result.canceled || !selected) return null
      selectedPaths.add(await realpath(selected))
      return selected
    }
    if (method === 'importResource') {
      const candidate = (input as { path?: unknown })?.path
      if (typeof candidate !== 'string' || !selectedPaths.has(await realpath(candidate))) throw new Error('请先通过文件选择器选择资源。')
    }
    if (method === 'scanSkillSource') {
      const candidate = input as Methods['scanSkillSource']['input'] | undefined
      if (!candidate?.kind || candidate.kind === 'folder' || candidate.kind === 'zip') {
        if (typeof candidate?.source !== 'string' || !selectedPaths.has(await realpath(candidate.source))) throw new Error('请先通过文件选择器选择技能目录或 ZIP。')
      }
    }
    if (method === 'openPath') return openResource(input)
    if (method === 'exportSkillLibrary') {
      const value = z.object({ planId: z.string().min(1).max(200), requestId: z.string().min(1).max(200) }).strict().parse(input)
      const result = await dialog.showSaveDialog(window, { title: '保存技能库 ZIP', defaultPath: `boai-skills-${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: '技能库', extensions: ['zip'] }] })
      if (result.canceled || !result.filePath) return null
      return requestRuntime('__exportSkillLibrary', { input: value, destination: result.filePath })
    }
    if (method === 'exportBackup') {
      const result = await dialog.showOpenDialog(window, { title: '选择备份保存位置', properties: ['openDirectory', 'createDirectory'] })
      if (result.canceled || !result.filePaths[0]) return null
      const destination = join(result.filePaths[0], `boai-agent-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`)
      if (inside(await realpath(dataPath), resolve(destination))) throw new Error('请在应用数据目录之外保存备份。')
      try {
        await appearance.coordinatedBackup(destination,()=>requestRuntime('__backup', { destination }))
        const manifest=JSON.parse(await readFile(join(destination,'backup.json'),'utf8'));manifest.appearanceIncluded=true;manifest.automationRestorePolicy='paused';await writeFile(join(destination,'backup.json'),JSON.stringify(manifest,null,2))
      } catch(error){await rm(destination,{recursive:true,force:true});throw error}
      return destination
    }
    return requestRuntime(method, input)
  })
}

let zoomQueue = Promise.resolve()
function changeZoom(direction: -1 | 0 | 1) {
  zoomQueue = zoomQueue.then(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { preferences, revision } = appearance.snapshot(), current = preferences.zoomFactor
      const zoomFactor = direction === 0 ? 1 : direction > 0 ? zoomFactors.find(value => value > current) ?? 1.5 : [...zoomFactors].reverse().find(value => value < current) ?? 0.75
      try { await appearance.update({ zoomFactor }, revision); return }
      catch (error) { if (attempt || !String(error).includes('APPEARANCE_CONFLICT')) throw error }
    }
  }).catch(error => dialog.showErrorBox('界面缩放保存失败', error instanceof Error ? error.message : String(error)))
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' }, { role: 'editMenu' },
    { label: '视图', submenu: [
      ...(!app.isPackaged ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }, { type: 'separator' as const }] : []),
      { label: '实际大小', accelerator: 'CmdOrCtrl+0', click: () => changeZoom(0) },
      { label: '放大', accelerator: 'CmdOrCtrl+Plus', click: () => changeZoom(1) },
      { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => changeZoom(-1) },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { role: 'windowMenu' },
  ]))
}

async function createWindow() {
  dirtySources.clear()
  window = new BrowserWindow({
    width: 1340, height: 900, minWidth: 760, minHeight: 640, title: 'BoAI Agent',
    backgroundColor: resolveTheme(appearance.snapshot().resolvedMode, appearance.snapshot().resolvedThemeId).background, titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 18 },
    show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, zoomFactor: appearance.snapshot().preferences.zoomFactor },
  })
  window.once('ready-to-show', () => window?.show())
  window.on('close', event => {
    if (!quitting && hasUnsavedChanges()) { event.preventDefault(); void confirmDiscard(() => window?.close()) }
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('did-finish-load', () => window?.webContents.setZoomFactor(appearance.snapshot().preferences.zoomFactor))
  window.webContents.on('zoom-changed', (_event, direction) => changeZoom(direction === 'in' ? 1 : -1))
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  if (!app.isPackaged && process.env.BOAI_RENDERER_URL) {
    const url = new URL(process.env.BOAI_RENDERER_URL)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('开发页面必须来自本机。')
    await window.loadURL(url.href)
  } else await window.loadURL(pathToFileURL(join(__dirname, '../renderer/index.html')).href)
}

async function confirmDiscard(continueClose: () => void) {
  if (confirmingClose || !window) return
  confirmingClose = true
  try {
    if(dirtySources.has('appearance'))await new Promise<void>(resolve=>{const timeout=setTimeout(()=>{appearanceFlushed=undefined;resolve()},3000);appearanceFlushed=()=>{clearTimeout(timeout);appearanceFlushed=undefined;resolve()};sendEvent({type:'appearance:flush'})})
    if(!hasUnsavedChanges()){continueClose();return}
    const result = await dialog.showMessageBox(window, { type: 'question', title: '有未保存的修改', message: '仍有修改尚未保存', detail: dirtySources.has('appearance')?'外观保存未完成。可以返回重试保存，或放弃尚未保存的外观并关闭。':'可以返回继续编辑，或放弃修改并关闭。', buttons: ['继续编辑', '放弃修改并关闭'], defaultId: 0, cancelId: 0, noLink: true })
    if (result.response === 1) { dirtySources.clear(); continueClose() }
  } finally { confirmingClose = false }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { window?.restore(); window?.focus() })
  app.whenReady().then(async () => {
    await prepareV2DataRoot(legacyDataPath)
    await appearance.init()
    nativeTheme.themeSource=appearance.snapshot().preferences.mode
    nativeTheme.on('updated',()=>appearance.systemChanged())
    protocol.handle('boai-asset',async request=>{try{const url=new URL(request.url);if(url.hostname!=='appearance'||url.search||url.hash)throw new Error('无效路径');const asset=await appearance.asset(decodeURIComponent(url.pathname.slice(1)));return new Response(new Uint8Array(asset.bytes),{headers:{'Content-Type':asset.type,'Cache-Control':'no-store'}})}catch{return new Response('Not found',{status:404})}})
    registerIpc()
    installMenu()
    await createWindow()
    await materialSources.recover()
    void startRuntime().catch((error) => sendEvent({ type: 'runtime-error', error: error.message }))
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
  }).catch((error) => { dialog.showErrorBox('BoAI Agent 启动失败', error.message); app.quit() })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.on('before-quit', (event) => {
    if (quitApproved) return
    if (!quitting && hasUnsavedChanges()) { event.preventDefault(); void confirmDiscard(() => app.quit()); return }
    event.preventDefault()
    if (quitting) return
    quitting = true
    const child = runtime
    const runtimeExit = child ? new Promise<void>(resolveExit => {
      const timeout = setTimeout(() => child.kill(), 8_000)
      stopped = () => { clearTimeout(timeout); child.kill(); resolveExit() }
      child.postMessage({ type: 'shutdown' })
    }) : Promise.resolve()
    // A timeout may terminate the worker, but never counts as Chromium action exit.
    void Promise.all([runtimeExit, browsers.shutdown(), materialSources.close()]).then(() => { quitApproved = true; app.quit() }).catch(error => {
      quitting = false
      dialog.showErrorBox('浏览器尚未退出', error instanceof Error ? error.message : String(error))
    })
  })
}
