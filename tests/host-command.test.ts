/*
 * [OUTPUT]: 真实进程逐字节输出中文/emoji，分别验证 stdout/stderr 跨包 UTF-8 保真。
 * [INPUT]: 隔离目录、真实POSIX后台子进程和确定性的终止信号屏障。
 * [OUTPUT]: 命令返回前核对继承进程组实际退出；覆盖主shell先退出、用户取消及超时，不把发出SIGKILL当退出。
 * [POS]: 宿主命令生命周期模块验收；Windows进程树另需平台验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeCommand } from '../src/runtime/adapters/mastra/host-command'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const clean of cleanups.splice(0).reverse()) await clean() })
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (error) { const code = (error as NodeJS.ErrnoException).code; if (code === 'ESRCH') return false; if (code === 'EPERM') return true; throw error } }
const background = `printf '%s' "$$" > parent.pid; sh -c 'printf "%s" "$$" > child.pid; while :; do sleep 1; done' </dev/null >/dev/null 2>&1 & while [ ! -s child.pid ]; do sleep 0.01; done;`
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'boai-command-exit-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  return root
}
async function pids(root: string) {
  await expect.poll(async () => readFile(join(root, 'child.pid'), 'utf8').catch(() => ''), { timeout: 3000 }).toMatch(/^\d+$/)
  return { parent: Number(await readFile(join(root, 'parent.pid'), 'utf8')), child: Number(await readFile(join(root, 'child.pid'), 'utf8')) }
}

it.skipIf(process.platform === 'win32')('decodes stdout and stderr across real UTF-8 byte boundaries independently', async () => {
  const root = await directory()
  await writeFile(join(root, 'split.cjs'), `
    const values = [Buffer.from('中文😀完成'), Buffer.from('错误🚀详情')];
    let index = 0;
    const timer = setInterval(() => {
      for (const [n, value] of values.entries()) if (index < value.length) (n ? process.stderr : process.stdout).write(value.subarray(index, index + 1));
      if (++index >= Math.max(...values.map(value => value.length))) clearInterval(timer);
    }, 15);
  `)
  const node = `'${process.execPath.replaceAll("'", "'\\''")}'`
  expect(await executeCommand(`${node} split.cjs`, root, new AbortController().signal, 5000))
    .toEqual({ exitCode: 0, stdout: '中文😀完成', stderr: '错误🚀详情', truncated: false })
})

it.skipIf(process.platform === 'win32')('retains the command until a pipe-free background child has actually exited after its shell closes', async () => {
  const root = await directory(), kill = process.kill.bind(process), controller = new AbortController()
  let release = false, requestedGroup: number | undefined, settled = false
  const spy = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (pid < 0 && signal === 'SIGKILL' && !release) { requestedGroup = pid; return true }
    return kill(pid, signal)
  })
  const result = executeCommand(background, root, controller.signal, 5000).finally(() => { settled = true })
  // Always kill only the isolated group created by this test, even if an assertion fails.
  try {
    const ids = await pids(root)
    await expect.poll(() => requestedGroup).toBe(-ids.parent)
    await expect.poll(() => alive(ids.parent)).toBe(false)
    expect(alive(ids.child)).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(settled).toBe(false)
    release = true; kill(-ids.parent, 'SIGKILL')
    expect(await result).toMatchObject({ exitCode: 0 })
    expect(alive(ids.child)).toBe(false); expect(alive(-ids.parent)).toBe(false)
  } finally {
    release = true; spy.mockRestore()
    if (requestedGroup && alive(requestedGroup)) { try { kill(requestedGroup, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
    controller.abort(); await result.catch(() => undefined)
  }
})

it.skipIf(process.platform === 'win32').each(['cancel', 'timeout'] as const)('waits for parent and child exit on %s and keeps the original failure', async mode => {
  const root = await directory(), controller = new AbortController(), reason = new Error('原工作明确停止')
  const result = executeCommand(`${background} wait`, root, controller.signal, mode === 'timeout' ? 500 : 5000)
    .then(() => undefined, error => error)
  try {
    const ids = await pids(root)
    expect(alive(ids.parent)).toBe(true); expect(alive(ids.child)).toBe(true)
    if (mode === 'cancel') controller.abort(reason)
    const error = await result
    if (mode === 'cancel') expect(error).toBe(reason)
    else expect(error).toHaveProperty('message', 'Command timed out')
    expect(alive(ids.parent)).toBe(false); expect(alive(ids.child)).toBe(false); expect(alive(-ids.parent)).toBe(false)
  } finally { controller.abort(); await result }
})
