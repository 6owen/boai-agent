/*
 * [INPUT]: Built Rovai process guard, private per-session directories and persisted same-UID ownership.
 * [OUTPUT]: Guard launch paths and orphan cleanup; never starts or repeats an Agent turn.
 * [POS]: Native transport shared resource supervision, separate from business execution.
 * [PROTOCOL]: Update adapters/.folder.md and process-guard migration evidence.
 */
import { execFile } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { promisify } from 'node:util'
const execute = promisify(execFile)
export const nativeProcessGuard = () => process.env.BOAI_NATIVE_PROCESS_GUARD || resolve('dist/native/boai-process-guard')
export async function assertNativeProcessGuard() {
  const path = nativeProcessGuard()
  try { await access(path) } catch { throw new Error('本机进程监督程序缺失，请重新运行 pnpm build 或 pnpm dev') }
  return path
}
export async function recoverNativeProcesses(dataPath: string, runtime: 'codex'|'claude') {
  if (process.platform !== 'darwin') return
  const directories = async (path: string) => { try { return (await readdir(path,{withFileTypes:true})).filter(item=>item.isDirectory()).map(item=>join(path,item.name)) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error } }
  for (const employee of await directories(join(dataPath,'agents'))) for (const session of await directories(join(employee,'workspace','sessions'))) {
    const directory = join(session,`.${runtime}-private`,'owned-processes')
    try { await access(directory) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error }
    await execute(await assertNativeProcessGuard(), ['--recover',directory],{timeout:10000,maxBuffer:65536})
  }
}
