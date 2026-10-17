/*
 * [OUTPUT]: 连接测试保留原凭据断言，并核对新增callId/取消signal/路由观察上下文与草稿独立来源。
 * [INPUT]: 模型目录 HTTP 适配、AppService、隔离的本地协议服务、测试引擎与内存凭据。
 * [OUTPUT]: 编辑时读取当前连接密钥、显式清空与省略凭据的区分、根地址/版本前缀模型目录、草稿连接测试不持久化、凭据同地址复用与脱敏、模型 ID 归一化、认证/格式/超时错误与不阻塞产品操作的回归。
 * [POS]: tests/model-catalog.test.ts；仅访问本地测试服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { listCompatibleModels, modelCatalogUrl } from '../src/runtime/adapters/mastra/model-catalog'
import { AppService } from '../src/runtime/service'
import type { Connection, ConnectionInput, Snapshot } from '../src/shared/domain'
import type { AgentEngine } from '../src/runtime/contracts'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  cleanup.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
  })
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
}

async function serviceFixture(test: AgentEngine['test'] = async () => 'OK') {
  const root = await mkdtemp(join(tmpdir(), 'boai-model-catalog-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const keys = new Map<string, string>()
  const service = new AppService({
    dataPath: root,
    engine: { run: async () => {}, test },
    secrets: { get: async id => keys.get(id), set: async (id, key) => { keys.set(id, key) }, delete: async id => { keys.delete(id) } },
    emit: () => {},
  })
  cleanup.push(() => service.close())
  await service.init()
  return { service, keys }
}

describe('compatible model catalog', () => {
  it('loads the saved key for editing without adding it to snapshots or changing the connection', async () => {
    const { service, keys } = await serviceFixture()
    const saved = await service.handle('saveConnection', { name: 'Saved', provider: 'openai-compatible', baseUrl: 'https://example.com/v1', defaultModel: 'model', apiKey: 'saved-key' }) as Connection
    await expect(service.handle('getConnectionApiKey', { id: saved.id })).resolves.toBe('saved-key')
    await expect(service.handle('getConnectionApiKey', { id: 'missing' })).rejects.toThrow()
    expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([saved])
    expect(saved).not.toHaveProperty('apiKey')
    expect(keys.get(saved.id)).toBe('saved-key')
  })

  it('supports root endpoints like DeepSeek without forcing a v1 prefix', async () => {
    const requests: string[] = []
    const versionedUrl = await serve((request, response) => { requests.push(request.url!); response.end('{"data":[{"id":"deepseek-flash"}]}') })
    const { service } = await serviceFixture()
    const baseUrl = new URL(versionedUrl).origin
    await expect(service.handle('listConnectionModels', { baseUrl, apiKey: 'fixture-key' })).resolves.toEqual(['deepseek-flash'])
    expect(requests).toEqual(['/models'])
    expect(modelCatalogUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com/models')
    expect(modelCatalogUrl('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1/models')
  })

  it('discovers from an unsaved draft without choosing a model or persisting credentials', async () => {
    const requests: { path?: string; authorization?: string }[] = []
    const baseUrl = await serve((request, response) => {
      requests.push({ path: request.url, authorization: request.headers.authorization })
      response.end(JSON.stringify({ data: [{ id: 'z-model' }, { id: ' a-model ' }, { id: 'a-model' }, { name: 'invalid' }, { id: '' }, { id: 'draft-key' }] }))
    })
    const { service, keys } = await serviceFixture()
    expect(await service.handle('listConnectionModels', { baseUrl: `${baseUrl}///`, apiKey: 'draft-key' })).toEqual(['a-model', 'z-model'])
    expect(requests).toEqual([{ path: '/v1/models', authorization: 'Bearer draft-key' }])
    expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([])
    expect(keys.size).toBe(0)
  })

  it('reuses a saved key only at its saved endpoint, and never saves a preview key', async () => {
    const authorization: (string | undefined)[] = []
    const baseUrl = await serve((request, response) => { authorization.push(request.headers.authorization); response.end('{"data":[{"id":"local-model"}]}') })
    const { service, keys } = await serviceFixture()
    const saved = await service.handle('saveConnection', { name: 'Saved', provider: 'openai-compatible', baseUrl, defaultModel: 'original-model', apiKey: 'saved-key' }) as Connection
    expect(await service.handle('listConnectionModels', { id: saved.id, baseUrl: `${baseUrl}/` })).toEqual(['local-model'])
    await expect(service.handle('listConnectionModels', { id: saved.id, baseUrl: `${baseUrl}/different` })).rejects.toThrow('重新输入 API Key')
    expect(authorization).toEqual(['Bearer saved-key'])
    await service.handle('listConnectionModels', { id: saved.id, baseUrl: `${baseUrl}/different`, apiKey: 'preview-key' })
    expect(authorization).toEqual(['Bearer saved-key', 'Bearer preview-key'])
    expect(keys.get(saved.id)).toBe('saved-key')
    expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([saved])
  })

  it('allows empty-key local servers and a genuinely empty model list', async () => {
    const baseUrl = await serve((request, response) => { expect(request.headers.authorization).toBeUndefined(); response.end('{"data":[]}') })
    expect(await listCompatibleModels(baseUrl, '')).toEqual([])
  })

  it.each([401, 403, 404, 500])('reports HTTP %s without returning provider credential echoes', async status => {
    const baseUrl = await serve((_request, response) => { response.writeHead(status); response.end('{"error":{"message":"Bearer private-key"}}') })
    const error = await listCompatibleModels(baseUrl, 'private-key').catch(error => error as Error)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain('private-key')
    expect((error as Error).message).toMatch(/API Key|未提供模型列表|HTTP 500/)
  })

  it.each(['<html>not an API</html>', '{"models":[]}'])('rejects malformed catalog responses instead of pretending success: %s', async body => {
    const baseUrl = await serve((_request, response) => response.end(body))
    await expect(listCompatibleModels(baseUrl, '')).rejects.toThrow('模型列表格式无效')
  })

  it('rejects unsafe endpoint formats and does not forward credentials across redirects', async () => {
    expect(() => modelCatalogUrl('file:///tmp/models')).toThrow('HTTP')
    expect(() => modelCatalogUrl('https://user:secret@example.com/v1')).toThrow('不含凭据')
    let requests = 0
    const baseUrl = await serve((_request, response) => { requests++; response.writeHead(302, { Location: '/redirected' }); response.end() })
    await expect(listCompatibleModels(baseUrl, 'private-key')).rejects.toThrow('无法获取模型列表')
    expect(requests).toBe(1)
  })

  it('reports a timeout without leaking transport error details', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')))
    const baseUrl = await serve((_request, response) => response.end('{"data":[]}'))
    await expect(listCompatibleModels(baseUrl, '')).rejects.toThrow('获取模型列表超时')
  })

  it('keeps a slow catalog request outside the product mutation queue', async () => {
    let respond!: () => void, started!: () => void
    const received = new Promise<void>(done => { started = done })
    const baseUrl = await serve((_request, response) => { respond = () => response.end('{"data":[]}'); started() })
    const { service } = await serviceFixture()
    const pending = service.handle('listConnectionModels', { baseUrl })
    await received
    try {
      expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([])
    } finally { respond() }
    await expect(pending).resolves.toEqual([])
  })
})

describe('connection draft tests', () => {
  const observation = expect.objectContaining({ modelCallId: expect.any(String), signal: expect.any(AbortSignal), onModelCallRoute: expect.any(Function) })
  const draft: ConnectionInput = { name: 'Draft', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:12345/v1', defaultModel: 'draft-model', apiKey: 'draft-key' }

  it('tests the current model and key without creating a connection or persisting a key', async () => {
    const probe = vi.fn<AgentEngine['test']>().mockResolvedValue('OK')
    const { service, keys } = await serviceFixture(probe)
    await expect(service.handle('testConnectionDraft', draft)).resolves.toEqual({ text: 'OK' })
    expect(probe).toHaveBeenCalledWith(expect.objectContaining({ defaultModel: 'draft-model', baseUrl: draft.baseUrl, hasApiKey: true }), 'draft-key', observation)
    expect(probe.mock.calls[0][0]).not.toHaveProperty('apiKey')
    expect(probe.mock.calls[0][0].revision).toBe(0)
    expect(probe.mock.calls[0][2]?.signal?.aborted).toBe(false)
    expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([])
    expect(keys.size).toBe(0)
  })

  it('reuses a saved key only for the same service and endpoint, while edits stay private', async () => {
    const probe = vi.fn<AgentEngine['test']>().mockResolvedValue('OK')
    const { service, keys } = await serviceFixture(probe)
    const saved = await service.handle('saveConnection', { ...draft, defaultModel: 'saved-model', apiKey: 'saved-key' }) as Connection
    const edited = { ...draft, id: saved.id, baseUrl: `${draft.baseUrl}/`, apiKey: undefined }
    await service.handle('testConnectionDraft', edited)
    expect(probe).toHaveBeenLastCalledWith(expect.objectContaining({ defaultModel: 'draft-model' }), 'saved-key', observation)
    await expect(service.handle('testConnectionDraft', { ...edited, baseUrl: `${draft.baseUrl}/other` })).rejects.toThrow('重新输入 API Key')
    await expect(service.handle('testConnectionDraft', { ...edited, provider: 'anthropic' })).rejects.toThrow('重新输入 API Key')
    expect(probe).toHaveBeenCalledTimes(1)
    await service.handle('testConnectionDraft', { ...edited, baseUrl: `${draft.baseUrl}/other`, apiKey: 'preview-key' })
    expect(probe).toHaveBeenLastCalledWith(expect.objectContaining({ baseUrl: `${draft.baseUrl}/other` }), 'preview-key', observation)
    expect(keys.get(saved.id)).toBe('saved-key')
    expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([saved])
  })

  it('permits a keyless compatible endpoint but requires keys for official providers', async () => {
    const probe = vi.fn<AgentEngine['test']>().mockResolvedValue('OK')
    const { service } = await serviceFixture(probe)
    await service.handle('testConnectionDraft', { ...draft, apiKey: '' })
    expect(probe).toHaveBeenLastCalledWith(expect.objectContaining({ hasApiKey: false }), '', observation)
    for (const provider of ['openai', 'anthropic']) {
      await expect(service.handle('testConnectionDraft', { ...draft, provider, baseUrl: '', apiKey: '' })).rejects.toThrow('请填写 API Key')
    }
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('uses an explicitly cleared key for preview and only removes the saved key on save', async () => {
    const probe = vi.fn<AgentEngine['test']>().mockResolvedValue('OK')
    const { service, keys } = await serviceFixture(probe)
    const saved = await service.handle('saveConnection', draft) as Connection
    const edited = { ...draft, id: saved.id, apiKey: '' }
    const baseUrl = await serve((request, response) => { expect(request.headers.authorization).toBeUndefined(); response.end('{"data":[]}') })
    await service.handle('listConnectionModels', { id: saved.id, baseUrl, apiKey: '' })
    await service.handle('testConnectionDraft', edited)
    expect(probe).toHaveBeenLastCalledWith(expect.objectContaining({ hasApiKey: false }), '', observation)
    expect(keys.get(saved.id)).toBe('draft-key')
    await service.handle('saveConnection', edited)
    await expect(service.handle('getConnectionApiKey', { id: saved.id })).resolves.toBe('')
    expect(keys.has(saved.id)).toBe(false)
  })

  it('rejects missing models and invalid addresses before calling the model service', async () => {
    const probe = vi.fn<AgentEngine['test']>().mockResolvedValue('OK')
    const { service } = await serviceFixture(probe)
    for (const baseUrl of ['', 'file:///tmp/model', 'https://user:secret@example.com/v1']) {
      await expect(service.handle('testConnectionDraft', { ...draft, baseUrl })).rejects.toThrow()
    }
    await expect(service.handle('testConnectionDraft', { ...draft, defaultModel: ' ' })).rejects.toThrow()
    expect(probe).not.toHaveBeenCalled()
  })

  it('redacts credentials from test results and errors', async () => {
    const probe = vi.fn<AgentEngine['test']>().mockResolvedValueOnce('Echo draft-key').mockRejectedValueOnce(new Error('Rejected draft-key'))
    const { service } = await serviceFixture(probe)
    expect(await service.handle('testConnectionDraft', draft)).toEqual({ text: 'Echo [已隐藏凭据]' })
    await expect(service.handle('testConnectionDraft', draft)).rejects.toThrow('Rejected [已隐藏凭据]')
  })

  it('keeps a slow test outside the product mutation queue', async () => {
    let finish!: (text: string) => void, started!: () => void
    const received = new Promise<void>(done => { started = done })
    const { service } = await serviceFixture(() => { started(); return new Promise(done => { finish = done }) })
    const pending = service.handle('testConnectionDraft', draft)
    await received
    try { expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([]) }
    finally { finish('OK') }
    await expect(pending).resolves.toEqual({ text: 'OK' })
  })
})
