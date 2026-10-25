/*
 * [OUTPUT]: 历史阶段回归专用；生产员工改由conversation.ts持续原生turn执行。
 * [OUTPUT]: 2026-10-10 真实Claude线程引用写入原runs.backend，冻结API模型来源与业务阶段保持，不继承个人订阅。
 * [OUTPUT]: Claude真实阶段/协议与退出状态沿原Trace保存，最终计量错误标为原结算阶段；观测失败不重试或改变业务。
 * [INPUT]: 宿主授权员工上下文、已验证Claude程序及明确API来源。
 * [OUTPUT]: v11私有阶段沿原disabled门禁选择尚未完成的格式器并核对布尔错误回执；旧策略会话仅在明确新消息时重建，启动不重放。组织low，交付审核/用户问题/旧依赖默认，原预算与退出结算保持。
 * [POS]: Claude员工引擎；已接原AppService/单员工表单，完整开放范围与验收归第13组06。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { join } from 'node:path'
import type { EngineContext } from '../../contracts'
import type { ProductStore } from '../storage/product-store'
import { NativeEmployeeEngine, type NativePhase, type NativePhaseInput } from '../native-employee'
import { observeNativePhase } from '../native-trace'
import { runClaudePhase, type ClaudePhaseDiagnostic } from './turn'
import { CLAUDE_VERIFIED_VERSION } from './policy'
import { claudeProvider } from './provider'

export const CLAUDE_EMPLOYEE_POLICY_VERSION = 11
export class LegacyClaudeEmployeeEngine extends NativeEmployeeEngine {
  constructor(store: ProductStore) { super(store, 'claude', CLAUDE_EMPLOYEE_POLICY_VERSION) }
  protected async phase(context: EngineContext, phase: NativePhase, input: NativePhaseInput) {
    const profile = context.runtimeProfile
    const directory = context.runtimeDirectory ?? (context.workspace && { cwd: context.workspace.workPath, privateHome: join(context.workspace.root, '.claude-private') })
    if (!profile || context.agent.executionBackend?.kind !== 'claude-local' || context.agent.executionBackend.profileId !== profile.id || profile.protocol !== 'claude-cli' || !directory) throw new Error('缺少当前员工的本机Claude执行配置')
    if (profile.args.length || profile.useExistingLogin || profile.codexHome || profile.localConfigId || profile.verified?.version !== CLAUDE_VERIFIED_VERSION) throw new Error('Claude需要已验证的受管程序和明确API来源，不使用个人订阅登录')
    if (context.connection?.id !== context.agent.connectionId || !context.apiKey.trim()) throw new Error('Claude模型连接与当前员工不一致或缺少凭据')
    const provider = claudeProvider(context.connection, context.agent.modelId)
    // Organization is a separately claimed administrative Work, not the group's business execution.
    // An accepted dependency wait only reconsiders publication; delivery and user-answer review keep defaults.
    // This verified provider/model opts into phase-specific thinking controls; the original budget stays authoritative.
    const verified = provider.baseUrl === 'https://api.deepseek.com/anthropic' && provider.model === 'deepseek-v4-pro'
    const thinking = verified && (phase === 'decision' || phase === 'memory' || phase === 'report' && !!context.work && !!context.pendingWorkWait?.dependencies.length) ? 'disabled' : undefined
    const effort = verified && (phase === 'task' && context.work?.organization) ? 'low' : undefined
    if (context.modelCallId) await context.onModelCallStarted?.(context.modelCallId, phase, thinking ? 'off' : effort)
    const finish = await observeNativePhase(context, phase, 'Claude', 'claude-cli')
    let diagnostic: ClaudePhaseDiagnostic | undefined
    try {
      const result = await runClaudePhase({ program: { executable: profile.executable, executableHash: profile.executableHash, runtime: profile.runtime, version: profile.verified.version },
        ...provider, apiKey: context.apiKey, cwd: directory.cwd, configDirectory: directory.privateHome, signal: context.signal,
        timeoutMs: input.timeoutMs ?? 120_000, instructions: input.instructions, prompt: input.prompt, images: input.images,
        sessionId: input.threadId, ephemeral: input.ephemeral, outputSchema: input.outputSchema, effort, thinking, tools: input.tools,
        onSession: async sessionId => { await context.onNativeExecution?.({ sessionId }); await input.onSession?.(sessionId) }, onDelta: input.onDelta, onStop: input.onStop,
        onDiagnostic: value => { diagnostic = value },
        onUsage: async usage => {
          if (context.modelCallId) await context.onModelCallUsage?.(context.modelCallId, usage, false)
          await context.onUsage?.(usage)
        } })
      if (result.usage) {
        if (context.modelCallId) await context.onModelCallUsage?.(context.modelCallId, result.usage, true)
        await context.onUsage?.(result.usage)
      }
      await finish(diagnostic ?? { outcome: 'completed', stage: 'returned' })
      return result
    } catch (error) {
      await finish({ ...diagnostic, outcome: context.signal.aborted ? 'cancelled' : 'failed', stage: diagnostic?.stage === 'returned' ? 'usage_settlement' : diagnostic?.stage ?? 'prepare' })
      throw error
    }
  }
}
