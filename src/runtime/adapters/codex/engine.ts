/*
 * [OUTPUT]: 2026-10-10 仅chat/task开放公开摘要和commentary，decision/report/memory仅暴露固定阶段。
 * [OUTPUT]: 2026-10-10 Codex实际选用模型、原生线程和已受理turn引用进入原运行记录，保留业务阶段回执/用量及宿主工具桥。
 * [INPUT]: 宿主授权上下文、共同员工阶段和原生Codex启动项。
 * [OUTPUT]: 保留Codex本机登录、阶段参数/观测/完整用量；私有JSON沿原提示词和宿主校验，不把Claude格式器schema透传为供应商strict输出约束。
 * [POS]: Codex员工专用原生适配，业务仍归AppService/WorkRepository。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { join } from 'node:path'
import type { EngineContext } from '../../contracts'
import type { ProductStore } from '../storage/product-store'
import { NativeEmployeeEngine, type NativePhase, type NativePhaseInput } from '../native-employee'
import { runCodexPhase } from './turn'
import { observeCodexPhase } from './trace'
import { CODEX_EMPLOYEE_POLICY_VERSION } from './policy'

export class CodexEmployeeEngine extends NativeEmployeeEngine {
  constructor(store: ProductStore) { super(store, 'codex', CODEX_EMPLOYEE_POLICY_VERSION) }
  protected async phase(context: EngineContext, phase: NativePhase, input: NativePhaseInput) {
    const directory = context.runtimeDirectory ?? (context.workspace && { cwd: context.workspace.workPath, privateHome: join(context.workspace.root, '.codex-private') })
    if (!context.runtimeProfile || context.agent.executionBackend?.kind !== 'codex-local' || !directory) throw new Error('缺少当前员工的本机 Codex 执行配置')
    if (context.connection) throw new Error('本机 Codex 员工不能混用模型 API 上下文')
    const effort = phase === 'decision' || phase === 'chat' || phase === 'memory' ? 'low' : undefined
    if (context.modelCallId) await context.onModelCallStarted?.(context.modelCallId, phase, effort)
    const onDiagnostic = await observeCodexPhase(context, phase)
    // The shared optional-property schema is a Claude formatter contract, not Codex's provider strict-output schema.
    // Codex retains its verified JSON-prompt path; the shared employee layer still validates every private result.
    const result = await runCodexPhase({ ...input, outputSchema: undefined, profile: context.runtimeProfile, ...directory,
      signal: context.signal, model: context.agent.modelId || undefined, effort, onDiagnostic,
      onProgress: event => event.kind === 'stage' || phase === 'task' || phase === 'chat' ? context.onProgress?.(event) ?? Promise.resolve() : Promise.resolve(),
      onModelSelected: modelId => context.onNativeExecution?.({ modelId }) ?? Promise.resolve(),
      onSession: async sessionId => { await context.onNativeExecution?.({ sessionId }); await input.onSession?.(sessionId) },
      onSubmitted: async (sessionId, turnId) => { await context.onNativeExecution?.({ sessionId, turnId }); await input.onSubmitted?.(sessionId, turnId) },
      onUsage: async usage => { if (context.modelCallId) await context.onModelCallUsage?.(context.modelCallId, usage); await context.onUsage?.(usage) } })
    if (context.modelCallId) await context.onModelCallUsage?.(context.modelCallId, result.usage, true)
    await context.onUsage?.(result.usage)
    return result
  }
}
