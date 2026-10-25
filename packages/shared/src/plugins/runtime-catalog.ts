/*
 * [OUTPUT]: 原生来源按有界配置/环境指纹隔离续聊，Runtime API v2可选inspectSource在开会话及提交前复核；不重放旧输入或改变本机预算。
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [INPUT]: Declarative runtime package manifests; no CLI is executed during discovery.
 * [OUTPUT]: Bundled Pi/OpenCode packages and validated runtime contributions/configuration.
 * [POS]: Application runtime registry projection; pure schemas live in runtime-plugin-sdk.
 * [PROTOCOL]: Update Header and plugins/.folder.md when changing this contract.
 */
import type { ApplicationPluginManifest } from './types'
import type { RuntimeBinding } from '@boai/runtime-plugin-sdk'
import { runtimeManifestSchema, type RuntimeManifest, type RuntimeContribution } from '@boai/runtime-plugin-sdk/manifest'
export { runtimeId, runtimeContributionSchema, runtimeManifestSchema, validateRuntimeConfig } from '@boai/runtime-plugin-sdk/manifest'
export type { RuntimeContribution, RuntimeManifest } from '@boai/runtime-plugin-sdk/manifest'
export interface RuntimePluginSummary { manifest: RuntimeManifest; packageHash: string; enabled: boolean; bundled: boolean; inUse: number; diagnostic?: string }
export interface RuntimePluginCatalog { revision: number; plugins: RuntimePluginSummary[]; readOnly?: boolean; diagnostic?: string }
const empty = { type: 'object' as const, additionalProperties: false as const, properties: {} }
export const bundledRuntimePlugins: RuntimeManifest[] = [
  { id: 'boai.runtime.pi', version: '0.2.0', apiVersion: 2, name: 'Pi', description: '使用本机 Pi 原生 RPC、会话和工具。', contributions: [{ type: 'agent-runtime', providerId: 'pi', runtimeApiVersion: 2, nativeSourceIdentity: true, modelSource: { protocols: ['chat', 'responses', 'messages'] }, driver: { kind: 'module', entry: 'pi.mjs' }, discovery: { commands: ['pi'] }, configSchemaVersion: 1, configSchema: empty }] },
  { id: 'boai.runtime.opencode', version: '0.2.0', apiVersion: 2, name: 'OpenCode', description: '通过共用 ACP 驱动连接本机 OpenCode。', contributions: [{ type: 'agent-runtime', providerId: 'opencode', runtimeApiVersion: 2, nativeSourceIdentity: true, modelSource: { protocols: ['chat', 'responses', 'messages'] }, driver: { kind: 'module', entry: 'opencode.mjs' }, discovery: { commands: ['opencode'] }, launch: { args: ['acp'] }, configSchemaVersion: 1, configSchema: empty }] },
]
export function runtimeContribution(manifest: ApplicationPluginManifest, binding?: RuntimeBinding): RuntimeContribution {
  const value = runtimeManifestSchema.parse(manifest).contributions[0]
  if (binding && (binding.pluginId !== manifest.id || binding.providerId !== value.providerId)) throw new Error('运行时插件与连接身份不一致')
  return value
}
