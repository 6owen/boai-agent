/*
 * [INPUT]: Runtime API v2 session and text submission from BOAI.
 * [OUTPUT]: Deterministic Unicode code-point, whitespace-token and line counts; no model/files/tools.
 * [POS]: Standalone external-provider reference, compiled with only the portable SDK.
 * [PROTOCOL]: Keep manifest capabilities and this example's README accurate when behavior changes.
 */
import { RUNTIME_API_VERSION, type RuntimeCapabilities, type RuntimeFactory } from '@boai/runtime-plugin-sdk'

export const runtimeApiVersion = RUNTIME_API_VERSION
const capabilities: RuntimeCapabilities = {
  chat: 'supported', resume: 'unsupported', images: 'unsupported', tools: 'unsupported',
  actions: 'unsupported', steer: 'unsupported', followUp: 'unsupported',
}

export const createRuntime: RuntimeFactory = services => {
  let sessionId: string | undefined
  let sequence = 0
  let running = false
  const ensureActive = () => { if (services.signal.aborted) throw new Error('Text Inspector已停止') }
  return {
    async probe() {
      return { name: 'Text Inspector (deterministic example)', version: '0.1.0', protocolVersion: 1, capabilities: { ...capabilities } }
    },
    async openSession(input) {
      ensureActive()
      if (sessionId) throw new Error('Text Inspector会话已打开')
      if (input.resumeRef) throw new Error('Text Inspector不支持恢复会话')
      if (input.tools.length) throw new Error('Text Inspector不支持工具')
      sessionId = `text-inspector-${++sequence}`
      return { sessionId }
    },
    async submit(input) {
      ensureActive()
      if (!sessionId) throw new Error('Text Inspector会话未打开')
      if (running) throw new Error('Text Inspector已有输入正在处理')
      if (input.images.length) throw new Error('Text Inspector不支持图片')
      running = true
      try {
        services.emit({ type: 'input.accepted', requestId: input.requestId })
        const characters = Array.from(input.text)
        const text = [
          'Text Inspector（确定性示例）',
          `字符（Unicode码点）: ${characters.length}`,
          `词段（空白分隔）: ${input.text.trim() ? input.text.trim().split(/\s+/u).length : 0}`,
          `行数: ${input.text ? input.text.split(/\r\n|\r|\n/u).length : 0}`,
          ...(services.launch.config.includePreview === true ? ['', '文本预览（最多300个码点）:', characters.slice(0, 300).join('')] : []),
        ].join('\n')
        const id = `text-inspector-${input.requestId}`
        services.emit({ type: 'message.delta', id, delta: text })
        services.emit({ type: 'message.completed', id, text })
        return { text }
      } finally {
        running = false
        services.emit({ type: 'session.idle' })
      }
    },
    async interrupt() { running = false },
    async inspect() { return { state: running ? 'running' : 'idle' } },
    async closeSession() { sessionId = undefined; running = false },
  }
}
