/*
 * [INPUT]: Per-request API source and service-lifetime credential adapter.
 * [OUTPUT]: Identity isolation, endpoint key boundaries, revocation and missing-secret behavior.
 * [POS]: Model source contract tests; no external model or personal credential access.
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { describe, expect, it, vi } from 'vitest'
import { modelRequestIdentity, prepareRequestModel, RequestModelSecrets } from '../src/runtime/request-model'
import type { Connection, DigitalAgent } from '../src/shared/domain'

const agent = { id: 'worker', active: true, configVersion: 2, modelId: 'saved-model', connectionId: 'saved', executionBackend: { kind: 'mastra-model' } } as DigitalAgent
const base: Connection = { id: 'saved', revision: 4, name: '原连接', provider: 'openai-compatible', baseUrl: 'https://models.example/v1', defaultModel: 'default-model', hasApiKey: true }
const connections = () => new Map([[base.id, structuredClone(base)]])
describe('request API model source', () => {
  it('freezes the selected model and inherits a key only for its original endpoint', async () => {
    const read = vi.fn(async () => 'synthetic-original-key'), prepared = await prepareRequestModel({ model: 'once' }, agent, base, read)
    expect(read).toHaveBeenCalledWith(base)
    expect(prepared.source.inheritedConnection).toEqual({ id: 'saved', revision: 4 })
    expect(JSON.stringify(prepared.source)).not.toContain('synthetic-original-key')
    const secrets = new RequestModelSecrets(); secrets.install(prepared)
    const selected = secrets.resolve(prepared.source, agent, connections())
    expect(selected.agent).toMatchObject({ id: agent.id, configVersion: 2, modelId: 'once' }); expect(selected.apiKey).toBe('synthetic-original-key')
    selected.connection.baseUrl = 'https://other.example'
    expect(prepared.source.connection.baseUrl).toBe(base.baseUrl); expect(agent.modelId).toBe('saved-model')
  })
  it('refuses cross-endpoint key reuse and accepts an explicitly supplied independent source', async () => {
    const read = vi.fn(async () => 'must-not-read')
    await expect(prepareRequestModel({ baseUrl: 'https://other.example/v1', model: 'once' }, agent, base, read)).rejects.toThrow('重新输入')
    expect(read).not.toHaveBeenCalled()
    const prepared = await prepareRequestModel({ provider: 'openai-compatible', baseUrl: 'https://other.example/v1', model: 'once', apiKey: 'synthetic-new-key' }, agent, base, read)
    expect(read).not.toHaveBeenCalled(); expect(prepared.source.inheritedConnection).toBeUndefined()
    const secrets = new RequestModelSecrets(); secrets.install(prepared)
    expect(secrets.resolve(prepared.source, agent, new Map()).apiKey).toBe('synthetic-new-key')
  })
  it.each(['file:///private/data', 'https://user:secret@models.example', 'https://models.example?key=secret'])('rejects credential-bearing or invalid model endpoint %s', async baseUrl => {
    await expect(prepareRequestModel({ baseUrl, apiKey: '' }, agent, base, async () => '')).rejects.toThrow()
  })
  it('rejects native employees before reading credentials', async () => {
    const read = vi.fn(async () => '')
    await expect(prepareRequestModel({ model: 'once' }, { ...agent, executionBackend: { kind: 'codex-local', profileId: 'native' } }, base, read)).rejects.toThrow('本机员工')
    expect(read).not.toHaveBeenCalled()
  })
  it('does not reuse a changed employee/source or fall back after service restart/cleanup', async () => {
    const prepared = await prepareRequestModel({ model: 'once' }, agent, base, async () => 'synthetic-key'), secrets = new RequestModelSecrets()
    secrets.install(prepared)
    expect(() => secrets.resolve(prepared.source, { ...agent, configVersion: 3 }, connections())).toThrow('员工配置')
    expect(() => secrets.resolve(prepared.source, agent, new Map())).toThrow('原连接')
    const changed = connections(); changed.set(base.id, { ...base, revision: 5 })
    expect(() => secrets.resolve(prepared.source, agent, changed)).toThrow('原连接')
    expect(() => new RequestModelSecrets().resolve(prepared.source, agent, connections())).toThrow('临时模型凭据')
    secrets.forget(prepared.source)
    expect(() => secrets.resolve(prepared.source, agent, connections())).toThrow('临时模型凭据')
  })
  it('keeps the original Magpie local application identity without inventing a secret', async () => {
    const local: Connection = { ...base, baseUrl: 'http://127.0.0.1:4096', hasApiKey: false, gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }
    const prepared = await prepareRequestModel({ model: 'once' }, agent, local, async () => '')
    expect(prepared.source.connection.hasApiKey).toBe(false)
    expect(new RequestModelSecrets().resolve(prepared.source, agent, new Map([[local.id, local]])).apiKey).toBe(prepared.apiKey)
  })
  it('deduplicates the original input without persisting raw API credentials', () => {
    const input = { content: '原消息', apiModel: { model: 'once', apiKey: 'synthetic-key' } }
    expect(JSON.stringify(modelRequestIdentity(input))).not.toContain('synthetic-key')
    expect(modelRequestIdentity(input)).toEqual(modelRequestIdentity(structuredClone(input)))
    expect(modelRequestIdentity(input)).not.toEqual(modelRequestIdentity({ ...input, apiModel: { ...input.apiModel, apiKey: 'different' } }))
    expect(input.apiModel.apiKey).toBe('synthetic-key')
  })
})
