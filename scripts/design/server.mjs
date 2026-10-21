/*
 * [INPUT]: 经验证的真实Excalidraw stdio服务、独立数据目录及SDK HTTP MCP。
 * [OUTPUT]: 外部开发编辑器/明确选区/模型局部修改；关闭后拒绝迟到更新，排空调用/落盘并核对启动PID退出。
 * [POS]: 第22组Agent通用开发宿主；客户端经MCP接入，不进入BOAI产品。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createServer } from 'node:http'
import { randomUUID, createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { acquireResourceLock } from '../resource-lock.mjs'
import { verifyUpstream } from './upstream.mjs'
import { adaptResource, editorHTML, panelHTML } from './browser.mjs'
import { closeDesignResources, createDesignActivity, DesignStdioTransport } from './lifecycle.mjs'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const contextTool = { name: 'get_editor_context', description: 'Read the explicit selection/diagram reference sent from the external editor. Check editorConnected, document identity and revision; a disconnected or stale reference is not the current selection. Does not inject text into an agent chat.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value })
const failure = error => ({ ...result({ error: String(error.message ?? error) }), isError: true })
async function jsonFile(path, value) {
  const temp = path + '.' + randomUUID() + '.tmp'
  try { await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); await rename(temp, path) }
  finally { await rm(temp, { force: true }) }
}
export async function designPath(root, value, writing = false) {
  if (typeof value !== 'string' || !value.startsWith('ai-docs/design/') || value.includes('\\') || value.includes('\0') || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('设计文件必须使用ai-docs/design内的规范相对路径')
  let absolute = root
  for (const part of value.split('/')) {
    absolute = join(absolute, part)
    const stat = await lstat(absolute).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (stat?.isSymbolicLink()) throw new Error('设计路径不能经过符号链接')
  }
  if (writing) await mkdir(join(absolute, '..'), { recursive: true })
  return absolute
}
export async function startDesignServer(options) {
  const root = await realpath(options.root), receipt = await verifyUpstream(root)
  const directory = join(root, '.local/design'); await mkdir(directory, { recursive: true })
  const release = acquireResourceLock(join(directory, 'server-lock.sqlite'))
  const owner = randomUUID(), prefix = '/session/' + randomUUID(), events = new Set(), sessions = new Set()
  let client, transport, http, closePromise, stopping = false, origin, html, persistQueue = Promise.resolve()
  const activity = createDesignActivity()
  const sessionClosures = new Map()
  const closeSession = server => {
    if (!sessionClosures.has(server)) {
      const pending = Promise.resolve().then(() => server.close()).finally(() => { sessions.delete(server); sessionClosures.delete(server) })
      sessionClosures.set(server, pending)
    }
    return sessionClosures.get(server)
  }
  let state = { bootstrap: { toolInput: null, toolOutput: null, widgetState: null }, active: null, reference: null, sequence: 0 }
  const statePath = join(directory, 'editor-state.json'), infoPath = join(directory, 'server.json')
  const persist = () => {
    activity.assertOpen()
    const snapshot = structuredClone(state)
    const pending = persistQueue.then(() => jsonFile(statePath, snapshot)); persistQueue = pending.catch(() => {})
    return pending
  }
  const close = () => {
    if (closePromise) return closePromise
    stopping = true
    activity.stop()
    closePromise = closeDesignResources({
      events, sessions: [...sessions].map(server => ({ close: () => closeSession(server) })), http, client, transport, pid: transport?.startedPid,
      drainOperations: activity.drain, drainPersistence: () => persistQueue,
      removeInfo: async () => {
        const info = JSON.parse(await readFile(infoPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return '{}'; throw error }))
        if (info.owner === owner) await rm(infoPath, { force: true })
      }, release,
    })
    return closePromise
  }
  try {
    try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    transport = new DesignStdioTransport({ command: process.execPath, args: [join(receipt.plugin, 'dist/server.mjs')], cwd: root, env: { ...process.env, ZCODE_WORKSPACE_ROOT: root, ZCODE_WORKSPACE_IDENTITY: root, ZCODE_PLUGIN_DATA: join(directory, 'data') }, stderr: 'pipe' })
    transport.stderr?.on('data', chunk => process.stderr.write(chunk))
    client = new Client({ name: 'boai-developer-editor', version: '1' })
    await client.connect(transport)
    html = await readFile(join(receipt.plugin, 'dist/ui/panel.html'), 'utf8')
    const nativeTools = (await client.listTools()).tools
    const nativeByName = new Map(nativeTools.map(tool => [tool.name, tool]))
    const modelTools = nativeTools.filter(tool => tool._meta?.ui?.visibility?.includes('model')).map(tool => {
      const { _meta, ...definition } = tool
      if (['export_diagram', 'save_image'].includes(tool.name)) definition.description += ' Developer host exports only NEW files under ai-docs/design; overwrite is refused. Use an explicit revision filename.'
      return definition
    })
    const modelNames = new Set(modelTools.map(tool => tool.name))
    const call = (input, fromEditor, signal) => activity.run(async () => {
      const { name, arguments: args = {} } = input
      if (!nativeByName.has(name) || (!fromEditor && !modelNames.has(name))) throw new Error('此工具不在当前开发端能力范围')
      if (name === 'open_diagram' && args.path) await designPath(root, args.path)
      if (['export_diagram', 'save_image'].includes(name)) {
        if (args.overwrite === true) throw new Error('保留已有设计文件，请导出新修订文件；宿主不会覆盖仓库外改或已有设计')
        await designPath(root, args.path, true)
      }
      activity.assertOpen()
      const output = await client.callTool(input, undefined, { signal })
      activity.assertOpen()
      if (output.isError) return output
      if (output.structuredContent?.path) {
        const path = await designPath(root, args.path)
        output.structuredContent.fileSha256 = sha256(await readFile(path))
        output.content = [{ type: 'text', text: JSON.stringify(output.structuredContent) }]
      }
      activity.assertOpen()
      if (output.structuredContent?.document && !fromEditor) {
        state.bootstrap.toolInput = args; state.bootstrap.toolOutput = output.structuredContent
        await persist()
        activity.assertOpen()
        const event = 'data: ' + JSON.stringify({ input: args, output: output.structuredContent }) + '\n\n'
        for (const stream of events) stream.write(event)
      }
      return output
    })
    const context = () => activity.run(async () => {
      const reference = state.reference?.structuredContent ?? null, active = state.active?.structuredContent ?? null
      let scene = null, stale = false
      if (reference?.documentId) {
        const read = await client.callTool({ name: 'read_scene', arguments: { id: reference.documentId, elementIds: reference.elementIds } })
        activity.assertOpen()
        if (read.isError) return read
        scene = read.structuredContent
        stale = reference.documentId !== active?.documentId || reference.revision !== scene.document.revision
      }
      return result({ editorConnected: events.size > 0, active, reference, stale, scene, sequence: state.sequence })
    })
    const createMCP = () => {
      const server = new Server({ name: 'boai-excalidraw-developer', version: '1' }, { capabilities: { tools: {}, resources: {} }, instructions: 'External developer editor only. Click Reference in the editor, then explicitly call get_editor_context. Native client MCP Apps rendering and automatic prompt injection are not provided. Export saved revisions to NEW ai-docs/design files before implementing code.' })
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...modelTools, contextTool] }))
      server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        try { return request.params.name === contextTool.name ? await context() : await call(request.params, false, extra.signal) } catch (error) { return failure(error) }
      })
      server.setRequestHandler(ListResourcesRequestSchema, request => client.listResources(request.params))
      server.setRequestHandler(ListResourceTemplatesRequestSchema, request => client.listResourceTemplates(request.params))
      server.setRequestHandler(ReadResourceRequestSchema, request => client.readResource(request.params))
      return server
    }
    const json = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)) }
    http = createServer(async (request, response) => {
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer')
      try {
        if (stopping) return json(response, 503, { error: '开发宿主正在关闭' })
        if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) return json(response, 403, { error: '仅允许当前本机同源开发会话' })
        const path = new URL(request.url, origin).pathname
        if (!path.startsWith(prefix + '/')) return json(response, 404, { error: '会话不存在' })
        let body
        if (request.method === 'POST') {
          if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { error: '需要JSON请求' })
          let size = 0; const chunks = []
          for await (const chunk of request) { size += chunk.length; if (size > 24 * 1024 * 1024) throw new Error('请求超过开发桥大小限制'); chunks.push(chunk) }
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        }
        activity.assertOpen()
        if (path === prefix + '/mcp') {
          if (request.method !== 'POST') { response.writeHead(405).end(); return }
          const server = createMCP(), bridge = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
          sessions.add(server)
          response.once('close', () => { void closeSession(server).catch(error => process.stderr.write(`开发MCP会话关闭失败：${error.message}\n`)) })
          await server.connect(bridge); await bridge.handleRequest(request, response, body); return
        }
        if (request.method === 'GET' && path === prefix + '/') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(editorHTML(prefix)); return
        }
        if (request.method === 'GET' && path === prefix + '/panel') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(panelHTML(html, prefix, state.bootstrap)); return
        }
        if (request.method === 'GET' && path === prefix + '/events') {
          response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' }); response.write(': editor-connected\n\n')
          events.add(response); response.once('close', () => events.delete(response)); return
        }
        if (request.method === 'POST' && path === prefix + '/rpc') {
          const { method, args } = body
          if (method === 'callTool') return json(response, 200, await call(args, true))
          if (method === 'readResource') return json(response, 200, adaptResource(await client.readResource(args)))
          if (method === 'widgetState') { state.bootstrap.widgetState = args; await persist(); return json(response, 200, {}) }
          if (method === 'context') {
            const value = args?.structuredContent
            if (!['active-diagram', 'selection', 'diagram'].includes(value?.kind)) throw new Error('未知编辑器上下文')
            if (value.kind === 'active-diagram') state.active = args; else state.reference = args
            state.sequence++; await persist(); return json(response, 200, { sequence: state.sequence })
          }
          throw new Error('未知页面桥操作')
        }
        json(response, 404, { error: '端点不存在' })
      } catch (error) { if (!response.headersSent) json(response, 400, { error: String(error.message ?? error) }); else response.destroy(error) }
    })
    await new Promise((resolve, reject) => { http.once('error', reject); http.listen(options.port ?? 0, '127.0.0.1', resolve) })
    origin = `http://127.0.0.1:${http.address().port}`
    const info = { owner, pid: process.pid, root, editor: origin + prefix + '/', mcp: origin + prefix + '/mcp', upstreamCommit: receipt.commit }
    await jsonFile(infoPath, info)
    return { ...info, close, call: input => call(input, false), context }
  } catch (error) { await close(); throw error }
}
