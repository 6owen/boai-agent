/*
 * [INPUT]: Electron、共享领域类型与 IPC 合同、宿主服务。
 * [OUTPUT]: 桌面窗口、持久化界面缩放、会话列表管理等 IPC 路由与运行进程生命周期。
 * [POS]: src/main/main.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { decodeImage } from './decode-image'
import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess, nativeTheme, protocol, Notification, Menu } from 'electron'
import type { UtilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, stat, rm, readFile, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AppearanceStore } from './appearance'
import { resolveTheme, zoomFactors } from '../shared/appearance'
import type { Methods } from '../shared/ipc'
import { CredentialVault } from './vault'
import { prepareV2DataRoot } from './migration'
import type { Method, RpcResponse } from '../shared/ipc'
import type { Snapshot } from '../shared/domain'

protocol.registerSchemesAsPrivileged([{ scheme: 'boai-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.setName('BoAI Agent')
if (process.env.BOAI_DATA_DIR) app.setPath('userData', resolve(process.env.BOAI_DATA_DIR))
const legacyDataPath = app.getPath('userData')
const dataPath = join(legacyDataPath, 'v2')
let window: BrowserWindow | null = null
let runtime: UtilityProcess | null = null
let ready: Promise<void> | null = null
let quitting = false
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
const selectedPaths = new Set<string>()
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
const methods = new Set<Method>(['listExternalFiles', 'publishExternalArtifact', 'listAutomations', 'saveAutomation', 'pauseAutomation', 'deleteAutomation', 'runAutomation', 'stopAutomation', 'listLaunchProfiles', 'saveLaunchProfile', 'testLaunchProfile', 'sendExternalTask', 'getAppearance', 'updateAppearance', 'importAppearanceBackground', 'removeAppearanceBackground', 'resetAppearance', 'snapshot', 'saveAgent', 'saveConnection', 'deleteConnection', 'testConnection', 'createConversation', 'updateConversationList', 'getConversation', 'sendMessage', 'cancelRun', 'approve', 'importResource', 'removeResource', 'retryRun', 'getAgentHome', 'readAgentFile', 'saveAgentFile', 'regenerateAgentViews', 'getMemory', 'saveMemory', 'deleteMemory', 'clearMemory', 'choosePath', 'openPath', 'exportBackup', 'setUnsavedChanges'])

function sendEvent(event: unknown) {
  if (window && !window.isDestroyed()) window.webContents.send('boai:event', event)
}

function startRuntime() {
  if (ready) return ready
  ready = new Promise<void>((resolveReady, rejectReady) => {
    // Only carry platform essentials into the worker. Model credentials arrive through the vault.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|USER|SHELL|LANG|LC_.*|TMPDIR|TEMP|TMP|SystemRoot|APPDATA|LOCALAPPDATA|USERPROFILE)$/i.test(key)))
    const child = utilityProcess.fork(join(__dirname, '../runtime/worker.mjs'), [dataPath], {
      serviceName: 'BoAI Agent Runtime', stdio: 'pipe', env,
    })
    runtime = child
    const timer = setTimeout(() => { rejectReady(new Error('本地运行服务启动超时。')); child.kill() }, 90_000)
    child.on('message', async (message) => {
      if (message?.type === 'ready') { clearTimeout(timer); resolveReady(); return }
      if (message?.type === 'stopped') { stopped?.(); return }
      if (message?.type === 'response') {
        const response = message.response as RpcResponse
        const request = pending.get(response.id)
        if (!request) return
        clearTimeout(request.timer)
        pending.delete(response.id)
        if (response.error) request.reject(new Error(response.error))
        else request.resolve(response.result)
      } else if (message?.type === 'event') {sendEvent(message.event);if(message.event?.type==='automation:notice'&&Notification.isSupported()){const occurrence=message.event.occurrence;const notice=new Notification({title:'BoAI 定时任务',body:occurrence.status==='completed'?'任务已完成，点击查看结果。':'任务状态已更新，点击查看记录。'});notice.on('click',()=>{void(async()=>{if(!window||window.isDestroyed())await createWindow();window?.show();window?.focus();sendEvent({type:'focus-conversation',conversationId:occurrence.conversationId})})()});notice.show()}}

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
      runtime = null
      ready = null
      stopped?.()
      const error = new Error(`本地运行服务已退出（${code}），下一次操作会重新启动。`)
      rejectReady(error)
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error) }
      pending.clear()
      if (!quitting) sendEvent({ type: 'runtime-error', error: error.message })
    })
  })
  return ready
}

async function requestRuntime(method: string, input?: unknown) {
  await startRuntime()
  return new Promise<unknown>((resolveRequest, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('操作超时，请查看任务状态。')) }, 120_000)
    pending.set(id, { resolve: resolveRequest, reject, timer })
    runtime!.postMessage({ type: 'request', request: { id, method, input } })
  })
}

function inside(root: string, target: string) {
  const path = relative(root, target)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

async function openResource(input: unknown) {
  if (!input || typeof (input as { path?: unknown }).path !== 'string') throw new Error('无效文件路径。')
  const target = await realpath((input as { path: string }).path)
  const snapshot = await requestRuntime('snapshot') as Snapshot
  const roots = await Promise.all([...snapshot.conversations.map((c) => c.workspacePath), ...snapshot.resources.map((r) => r.path), ...snapshot.agents.map(a => join(dataPath, 'agents', a.id, 'workspace')), ...snapshot.agents.map(a => join(dataPath,'external-workspaces',a.id))].map((p) => realpath(p).catch(() => '')))
  const info = await stat(target)
  const dataRoot = await realpath(dataPath)
  if (!(info.isDirectory() && target === dataRoot) && !roots.some((root) => root && inside(root, target))) throw new Error('只能打开当前工作区或已导入的资源。')
  const safeExtensions = new Set(['.md', '.txt', '.markdown', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.csv', '.json', '.xlsx', '.docx', '.pptx', '.svg', '.log'])
  if (!info.isDirectory() && !safeExtensions.has(extname(target).toLowerCase())) {
    shell.showItemInFolder(target)
    return
  }
  const error = await shell.openPath(target)
  if (error) throw new Error(error)
}

function registerIpc() {
  ipcMain.on('boai:appearance-initial', event => { if (window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame) event.returnValue = appearance.snapshot() })
  ipcMain.handle('boai:request', async (event, payload: { method: Method; input: unknown }) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的请求来源。')
    if (!payload || !methods.has(payload.method) || JSON.stringify(payload).length > 2_000_000) throw new Error('无效请求。')
    const { method, input } = payload
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
    if (method === 'openPath') return openResource(input)
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
    void startRuntime().catch((error) => sendEvent({ type: 'runtime-error', error: error.message }))
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
  }).catch((error) => { dialog.showErrorBox('BoAI Agent 启动失败', error.message); app.quit() })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.on('before-quit', (event) => {
    if (!quitting && hasUnsavedChanges()) { event.preventDefault(); void confirmDiscard(() => app.quit()); return }
    if (quitting || !runtime) return
    event.preventDefault()
    quitting = true
    const child = runtime
    const timeout = setTimeout(() => { child.kill(); app.quit() }, 8_000)
    stopped = () => { clearTimeout(timeout); child.kill(); app.quit() }
    child.postMessage({ type: 'shutdown' })
  })
}
