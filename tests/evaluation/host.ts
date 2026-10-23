/*
 * [OUTPUT]: 显式人格检索探路只读核对服务修订，解密独立检索凭据后仅内存传递，不复用模型密钥。
 * [INPUT]: 显式评估参数、只读模型连接及操作系统加密凭据。
 * [OUTPUT]: 启动同步设置产品身份与隔离目录，仅通过内存向评估 worker 传递显式选择的多连接凭据。
 * [POS]: 真实模型评估的 Electron 凭据桥，不启动产品窗口或修改用户数据库。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { fork } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CredentialVault } from '../../src/main/vault'
import type { Connection } from '../../src/shared/domain'

let failurePath: string | undefined
async function main() {
  // Electron snapshots the app name for macOS safeStorage during startup, before ready.
  // Set identity and the isolated profile before yielding to any asynchronous work.
  const settings = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  failurePath = join(settings.output, 'startup-error.json')
  const profile = join(settings.output, 'electron-profile'); mkdirSync(profile, { recursive: true })
  app.setName('BoAI Agent'); app.setPath('userData', profile)
  await app.whenReady(); app.dock?.hide()
  const client = new DatabaseSync(join(settings.dataPath, 'boai.sqlite'), { readOnly: true })
  let connections: Connection[]
  let searchCredentialId: string | undefined
  try {
    connections = client.prepare("SELECT value FROM records WHERE collection='connections'").all().map(row => JSON.parse(String(row.value)))
    if (settings.webSearch) {
      const selected = settings.webSearch.service
      const row = client.prepare("SELECT value FROM records WHERE collection='webSearchServices' AND id=?").get(selected.id)
      const source = row ? JSON.parse(String(row.value)) : undefined
      if (!source || source.revision !== selected.revision || !source.enabled) throw new Error('检索服务在冻结后变化，未发送请求')
      searchCredentialId = source.credentialId
    }
  }
  finally { client.close() }
  const connection = settings.connectionIds?.length ? connections.find(value => value.id === settings.connectionIds[0]) : settings.connectionId ? connections.find(value => value.id === settings.connectionId) : connections.length === 1 ? connections[0] : undefined
  if (!connection) throw new Error('评估连接不唯一或不存在，请用 --connection 指定连接 ID')
  const suppliedKey = process.env.BOAI_EVAL_API_KEY
  delete process.env.BOAI_EVAL_API_KEY
  const apiKey = suppliedKey ?? await new CredentialVault(join(settings.dataPath, 'credentials.enc.json')).get(connection.id) ?? ''
  if (connection.hasApiKey && !apiKey) throw new Error('无法读取所选连接的凭据，请在应用设置中重新保存后再评估')
  const searchCredential = searchCredentialId ? await new CredentialVault(join(settings.dataPath, 'credentials.enc.json')).get(searchCredentialId) ?? '' : ''
  if (settings.webSearch?.service.hasCredential && !searchCredential) throw new Error('无法读取已选检索服务凭据，未发送请求')
  await writeFile(join(settings.output, 'model.json'), JSON.stringify({ name: connection.name, provider: connection.provider, model: connection.defaultModel, endpointHost: new URL(connection.baseUrl).hostname, credentialsSaved: false }, null, 2))
  const selected = settings.connectionIds?.length ? settings.connectionIds.map((id: string) => { const value = connections.find(connection => connection.id === id); if (!value) throw new Error('不存在指定的模型连接'); return value }) as Connection[] : [connection]
  const credentials = []
  for (const item of selected) {
    const key = item.id === connection.id ? apiKey : await new CredentialVault(join(settings.dataPath, 'credentials.enc.json')).get(item.id) ?? ''
    if (item.hasApiKey && !key) throw new Error('无法读取所选连接凭据')
    credentials.push({ connection: item, apiKey: key })
  }
  const child = fork(process.argv[3], [], { execPath: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  child.send({ settings, connection, apiKey, connections: credentials, ...(settings.webSearch ? { searchCredential } : {}) })
  process.on('SIGINT', () => child.kill('SIGINT'))
  const code = await new Promise<number>(resolve => child.once('exit', code => resolve(code ?? 1)))
  app.exit(code)
}
void main().catch(async error => { const message = error instanceof Error ? error.message : '评估宿主启动失败'; if (failurePath) await writeFile(failurePath, JSON.stringify({ phase: 'configuration', error: message, providerRequests: 0 }, null, 2)); process.stderr.write(`${message}\n`); app.exit(1) })
