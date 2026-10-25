/*
 * [INPUT]: 可终止的真实宿主子进程、SQLite 提交断点和同目录重启。
 * [OUTPUT]: SIGKILL 前未提交摘要回滚、提交后完整保存；恢复不调用模型或工具、基线/回执可核对。
 * [POS]: T2.4/UM14 原生进程验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { fork } from 'node:child_process'
import { buildWorkspace as build } from '../scripts/workspace-packages.mjs'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import type { ConversationDetail, MemoryView } from '../packages/shared/src/domain'
test.each(['before-commit', 'after-commit'])('UM14 real SIGKILL at %s leaves no partial summary and never replays', async phase => {
  const root = await mkdtemp(join(tmpdir(), 'boai-memory-crash-')), cache = resolve('node_modules/.cache'); await mkdir(cache, { recursive: true })
  const temporary = await mkdtemp(join(cache, 'memory-crash-')), file = join(temporary, 'runner.mjs')
  let service: AppService | undefined
  try {
    await build({ entryPoints: ['tests/fixtures/memory-process.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
    const child = fork(file, [root, phase], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); let diagnostics = ''; child.stderr?.on('data', data => { diagnostics += data })
    let checkpoint: { conversationId: string; agentId: string }
    try { checkpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('未到达事务断点：' + diagnostics)), 12000)
      child.once('message', value => { clearTimeout(timer); resolve(value as never) }); child.once('error', error => { clearTimeout(timer); reject(error) }); child.once('exit', code => { clearTimeout(timer); reject(new Error(`进程提前退出 ${code}: ${diagnostics}`)) })
    }) } finally { if (child.exitCode === null && child.signalCode === null) { const exit = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exit } }
    let calls = 0
    service = new AppService({ dataPath: root, engine: { run: async () => { calls++ }, extractMemory: async () => { calls++; return [] }, test: async () => '' }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init()
    const view = await service.handle('getMemory', { agentId: checkpoint.agentId, scope: 'employee' }) as MemoryView
    expect(view.entries.map(entry => entry.content).sort()).toEqual(phase === 'after-commit' ? ['已提交基线', '未完成摘要'] : ['已提交基线'])
    const detail = await service.handle('getConversation', { id: checkpoint.conversationId }) as ConversationDetail
    expect(detail.runs.find(run => run.phase === 'memory')?.status).toBe('interrupted'); expect(calls).toBe(0)
    await service.handle('getMemory', { agentId: checkpoint.agentId, scope: 'employee' }); expect(calls).toBe(0)
  } finally { await service?.close(); await rm(temporary, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) }
})
