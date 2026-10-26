/*
 * [OUTPUT]: 原生来源按有界配置/环境指纹隔离续聊，Runtime API v2可选inspectSource在开会话及提交前复核；不重放旧输入或改变本机预算。
 * [INPUT]: Runtime API v2 private source and the verified OpenCode native program.
 * [OUTPUT]: Per-process model configuration over the shared ACP driver; native tools/configuration stay intact.
 * [POS]: Concrete OpenCode source adapter; generic ACP v1 remains brand-independent.
 * [PROTOCOL]: Update Header and plugins/.folder.md when changing supported native versions.
 */
import type { RuntimeServices, RuntimeProvider } from '@boai/runtime-plugin-sdk'
import { createRuntime as createAcpRuntime } from './acp'
import { opencodeNativeSourceIdentity } from './native-source'
import { opencodeGatewaySource } from './gateway-source'
export const runtimeApiVersion = 2
export function createRuntime(services: RuntimeServices): RuntimeProvider {
  const source = services.modelSource, gateway = source ? opencodeGatewaySource(source) : undefined
  const runtime = createAcpRuntime(services, { ...gateway, ...(source ? { modelSource: { protocol: source.protocol, modelId: source.modelId } } : {}) })
  return { ...runtime, async inspectSource() { return { fingerprint: await opencodeNativeSourceIdentity(services.launch) } }, async probe() {
    const result = await runtime.probe()
    if (source && result.version !== '1.19.3') throw new Error('明确网关来源需要已核对的OpenCode 1.19.3')
    return { ...result, ...(result.version === '1.19.3' ? { modelSource: { protocols: ['chat', 'responses', 'messages'] as ('chat' | 'responses' | 'messages')[] } } : {}) }
  } }
}
