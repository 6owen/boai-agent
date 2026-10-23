/*
 * [OUTPUT]: 三处真实SIGKILL、两次重启及异路径备份恢复后核对原件/Work与零重放，清空同时处理未登记文件。
 * [INPUT]: 生产宿主/文件工具子进程、真实 SIGKILL 与同目录两次重启。
 * [OUTPUT]: 未提交成果不冒充历史发布，已提交版本保持原身份，Work 中断且恢复零模型或工具重放。
 * [POS]: 成果复制与 SQLite 登记边界的进程级验证；离线模型，不替代真实供应商或桌面验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test } from 'vitest'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { Artifact, ConversationDetail } from '../src/shared/domain'

test.each(['before-register', 'before-commit', 'after-commit'])('real SIGKILL at %s preserves the publication boundary through two restarts', async phase => {
  const root = await mkdtemp(join(tmpdir(), 'boai-artifact-crash-')), cache = resolve('node_modules/.cache')
  await mkdir(cache, { recursive: true })
  const temporary = await mkdtemp(join(cache, 'artifact-crash-')), file = join(temporary, 'runner.mjs')
  let service: AppService | undefined
  try {
    await build({ entryPoints: ['tests/fixtures/artifact-process.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
    const child = fork(file, [root, phase], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    let diagnostics = ''
    child.stderr?.on('data', data => { diagnostics += data })
    let checkpoint: { conversationId: string; artifact: Artifact }
    try {
      checkpoint = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('未到达发布断点：' + diagnostics)), 12000)
        child.once('message', value => { clearTimeout(timer); resolve(value as never) })
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`进程提前退出 ${code}: ${diagnostics}`)) })
      })
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exit
      }
    }
    const original = await readFile(checkpoint.artifact.path), originalStat = await stat(checkpoint.artifact.path)
    expect(createHash('sha256').update(original).digest('hex')).toBe(checkpoint.artifact.contentHash)
    // A genuine directory-only legacy file must still migrate independently of the interrupted copy.
    const legacyPath = join(root, 'workspaces', checkpoint.conversationId, 'artifacts', 'legacy.md')
    await writeFile(legacyPath, '# 历史原件')
    let calls = 0
    const backup = join(temporary, 'backup')
    for (const [restart, dataPath] of [root, root, backup].entries()) {
      service = new AppService({ dataPath, engine: { run: async () => { calls++ }, decide: async () => { calls++; throw new Error('不能重放') }, extractMemory: async () => { calls++; return [] }, test: async () => '' }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
      await service.init()
      const view = await service.handle('getConversation', { id: checkpoint.conversationId }) as ConversationDetail
      const registered = await (service as unknown as { store: ProductStore }).store.load<Artifact>('artifacts')
      expect(registered.filter(value => value.name !== 'legacy.md')).toEqual(phase === 'after-commit' ? [expect.objectContaining({ id: checkpoint.artifact.id, contentHash: checkpoint.artifact.contentHash, registrationSource: 'publication' })] : [])
      expect(registered.filter(value => value.name === 'legacy.md')).toEqual([expect.objectContaining({ registrationSource: 'legacy_verified' })])
      expect(view.artifacts.filter(value => value.name !== 'legacy.md')).toHaveLength(phase === 'after-commit' ? 1 : 0)
      expect(view.workItems).toHaveLength(1)
      expect(view.workItems![0]).toMatchObject({ status: 'interrupted', requiresReview: true, resultVersion: 0 })
      expect(calls).toBe(0)
      const candidate = join(dataPath, 'workspaces', checkpoint.conversationId, 'artifacts', basename(checkpoint.artifact.path))
      expect(await readFile(candidate)).toEqual(original)
      if (restart < 2) expect((await stat(candidate)).mtimeMs).toBe(originalStat.mtimeMs)
      if (restart === 1) await service.backup(backup)
      if (restart === 2) {
        await service.handle('clearConversationHistory', { id: checkpoint.conversationId, hide: false })
        await expect(stat(candidate)).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await (service as unknown as { store: ProductStore }).store.load('artifactPublicationIntents')).toEqual([])
        expect(calls).toBe(0)
      }
      await service.close(); service = undefined
    }
  } finally { await service?.close(); await rm(temporary, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) }
}, 30000)
