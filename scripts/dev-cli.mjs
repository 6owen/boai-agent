/*
 * [INPUT]: 原CLI参数及可选--client-only开发构建范围。
 * [OUTPUT]: 在当前worktree根构建CLI后执行原入口；透传参数、信号与退出状态，无参数显示帮助。
 * [POS]: CLI独立开发入口，不启动Electron，不创建隐式profile或watcher。
 * [PROTOCOL]: 修改同步scripts/.folder.md及第26组03。
 */
import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCli } from './build.mjs'
import { workspaceRoot } from './workspace-packages.mjs'

export function cliDevelopmentArguments(args) {
  const forwarded = [...args]
  const clientOnly = forwarded[0] === '--client-only'
  if (clientOnly) forwarded.shift()
  if (forwarded[0] === '--') forwarded.shift()
  return { clientOnly, args: forwarded.length ? forwarded : ['--help'] }
}

export async function runCliDevelopment(args = process.argv.slice(2)) {
  const options = cliDevelopmentArguments(args)
  await buildCli({ clientOnly: options.clientOnly })
  const child = spawn(process.execPath, [resolve(workspaceRoot, 'dist/cli/index.mjs'), ...options.args], { cwd: workspaceRoot, stdio: 'inherit', env: process.env })
  const forward = signal => () => { child.kill(signal) }
  const handlers = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, forward(signal)]))
  for (const [signal, handler] of handlers) process.on(signal, handler)
  try {
    return await new Promise((done, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => done(code ?? (signal ? 128 + (constants.signals[signal] ?? 1) : 1)))
    })
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await runCliDevelopment()
