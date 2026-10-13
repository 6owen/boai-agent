/*
 * [INPUT]: 原 utilityProcess 的 shutdown / stopped / exit 生命周期。
 * [OUTPUT]: 仅实际 exit 才完成退出，超时终止仍等 exit；未知退出拒绝批准应用结束。
 * [POS]: 主进程退出收尾；不启动或重放业务。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
type Child = {
  on(event: 'message' | 'exit', listener: (value: unknown) => void): unknown
  once(event: 'message' | 'exit', listener: (value: unknown) => void): unknown
  removeListener(event: 'message' | 'exit', listener: (value: unknown) => void): unknown
  postMessage(message: unknown): void
  kill(): boolean
}
export function stopRuntime(child: Child, timeoutMs = 8_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let deadline: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => { clearTimeout(timeout); clearTimeout(deadline); child.removeListener('message', message); child.removeListener('exit', exit) }
    const exit = () => { cleanup(); resolve() }
    const kill = () => {
      if (deadline) return
      deadline = setTimeout(() => { cleanup(); reject(new Error('运行服务尚未确认退出，请稍后重试。')) }, 4_000)
      child.kill()
    }
    const message = (value: unknown) => { if (value && typeof value === 'object' && 'type' in value && value.type === 'stopped') kill() }
    const timeout = setTimeout(kill, timeoutMs)
    child.on('message', message)
    child.once('exit', exit)
    try { child.postMessage({ type: 'shutdown' }) } catch { kill() }
  })
}
