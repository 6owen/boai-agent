/*
 * [INPUT]: Trusted window requests, catalog-verified skill folder names and the local npm executable.
 * [OUTPUT]: Direct npx skills checks and targeted updates with bounded command output and real exit status.
 * [POS]: Desktop host for local skill updates.
 * [PROTOCOL]: Update Header and main/.folder.md when changed.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { z } from 'zod'
import { programSearchPaths, resolveProgram } from '@boai/runtime/modules/backends/program'
import type { Methods } from '@boai/shared/ipc'

const skillId = z.string().regex(/^local:[a-f0-9]{64}$/)
export const localSkillCliRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('check'), id: skillId.optional() }).strict(),
  z.object({ action: z.literal('update'), id: skillId }).strict(),
  z.object({ action: z.literal('stop') }).strict(),
])
type Result = Methods['localSkillCli']['output']
type Command = 'check' | 'update'
const maxOutput = 256 * 1024

export class LocalSkillCli {
  private readonly running = new Map<string, { action: Command; result: Promise<Result>; stop: () => void }>()
  constructor(private readonly home = homedir()) {}

  run(action: Command, name?: string): Promise<Result> {
    if ((action === 'update' || name !== undefined) && !/^[a-z0-9][a-z0-9._-]{0,254}$/i.test(name ?? '')) {
      throw new Error('技能目录名不符合 skills CLI 的名称格式')
    }
    const key = name?.toLowerCase() ?? ''
    const existing = this.running.get(key)
    if (existing?.action === 'check' && action === 'check') return existing.result
    if (existing || (action === 'update' && this.running.size) || [...this.running.values()].some(job => job.action === 'update')) throw new Error('技能检查或更新正在进行，请等待完成')
    const paths = programSearchPaths()
    let program: string
    let args: string[] = []
    try {
      if (process.platform === 'win32') {
        const directory = paths.find(path => existsSync(join(path, 'node.exe')) && existsSync(join(path, 'node_modules', 'npm', 'bin', 'npx-cli.js')))
        if (!directory) throw new Error('npx unavailable')
        program = join(directory, 'node.exe')
        args = [join(directory, 'node_modules', 'npm', 'bin', 'npx-cli.js')]
      } else program = resolveProgram('npx', paths).path
    } catch { throw new Error('找不到 npx，请安装包含 npm 的 Node.js 22.20 或更高版本') }

    args.push('--yes', 'skills@1.9.0', action, '--global', '--yes')
    if (name) args.push('--', name)
    const posix = process.platform !== 'win32'
    const child = spawn(program, args, {
      cwd: this.home, detached: posix, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOME: this.home, USERPROFILE: this.home, PATH: paths.join(delimiter), DISABLE_TELEMETRY: '1', NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0' },
    })
    let output = ''
    let truncated = false
    let stopped = false
    let timedOut = false
    let failure: Error | undefined
    const kill = () => {
      if (!child.pid) return
      if (posix) {
        try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
      } else {
        const taskkill = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        taskkill.once('error', () => child.kill('SIGKILL'))
      }
    }
    const timer = setTimeout(() => { timedOut = true; kill() }, 5 * 60_000)
    const append = (data: string) => {
      const remaining = maxOutput - output.length
      if (data.length > remaining) truncated = true
      output += data.slice(0, remaining)
    }
    child.stdout.setEncoding('utf8').on('data', append)
    child.stderr.setEncoding('utf8').on('data', append)
    child.once('error', error => { failure = error })
    const result = new Promise<Result>(resolve => child.once('close', exitCode => {
      clearTimeout(timer)
      this.running.delete(key)
      const text = stripVTControlCharacters(output).trim()
      const details = [text, truncated ? '（命令输出已截断）' : '', timedOut ? 'skills CLI 检查或更新超时。' : failure?.message].filter(Boolean).join('\n')
      const available = action === 'check' && exitCode === 1 && /^↑ .+ has an update$/m.test(text) && /\d+ skill\(s\) can be updated;/m.test(text)
      const unsupported = /^No installed skills found matching:|^\d+ skill\(s\) cannot be checked automatically:/m.test(text) && !!name
      const failed = timedOut || !!failure || /^\s*✗ |^Failed to update \d+ skill\(s\)/m.test(text)
      let status: Result['status'] = 'completed'
      if (stopped) status = 'cancelled'
      else if (failed || (!available && exitCode !== 0)) status = 'failed'
      else if (available) status = 'available'
      else if (unsupported) status = 'unsupported'
      resolve({ output: details, status })
    }))
    this.running.set(key, { action, result, stop: () => { stopped = true; kill() } })
    return result
  }

  async stopCheck(): Promise<Result> {
    const check = this.running.get('')
    check?.stop()
    return check?.result ?? { status: 'cancelled', output: '' }
  }

  async close() {
    const work = [...this.running.values()]
    for (const job of work) job.stop()
    await Promise.all(work.map(job => job.result))
  }
}
