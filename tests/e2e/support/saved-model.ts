/*
 * [INPUT]: 显式真实 API 开关、连接 ID/产品数据目录和已关闭的隔离 Desktop。
 * [OUTPUT]: 只读一个已保存连接，凭据在独立Electron内经原加密仓库保存；真实源码启动和重启复用同一隔离入口，保持系统加密；只返回非秘密元信息，零模型请求。
 * [POS]: 混合运行时真实桌面准备；不会将密钥送入 renderer、Playwright 参数、审阅资源或日志。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import electronPath from 'electron'
import type { Connection } from '../../../src/shared/domain'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { Desktop } from './desktop'

/** Playwright's Electron loader forces a mock Keychain. Real credentials must
 * use the same system encryption as the product and the preparation host. */
export async function systemKeychainLaunch(runtime: Desktop): Promise<{ mainEntry: string }> {
  if (process.env.BOAI_TEST_REAL_API !== '1' || process.env.BOAI_TEST_PACKAGED_PATH) throw new Error('系统钥匙串启动仅用于明确的源码真实模型场景')
  const directory = join(runtime.root, 'system-keychain-launch')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'boai-agent', version: '0.2.2', main: 'main.cjs' }))
  await writeFile(join(directory, 'main.cjs'), `const { app } = require('electron');\napp.commandLine.removeSwitch('use-mock-keychain');\napp.commandLine.removeSwitch('password-store');\nrequire(${JSON.stringify(resolve('dist/main/main.cjs'))});\n`)
  return { mainEntry: directory }
}

export async function prepareSavedModel(runtime: Desktop): Promise<Connection> {
  const source = process.env.BOAI_TEST_API_DATA_DIR, id = process.env.BOAI_TEST_API_CONNECTION_ID
  if (process.env.BOAI_TEST_REAL_API !== '1' || !source || !id) throw new Error('真实 API 桌面验证必须明确提供连接和数据目录')
  const from = await realpath(source), target = await realpath(join(runtime.root, 'v2'))
  if (from === target) throw new Error('真实 API 验证必须使用独立场景目录')
  const saved = await ProductStore.openReadOnly(join(from, 'boai.sqlite'))
  let connection: Connection
  try {
    const original = (await saved.load<Connection>('connections')).find(value => value.id === id)
    if (!original?.hasApiKey || !original.defaultModel) throw new Error('明确选择的连接缺少模型或凭据')
    connection = { ...original, id: randomUUID(), name: '真实 API 验收连接' }
  } finally { await saved.close() }
  const profile = join(runtime.root, 'credential-bridge'), entry = join(profile, 'host.cjs')
  await mkdir(profile)
  await build({ entryPoints: [resolve('tests/fixtures/saved-model-vault.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22', logLevel: 'silent' })
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  await new Promise<void>((done, reject) => {
    const child = spawn(electronPath as unknown as string, [entry, profile, join(from, 'credentials.enc.json'), join(target, 'credentials.enc.json'), id, connection.id], { env, stdio: 'ignore' })
    let expired = false
    const timeout = setTimeout(() => { expired = true; child.kill('SIGKILL') }, 45000)
    child.once('error', () => { clearTimeout(timeout); reject(new Error('模型凭据桥未能启动')) })
    child.once('close', code => { clearTimeout(timeout); code === 0 && !expired ? done() : reject(new Error(expired ? '模型凭据桥超时，未启动模型' : '无法安全读取所选模型凭据，未启动模型')) })
  })
  const store = new ProductStore(join(target, 'boai.sqlite')); await store.init()
  try {
    if ((await store.load('connections')).length) throw new Error('场景中已有连接，拒绝覆盖')
    await store.write([{ collection: 'connections', id: connection.id, value: connection }])
  } finally { await store.close() }
  return connection
}
