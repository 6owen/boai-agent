/*
 * [INPUT]: 生产渠道工厂、实际LarkAdapter/Channel/Node SDK和隔离HTTP边界。
 * [OUTPUT]: 飞书/Lark启动鉴权与机器人身份请求使用官方HTTPS域，保留SDK区域转换；不使用真实凭据或连接WebSocket。
 * [POS]: 第16组实际SDK域名回归，补原浅层平台夹具的缺口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { channelTransportFactory } from '../packages/runtime/src/adapters/channels/mastra-channels'
import type { ChannelBinding } from '../packages/shared/src/domain/channels'
import type { ChannelTransport } from '../packages/runtime/src/modules/channels/channel-service'

const io = vi.hoisted(() => ({ urls: [] as string[] }))
vi.mock('@larksuite/channel', async importOriginal => {
  const actual = await importOriginal<typeof import('@larksuite/channel')>()
  const request = async (config: { url: string }) => {
    io.urls.push(config.url)
    new URL(config.url)
    return { code: 0, tenant_access_token: 'fixture-token', expire: 7200, bot: { open_id: 'fixture-bot', app_name: 'Fixture' } }
  }
  const method = (input: string | { url: string }) => request(typeof input === 'string' ? { url: input } : input)
  return { ...actual, createLarkChannel: (options: Parameters<typeof actual.createLarkChannel>[0]) => actual.createLarkChannel({
    ...options,
    // Keep the actual REST/authentication chain; avoid opening a platform socket.
    transport: 'webhook', keepalive: { enabled: false },
    httpInstance: { request, get: method, post: method, put: method, patch: method, delete: method } as NonNullable<typeof options.httpInstance>,
  }) }
})

const roots: string[] = [], transports: ChannelTransport[] = []
afterEach(async () => { await Promise.all(transports.splice(0).map(transport => transport.stop())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); io.urls.length = 0 })
describe('Feishu/Lark actual SDK connection routing', () => {
  it.each(['feishu', 'lark'] as const)('starts %s authentication on its official HTTPS host', async platform => {
    const root = await mkdtemp(join(tmpdir(), 'boai-channel-domain-')); roots.push(root)
    const binding: ChannelBinding = { id: `${platform}-fixture`, agentId: 'writer', platform, appId: `${platform}-fixture-app`, name: 'Fixture', enabled: true, revision: 1, allowedUserIds: ['owner'], allowedChatIds: [], hasCredential: true, installedAt: '', updatedAt: '' }
    const factory = channelTransportFactory(root, { get: async () => undefined, set: async () => {}, delete: async () => {} })
    const failed = vi.fn()
    const transport = await factory(binding, 'fixture-secret', async () => {}, failed); transports.push(transport)
    await expect(transport.start()).resolves.toMatchObject({ botUserId: 'fixture-bot' })
    const origin = platform === 'feishu' ? 'https://open.feishu.cn' : 'https://open.larksuite.com'
    expect(io.urls).toContain(`${origin}/open-apis/auth/v3/tenant_access_token/internal`)
    expect(io.urls).toContain(`${origin}/open-apis/bot/v3/info`)
    expect(io.urls.every(url => new URL(url).origin === origin)).toBe(true)
    expect(failed).not.toHaveBeenCalled()
  })
})
