/*
 * [INPUT]: Built identity-bound observer and isolated actual OS desktop/descendant processes.
 * [OUTPUT]: Observation stop preserves live desktops; dead-root cleanup waits for exact descendants and preserves unrelated roots.
 * [POS]: Real native-process regression, no Electron or model substitutes for exit proof.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { watchDesktopProcess } from '../packages/runtime/src/desktop-process'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error } }

export async function desktopProcessFixture() {
  const child = spawn(process.execPath, ['-e', `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});console.log(child.pid);process.on('SIGTERM',()=>{child.kill('SIGKILL');process.exit(0)});setInterval(()=>{},1000)`], { stdio: ['ignore', 'pipe', 'pipe'] })
  const exit = new Promise<void>(resolve => child.once('exit', () => resolve()))
  let output = ''
  child.stdout.on('data', bytes => { output += String(bytes) })
  await expect.poll(() => Number(output.trim()) > 1).toBe(true)
  const descendant = Number(output.trim())
  return { child, descendant, exit, async close() { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await exit; await expect.poll(() => alive(descendant)).toBe(false) } }
}

describe.skipIf(process.platform !== 'darwin')('desktop identity observer', () => {
  it('stopping observation cannot signal a live desktop or its browser processes', async () => {
    const desktop = await desktopProcessFixture(); cleanup.push(desktop.close)
    const watch = await watchDesktopProcess(desktop.child.pid!); cleanup.push(() => watch.stop())
    expect(watch.active).toBe(true)
    await watch.stop()
    expect(await watch.finished).toEqual({ exited: false })
    expect(alive(desktop.child.pid!)).toBe(true); expect(alive(desktop.descendant)).toBe(true)
  })
  it('confirms actual dead-root descendant cleanup without killing another desktop', async () => {
    const desktop = await desktopProcessFixture(), other = await desktopProcessFixture()
    cleanup.push(other.close, desktop.close)
    const watch = await watchDesktopProcess(desktop.child.pid!); cleanup.push(() => watch.stop())
    desktop.child.kill('SIGKILL'); await desktop.exit
    expect(await watch.finished).toEqual({ exited: true })
    await expect.poll(() => alive(desktop.descendant)).toBe(false)
    expect(alive(other.child.pid!)).toBe(true); expect(alive(other.descendant)).toBe(true)
  })
})
