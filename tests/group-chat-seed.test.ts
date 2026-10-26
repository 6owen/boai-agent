/*
 * [INPUT]: UI准备入口、原bootstrap/SQLite及隔离profile；Electron仅以启动边界替身观测。
 * [OUTPUT]: 历史/成果准备完成且owner已释放后才首次启动，跨场数据/端口独立、零模型调用；不代替真实UI。
 * [POS]: UI数据夹具生命周期回归。
 * [PROTOCOL]: 修改同步Header、tests/.folder.md和第22组03。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Server } from 'node:http'
import { prepareGroupChat } from './e2e/support/group-chat'
import type { Desktop } from './e2e/support/desktop'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { Conversation, Message } from '../packages/shared/src/domain'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-ui-seed-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const start = vi.fn(async () => {
    // First desktop launch must observe the final history, without a live seed owner.
    await expect(readFile(join(root, 'v2/.cli/owner.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    const store = new ProductStore(join(root, 'v2/boai.sqlite')); await store.init()
    try {
      expect(await store.get<Message>('messages', 'history-writer')).toMatchObject({ content: '我把研究结论整理成了报告初稿，按「对话体验 → 协作方式 → 建议」展开。', status: 'completed' })
      expect(await store.get<Message>('messages', 'history-direct-13')).toMatchObject({ status: 'completed' })
    } finally { await store.close() }
  })
  const page = { setViewportSize: vi.fn(), getByRole: vi.fn(() => ({ click: vi.fn() })) }
  const runtime = { root, start, page, trackServer(server: Server) { cleanups.push(() => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()) })) } } as unknown as Desktop
  const data = await prepareGroupChat(runtime, { mainEntry: 'observed-entry.cjs', seedBeforeLaunch: true, now: Date.parse('2026-10-20T01:00:00Z') })
  return { root, start, data }
}
it('UI历史和真实成果先落库，第一次也是唯一一次桌面启动', async () => {
  const f = await fixture()
  expect(f.start).toHaveBeenCalledExactlyOnceWith({ mainEntry: 'observed-entry.cjs' })
  expect(f.data.state).toEqual({ calls: 0, errors: [] })
  expect(f.data.group).toMatchObject({ kind: 'group', title: '产品讨论组', agentIds: ['researcher', 'writer', 'reviewer'] })
  expect(f.data.direct).toMatchObject({ kind: 'direct', agentIds: ['researcher'] })
  for (const artifact of f.data.artifacts) expect(await readFile(artifact.path, 'utf8')).toContain(artifact.name)
})
it('不同UI场景保持独立profile、工作区和历史，准备不复用前场状态', async () => {
  const a = await fixture(), b = await fixture()
  expect(a.data.dataPath).not.toBe(b.data.dataPath)
  expect(a.data.group.workspacePath).not.toBe(b.data.group.workspacePath)
  const store = new ProductStore(join(a.data.dataPath, 'boai.sqlite')); await store.init()
  try { await store.write([{ collection: 'conversations', id: a.data.group.id, value: { ...a.data.group, title: '前场独立修改' } }]) } finally { await store.close() }
  const other = new ProductStore(join(b.data.dataPath, 'boai.sqlite')); await other.init()
  try { expect(await other.get<Conversation>('conversations', b.data.group.id)).toMatchObject({ title: '产品讨论组' }) } finally { await other.close() }
  expect(a.data.state.calls + b.data.state.calls).toBe(0)
})
