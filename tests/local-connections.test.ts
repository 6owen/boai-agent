/*
 * [OUTPUT]: 普通连接也提升revision；编辑使用expectedRevision，旧版本拒绝且导入去重保持。
 * [INPUT]: 本地配置导入用例、实际 AppService/SQLite、Mastra 和隔离的本地协议端点。
 * [OUTPUT]: 二级详情测试读取当前源密钥且不保存连接；显式扫描/源变更校验、密钥隔离、重复导入与重启持久化、Responses 请求和旧 Chat 默认值回归。
 * [POS]: tests/local-connections.test.ts；不读取真实用户配置或访问付费模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { LocalConfigDiscovery } from '../apps/electron/src/main/local-configs/discovery'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { modelConfig } from '../packages/runtime/src/adapters/mastra/model-config'
import type { Connection, Snapshot } from '../packages/shared/src/domain'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-import-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'config')
  await mkdir(directory)
  const discovery = new LocalConfigDiscovery([])
  const write = (value: unknown) => writeFile(join(directory, 'settings.json'), JSON.stringify(value))
  const scan = () => discovery.scan({ directory, userHome: root, env: {} })
  return { root, directory, discovery, write, scan }
}

describe('local model connection import', () => {
  it('tests a scanned configuration with current host credentials without importing or persisting it', async () => {
    const f = await fixture(), keys = new Map<string, string>()
    await f.write({ env: { ANTHROPIC_API_KEY: 'original-key' } })
    const id = f.scan().logins[0].configId
    await f.write({ env: { ANTHROPIC_API_KEY: 'current-key' } })
    const calls: { model: string; key: string }[] = []
    const service = new AppService({
      dataPath: join(f.root, 'data'),
      engine: { run: async () => {}, test: async (connection, key) => { calls.push({ model: connection.defaultModel, key }); return 'OK' } },
      secrets: { get: async id => keys.get(id), set: async (id, key) => { keys.set(id, key) }, delete: async id => { keys.delete(id) } }, emit: () => {},
    })
    cleanup.push(() => service.close()); await service.init()
    expect(await service.handle('testConnectionDraft', f.discovery.connection(id, 'test-model'))).toEqual({ text: 'OK' })
    expect(calls).toEqual([{ model: 'test-model', key: 'current-key' }])
    expect(keys.size).toBe(0)
    const snapshot = await service.handle('snapshot', undefined) as Snapshot
    expect(snapshot.connections).toEqual([])
    expect(JSON.stringify(snapshot)).not.toContain('current-key')
  })

  it('requires a selected scan result, re-reads keys, rejects stale sources and supplies missing models', async () => {
    const f = await fixture()
    await f.write({ env: { ANTHROPIC_API_KEY: 'original-key' } })
    expect(() => f.discovery.connection('unknown')).toThrow('先扫描')
    const result = f.scan(), id = result.logins[0].configId
    expect(JSON.stringify(result)).not.toContain('original-key')
    expect(() => f.discovery.connection(id)).toThrow('默认模型')
    await f.write({ env: { ANTHROPIC_API_KEY: 'rotated-key' } })
    expect(f.discovery.connection(id, 'my-model')).toMatchObject({ apiKey: 'rotated-key', defaultModel: 'my-model', baseUrl: 'https://api.anthropic.com/v1', provider: 'anthropic', localConfigId: id })
    await f.write({ env: { ANTHROPIC_API_KEY: 'rotated-key', ANTHROPIC_BASE_URL: 'https://changed.example' } })
    expect(() => f.discovery.connection(id, 'my-model')).toThrow('源配置已变化')
    f.scan()
    expect(() => f.discovery.connection(id, 'my-model')).toThrow('先扫描')
  })

  it('keeps imported protocol/source across editing and restart, with idempotent imports and secrets only in the vault', async () => {
    const f = await fixture()
    await f.write({ baseUrl: 'https://relay.example/v1', apiKey: 'private-key', model: 'test-model', api: 'responses' })
    const input = f.discovery.connection(f.scan().logins[0].configId)
    const keys = new Map<string, string>()
    const options = {
      dataPath: join(f.root, 'data'),
      engine: { run: async () => {}, test: async () => 'OK' },
      secrets: { get: async (id: string) => keys.get(id), set: async (id: string, key: string) => { keys.set(id, key) }, delete: async (id: string) => { keys.delete(id) } },
      emit: () => {},
    }
    let service = new AppService(options)
    cleanup.push(() => service.close())
    await service.init()
    const saved = await service.handle('saveConnection', input) as Connection
    const repeated = await Promise.all([service.handle('saveConnection', input), service.handle('saveConnection', input)])
    expect(repeated).toEqual([saved, saved])
    expect(saved.api).toBe('responses')
    expect(keys.get(saved.id)).toBe('private-key')
    const { hasApiKey: _, localConfigId: __, api: ___, revision, ...edited } = saved
    await service.handle('saveConnection', { ...edited, expectedRevision: revision, name: 'My renamed connection' })
    await expect(service.handle('saveConnection', { ...edited, expectedRevision: revision, name: 'Stale draft' })).rejects.toThrow('连接已被修改')
    await service.close()
    service = new AppService(options)
    await service.init()
    const snapshot = await service.handle('snapshot', undefined) as Snapshot
    expect(snapshot.connections).toEqual([{ ...saved, revision: revision! + 1, name: 'My renamed connection' }])
    expect(JSON.stringify(snapshot)).not.toContain('private-key')
    expect(await service.handle('saveConnection', input)).toEqual(snapshot.connections[0])
    expect(modelConfig({ ...saved, api: undefined }, 'private-key')).toMatchObject({ api: 'chat' })
  })

  it('does not import OAuth or unsupported authentication as an API key', async () => {
    const f = await fixture()
    await writeFile(join(f.directory, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'private-oauth', refresh_token: 'private-refresh' } }))
    const result = f.scan()
    expect(result.logins).toMatchObject([{ authType: 'oauth', usable: true }])
    expect(() => f.discovery.connection(result.logins[0].configId, 'model')).toThrow('先扫描')
    expect(JSON.stringify(result)).not.toMatch(/private-oauth|private-refresh/)
    await f.write({ baseUrl: 'https://relay.example/v1', apiKey: 'private-key', model: 'model', headers: { 'x-extra': 'required' } })
    const invalid = f.scan().logins.find(item => item.authType === 'api_key')!
    expect(() => f.discovery.connection(invalid.configId)).toThrow('不受支持')
  })

  it('sends imported Responses connections to /responses with the actual SDK', async () => {
    const f = await fixture()
    const requests: { url?: string; authorization?: string; body: { model?: string } }[] = []
    const server = createServer(async (request, response) => {
      let body = ''
      for await (const part of request) body += part
      requests.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body) })
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const send = (type: string, value: object) => response.write(`data: ${JSON.stringify({ type, ...value })}\n\n`)
      send('response.created', { response: { id: 'resp-1', created_at: 1, model: 'fixture-model' } })
      send('response.output_item.added', { output_index: 0, item: { id: 'msg-1', type: 'message', role: 'assistant', content: [] } })
      send('response.output_text.delta', { item_id: 'msg-1', output_index: 0, content_index: 0, delta: 'OK' })
      send('response.completed', { response: { id: 'resp-1', status: 'completed', usage: { input_tokens: 5, output_tokens: 1 } } })
      response.end()
    })
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) })
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
    await writeFile(join(f.directory, 'config.toml'), `model_provider="fixture"\nmodel="fixture-model"\n[model_providers.fixture]\nbase_url="${baseUrl}"\nwire_api="responses"\nrequires_openai_auth=true`)
    await writeFile(join(f.directory, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'fixture-key' }))
    const input = f.discovery.connection(f.scan().logins[0].configId)
    const { apiKey, ...metadata } = input
    const engine = new MastraEngine()
    await expect(engine.test({ ...metadata, id: 'fixture', hasApiKey: true }, apiKey!)).resolves.toBe('OK')
    expect(requests).toEqual([{ url: '/v1/responses', authorization: 'Bearer fixture-key', body: expect.objectContaining({ model: 'fixture-model' }) }])
  })
})
