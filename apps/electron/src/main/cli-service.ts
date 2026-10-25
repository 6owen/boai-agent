/*
 * [OUTPUT]: 只读认证当前CLI服务连接状态，凭据不传给renderer。
 * [OUTPUT]: 员工进程使用原run短期环境租约，剥离owner/服务密钥变量，实际退出后撤回；不可用时禁止CLI用户配置回退。
 * [OUTPUT]: Runtime-issued run authentication shares the private worker bridge without forwarding the owner token.
 * [OUTPUT]: CLI消息游标复用原历史双向分页；app/session:event沿公共发布器隔离会话，订阅确认及中断/断开退出可核对。
 * [INPUT]: Existing Electron single-instance owner, runtime request bridge and service events.
 * [OUTPUT]: Private loopback CLI endpoint sharing the original worker/vault/browser lifecycle.
 * [POS]: Desktop CLI glue; never constructs another AppService or forwards the CLI token to workers.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { randomBytes } from 'node:crypto'
import { basename } from 'node:path'
import { startRpcServer } from '@boai/transport/server'
import { publicChannels, type CliServicePort } from '@boai/transport/channels'
import { profileIdentity, publishLocalConnection } from '@boai/transport/discovery'
import { readLocalConnection } from '@boai/transport/discovery'
import { CliRpcClient } from '@boai/transport/client'
import type { CliInstallation } from '@boai/shared/ipc/cli-installation'
import { PROTOCOL_VERSION } from '@boai/shared/cli/protocol'
import type { AppEvent } from '@boai/shared/ipc'
import { publishAppEvent } from '@boai/transport/events'
import type { RunCliPrincipal } from '@boai/shared/cli/run-access'

export async function desktopCliConnection(dataPath: string): Promise<CliInstallation['connection']> {
  let client: CliRpcClient | undefined
  try {
    const metadata = await readLocalConnection(dataPath)
    client = new CliRpcClient(metadata.url, { ...metadata, requestTimeout: 1500, connectTimeout: 1500 })
    await client.connect(); await client.invoke('ping')
    return { state: 'connected', version: client.handshake?.serverVersion ?? metadata.version }
  } catch { return { state: 'unavailable' } }
  finally { client?.destroy() }
}

export async function openDesktopCli(dataPath: string, version: string, port: CliServicePort) {
  const workspaceId = await profileIdentity(dataPath), token = randomBytes(32).toString('base64url')
  const server = await startRpcServer({ token, workspaceId, version, ...(port.runAccess ? { authenticateRun: async (token: string) => await port.runAccess!({ kind: 'authenticate', token }) as RunCliPrincipal } : {}), channels: publicChannels(port, { workspaceId, name: basename(dataPath), version, browserAvailable: true, credentialProvider: 'desktop-vault' }) })
  let remove: () => Promise<void>
  try {
    await port.runAccess?.({ kind: 'endpoint', url: server.url })
    remove = await publishLocalConnection(dataPath, { protocolVersion: PROTOCOL_VERSION, workspaceId, serverId: server.serverId, url: server.url, token, pid: process.pid, version })
  }
  catch (error) { await server.close(); throw error }
  return {
    publish(event: AppEvent) { publishAppEvent(server, event) },
    async close() { await server.close(); await remove() },
  }
}
