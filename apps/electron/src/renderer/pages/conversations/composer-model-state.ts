/*
 * [OUTPUT]: Codex明确网关来源固定Responses/原模型与连接revision，进程私有provider与凭据环境；原生来源选项和非模型能力保持。
 * [INPUT]: 员工已保存连接、原生/网关模型目录及已验证直连API能力。
 * [OUTPUT]: 当前连接内模型与推理选项；局部修改保留原生权限和运行绑定。
 * [POS]: composer模型菜单纯投影，不保存或切换连接。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { Connection, DigitalAgent } from '@boai/shared/domain'
import type { NativeAgentInfo } from '@boai/shared/domain/execution'
import { gatewayEffortLevels, supportsThinkingControl, type ThinkingLevel } from '@boai/shared/domain/model-preferences'

export type ComposerModel = NonNullable<NativeAgentInfo['models']>[number]
export const effortNames: Record<string, string> = { auto: '默认', none: '无思考', off: '无思考', minimal: '最低', low: '低', medium: '中等', high: '高', xhigh: '超高', max: '最大' }
export type ComposerModelPatch = Partial<Pick<DigitalAgent, 'modelId' | 'thinkingLevel' | 'nativeOptions'>>
export function composerEfforts(agent: DigitalAgent, connection: Connection | undefined, models: ComposerModel[]) {
  const native = agent.executionBackend && agent.executionBackend.kind !== 'mastra-model'
  if (!native && connection?.gateway) {
    const levels = gatewayEffortLevels(connection, models.find(item => item.value === (agent.modelId || connection.defaultModel))?.supportedEffortLevels)
    // Keep a way back to default when a formerly advertised preference disappears.
    return levels.length || agent.thinkingLevel && agent.thinkingLevel !== 'auto' ? ['auto', ...levels] : []
  }
  if (!native) return connection && supportsThinkingControl(connection, agent.modelId) ? ['auto', 'off', 'low', 'high', 'max'] : []
  const model = models.find(item => item.value === (agent.modelId || connection?.defaultModel))
  return model?.supportedEffortLevels?.length ? ['', ...new Set(model.supportedEffortLevels)] : []
}
export function composerEffortPatch(agent: DigitalAgent, value: string): ComposerModelPatch {
  return agent.executionBackend && agent.executionBackend.kind !== 'mastra-model'
    ? { nativeOptions: { ...agent.nativeOptions, effort: value || undefined } }
    : { thinkingLevel: value as ThinkingLevel }
}
export function composerModelPatch(agent: DigitalAgent, model: ComposerModel): ComposerModelPatch {
  if ((!agent.executionBackend || agent.executionBackend.kind === 'mastra-model') && agent.thinkingLevel && agent.thinkingLevel !== 'auto' && model.supportedEffortLevels && !model.supportedEffortLevels.includes(agent.thinkingLevel)) {
    return { modelId: model.value, thinkingLevel: 'auto' }
  }
  if (model.supportedEffortLevels && agent.nativeOptions?.effort && !model.supportedEffortLevels.includes(agent.nativeOptions.effort)) {
    return { modelId: model.value, nativeOptions: { ...agent.nativeOptions, effort: undefined } }
  }
  return { modelId: model.value }
}
