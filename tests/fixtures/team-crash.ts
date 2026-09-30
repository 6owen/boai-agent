/*
 * [INPUT]: 隔离数据目录和实际创建断点。
 * [OUTPUT]: 构建生产宿主子进程、等待断点后 SIGKILL 并回收进程/构建缓存。
 * [POS]: Vitest/Electron BDD 共用的原生中断支撑。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { fork } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
export async function interruptTeamCreation(dataPath: string, phase: string) {
  const cache = resolve('node_modules/.cache'); await mkdir(cache, { recursive: true })
  const runtime = await mkdtemp(join(cache, 'team-crash-')), outfile = join(runtime, 'runner.mjs')
  try {
    await build({ entryPoints: ['tests/fixtures/team-creation-process.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
    const child = fork(outfile, [dataPath, phase], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    let diagnostics = ''; child.stderr?.on('data', data => { diagnostics += data })
    try {
      return await new Promise<{ operationId: string; draftId: string; memberIds: { memberKey: string; agentId: string }[] }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('未到达创建断点：' + diagnostics)), 15000)
        child.once('message', value => { clearTimeout(timer); resolve(value as never) })
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`fixture exited ${code}: ${diagnostics}`)) })
        child.once('error', error => { clearTimeout(timer); reject(error) })
      })
    } finally {
      if (child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited }
    }
  } finally { await rm(runtime, { recursive: true, force: true }) }
}
