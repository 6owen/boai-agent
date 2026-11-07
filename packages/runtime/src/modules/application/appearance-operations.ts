/*
 * [OUTPUT]: 新配置发现和写入要求真实本人来源，后台behavior即使原有manage权限也不能调用。
 * [INPUT]: Shared appearance command contract and the same-profile desktop host.
 * [OUTPUT]: Versioned appearance commands, dynamic options and independent icon status through the original facade.
 * [POS]: Thin configuration adapter; Main remains the only preference writer.
 * [PROTOCOL]: Changes must update this Header and application/.folder.md.
 */
import { z } from 'zod'
import { appearancePatchSchema } from '@boai/shared/appearance/schema'
import { appearanceOptions } from '@boai/shared/appearance/options'
import { availableThemes } from '@boai/shared/appearance'
import { ApplicationHostError, type ApplicationHostPort } from '@boai/shared/ipc/application-host'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'
import type { ApplicationPort } from './operations'

const empty = z.object({}).strict(), revision = z.number().int().nonnegative()
const command = z.object({ patch: appearancePatchSchema, expectedRevision: revision }).strict()
export function appearanceOperations(port: ApplicationPort, host?: ApplicationHostPort): ApplicationOperation[] {
  const execute = async <T>(action: () => Promise<T>) => {
    try { return await action() } catch (error) {
      if (error instanceof ApplicationHostError) throw new ApplicationValidationError(error.code, error.message)
      throw error
    }
  }
  const operations: ApplicationOperation[] = [
    { name: 'appearance.get', description: '读取已保存外观、实际主题及revision；只读不创建回执。', effect: 'read', input: empty, resultType: 'AppearanceSnapshot', execute: () => port.request('getAppearance', undefined) },
    { name: 'appearance.themes', description: '列出当前可选择的明暗主题，排除已停用主题插件。', effect: 'read', input: empty, resultType: 'Theme[]', execute: async () => availableThemes((await port.request('getPluginSettings', undefined)).disabledIds) },
    { name: 'appearance.options', description: '读取实际字体、字号、缩放、图标、背景效果及兼容字段说明；不提供新图片导入。', effect: 'read', input: empty, resultType: 'AppearanceOptions', execute: async () => {
      const [snapshot, plugins] = await Promise.all([port.request('getAppearance', undefined), port.request('getPluginSettings', undefined)])
      return appearanceOptions({ disabledPluginIds: plugins.disabledIds, platform: process.platform, hasBackground: !!snapshot.preferences.background.assetId })
    } },
    { name: 'appearance.iconStatus', description: '读取图标独立应用结果；仅当前requestedId与目标appliedId一致且非pending才证明该目标已更新。', effect: 'read', input: empty, resultType: 'AppIconStatus', execute: () => port.request('getAppIconStatus', undefined) },
    { name: 'appearance.update', contractVersion: 2, description: '按revision最小修改外观；主题选择清除该模式旧自定义色，界面字号默认同步内容字号。', effect: 'write', input: command, resultType: 'AppearanceSnapshot',
      execute: input => execute(() => port.request('updateAppearance', { ...input, contractVersion: 2 })),
      legacy: { input: command, execute: input => execute(() => port.request('updateAppearance', { ...input, contractVersion: 1 })) } },
    { name: 'appearance.reset', contractVersion: 2, description: '用户明确要求时按revision恢复默认外观。冲突不覆盖，成功只证明保存。', effect: 'write', input: z.object({ expectedRevision: revision }).strict(), resultType: 'AppearanceSnapshot', execute: input => execute(() => port.request('resetAppearance', input)) },
    { name: 'appearance.removeBackground', contractVersion: 2, description: '按revision移除已有背景，恢复原纯色配置。', effect: 'write', input: z.object({ expectedRevision: revision }).strict(), resultType: 'AppearanceSnapshot', execute: input => execute(() => port.request('removeAppearanceBackground', input)) },
  ]
  return operations.map(operation => ({
    ...operation,
    ...((operation.effect === 'write' || operation.name === 'appearance.options' || operation.name === 'appearance.iconStatus') ? { validate: async (_input: unknown, actor: Parameters<NonNullable<ApplicationOperation['validate']>>[1]) => {
      if (actor.kind === 'behavior') throw new ApplicationValidationError('FORBIDDEN', '外观配置需要当前本人消息来源，后台行为不能代为调整。')
    } } : {}),
    available: () => host?.available ?? false, unavailableReason: '需要连接同一配置目录的 BOAI 桌面宿主。',
  }))
}
