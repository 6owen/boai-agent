/*
 * [INPUT]: 员工已保存连接、原生模型目录及已验证API能力。
 * [OUTPUT]: 当前连接内模型与推理选项；局部修改保留原生权限和运行绑定。
 * [POS]: composer模型菜单纯投影，不保存或切换连接。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { Connection, DigitalAgent } from '@shared/domain'
import type { NativeAgentInfo } from '@shared/domain/execution'
import { supportsThinkingControl, type ThinkingLevel } from '@shared/domain/model-preferences'

export type ComposerModel = NonNullable<NativeAgentInfo['models']>[number]
export const effortNames: Record<string, string> = { auto: '默认', none: '无思考', off: '无思考', minimal: '最低', low: '低', medium: '中等', high: '高', xhigh: '超高', max: '最大' }
export type ComposerModelPatch = Partial<Pick<DigitalAgent, 'modelId' | 'thinkingLevel' | 'nativeOptions'>>
export function composerEfforts(agent: DigitalAgent, connection: Connection | undefined, models: ComposerModel[]) {
  const native = agent.executionBackend && agent.executionBackend.kind !== 'mastra-model'
  if (!native) return connection && supportsThinkingControl(connection, agent.modelId) ? ['auto', 'off', 'low', 'high', 'max'] : []
  const model = models.find(item => item.value === agent.modelId)
  return model?.supportedEffortLevels?.length ? ['', ...new Set(model.supportedEffortLevels)] : []
}
export function composerEffortPatch(agent: DigitalAgent, value: string): ComposerModelPatch {
  return agent.executionBackend && agent.executionBackend.kind !== 'mastra-model'
    ? { nativeOptions: { ...agent.nativeOptions, effort: value || undefined } }
    : { thinkingLevel: value as ThinkingLevel }
}
export function composerModelPatch(agent: DigitalAgent, model: ComposerModel): ComposerModelPatch {
  if (model.supportedEffortLevels && agent.nativeOptions?.effort && !model.supportedEffortLevels.includes(agent.nativeOptions.effort)) {
    return { modelId: model.value, nativeOptions: { ...agent.nativeOptions, effort: undefined } }
  }
  return { modelId: model.value }
}
