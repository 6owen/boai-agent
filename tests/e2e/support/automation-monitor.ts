/*
 * [INPUT]: 场景独立数据目录、来源聊天与结构化观测值。
 * [OUTPUT]: 持久已发布的 JSON 来源和检查点只读查询；不替代监控 IPC、比较器或运行账本。
 * [POS]: Electron 监控场景数据支撑；文件与记录均限于测试目录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutomationMonitorCheckpoint } from '../../../src/shared/domain'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
export async function publishMonitorSample(root: string, conversationId: string, count: number, complete = true) {
  const id = randomUUID(), publishedAt = new Date().toISOString(), name = 'metrics.json'
  const folder = join(root, 'v2', 'workspaces', conversationId, 'artifacts'), path = join(folder, `${id}-${name}`)
  const text = JSON.stringify({ schemaVersion: 1, observedAt: publishedAt, complete, data: { count } })
  await mkdir(folder, { recursive: true }); await writeFile(path, text)
  const store = new ProductStore(join(root, 'v2', 'boai.sqlite')); await store.init()
  try { await store.write([{ collection: 'artifacts', id, value: { id, name, path, size: Buffer.byteLength(text), conversationId, publishedAt } }]) }
  finally { await store.close() }
  return id
}
export async function monitorCheckpoint(root: string, id: string) {
  const store = new ProductStore(join(root, 'v2', 'boai.sqlite')); await store.init()
  try { return (await store.load<AutomationMonitorCheckpoint>('automationMonitorCheckpoints')).find(c => c.id === id) }
  finally { await store.close() }
}
