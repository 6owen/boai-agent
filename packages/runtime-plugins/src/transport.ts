/*
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [INPUT]: Verified launch configuration and strict LF native JSON streams.
 * [OUTPUT]: Native child ownership, bounded frames, correlated requests and zero automatic replay.
 * [POS]: Bundled SDK utility; parent runner is supervised by BOAI's process guard.
 * [PROTOCOL]: Update Header and plugins/.folder.md when changing transport.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { randomUUID } from 'node:crypto'
import type { RuntimeLaunch } from '@boai/runtime-plugin-sdk'
export function launchNative(launch: RuntimeLaunch, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawn(launch.runtime === 'node' ? process.execPath : launch.executable, [...(launch.runtime === 'node' ? [launch.executable] : []), ...args], { cwd: launch.cwd, env: { ...env, ...(launch.runtime === 'node' ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
}
export class JsonLines {
  private pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  private fault?: Error
  private buffer = ''
  private decoder = new StringDecoder('utf8')
  readonly exited: Promise<void>
  constructor(readonly child: ChildProcessWithoutNullStreams, private readonly event: (value: any) => void) {
    this.exited = new Promise(resolve => { child.once('close', () => { this.fail(new Error('原生连接已退出；未确认请求保持未知')); resolve() }); child.once('error', error => this.fail(error)) })
    child.stdout.on('data', (bytes: Buffer) => {
      this.buffer += this.decoder.write(bytes)
      let index: number
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).replace(/\r$/, ''); this.buffer = this.buffer.slice(index + 1)
        if (Buffer.byteLength(line) > 64 * 1024 * 1024) { this.fail(new Error('原生事件超过单帧限制')); child.kill(); return }
        if (!line.trim()) continue
        try { const value = JSON.parse(line), call = value.type === 'response' && this.pending.get(value.id)
          if (call) { this.pending.delete(value.id); clearTimeout(call.timer); if (value.success) call.resolve(value.data); else call.reject(new Error(String(value.error ?? '原生请求被拒绝'))) }
          else this.event(value)
        } catch (error) { this.fail(error instanceof Error ? error : new Error('无效原生事件')); child.kill(); return }
      }
      if (Buffer.byteLength(this.buffer) > 64 * 1024 * 1024) { this.fail(new Error('原生事件超过单帧限制')); child.kill() }
    })
    child.stderr.resume(); child.stdin.on('error', error => this.fail(error))
  }
  private fail(error: Error) { this.fault ??= error; for (const call of this.pending.values()) { clearTimeout(call.timer); call.reject(error) } this.pending.clear() }
  write(value: unknown) { if (this.fault) throw this.fault; this.child.stdin.write(JSON.stringify(value) + '\n') }
  request(type: string, data: Record<string, unknown> = {}, timeoutMs = 30000): Promise<any> {
    if (this.fault) return Promise.reject(this.fault)
    const id = randomUUID()
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${type}回执未知；不能重放原请求`)) }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer }); try { this.write({ ...data, type, id }) } catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error) }
    })
  }
  async close() { this.child.kill('SIGTERM'); const timer = setTimeout(() => this.child.kill('SIGKILL'), 1000); try { await this.exited } finally { clearTimeout(timer) } }
}
