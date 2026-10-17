/*
 * [OUTPUT]: 原生来源按有界配置/环境指纹隔离续聊，Runtime API v2可选inspectSource在开会话及提交前复核；不重放旧输入或改变本机预算。
 * [OUTPUT]: Runtime API v2私有模型来源按清单/握手/会话三次核对，Pi与OpenCode明确网关接入；v1原生来源兼容，凭据不进入公共配置或回执。
 * [INPUT]: Declarative runtime package manifests; no CLI is executed during discovery.
 * [OUTPUT]: Bundled Pi/OpenCode packages and validated runtime contributions/configuration.
 * [POS]: Shared runtime registry schema; brands are data rather than business routing.
 * [PROTOCOL]: Update Header and plugins/.folder.md when changing this contract.
 */
import { z } from 'zod'
import type { ApplicationPluginManifest } from './types'
import type { RuntimeBinding } from './runtime-api'
export const runtimeId = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9.-]*$/)
const field = z.object({ type: z.enum(['string', 'number', 'boolean']), title: z.string().max(100).optional(), description: z.string().max(500).optional(), enum: z.array(z.union([z.string().max(200), z.number(), z.boolean()])).min(1).max(30).optional() }).strict()
export const runtimeContributionSchema = z.object({
  type: z.literal('agent-runtime'), providerId: runtimeId, runtimeApiVersion: z.union([z.literal(1), z.literal(2)]),
  nativeSourceIdentity: z.literal(true).optional(),
  modelSource: z.object({ protocols: z.array(z.enum(['chat', 'responses', 'messages'])).min(1).max(3).refine(values => new Set(values).size === values.length) }).strict().optional(),
  driver: z.discriminatedUnion('kind', [z.object({ kind: z.literal('builtin'), id: z.literal('acp') }).strict(), z.object({ kind: z.literal('module'), entry: z.string().min(1).max(200).regex(/^(?![./\\])(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.mjs$/) }).strict()]),
  discovery: z.object({ commands: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100)).min(1).max(8) }).strict(),
  launch: z.object({ args: z.array(z.string().max(1000)).max(16) }).strict().optional(),
  configSchemaVersion: z.literal(1),
  configSchema: z.object({ type: z.literal('object'), additionalProperties: z.literal(false), properties: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), field).refine(value => Object.keys(value).length <= 20) }).strict(),
}).strict().refine(value => !(value.modelSource || value.nativeSourceIdentity) || value.runtimeApiVersion === 2 && value.driver.kind === 'module', '外部模型来源要求Runtime API v2独立模块')
export type RuntimeContribution = z.infer<typeof runtimeContributionSchema>
export const runtimeManifestSchema = z.object({ id: runtimeId, version: z.string().regex(/^\d+\.\d+\.\d+$/), apiVersion: z.literal(2), name: z.string().min(1).max(100), description: z.string().max(500), contributions: z.array(runtimeContributionSchema).length(1) }).strict()
export type RuntimeManifest = z.infer<typeof runtimeManifestSchema>
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
export function validateRuntimeConfig(contribution: RuntimeContribution, input: unknown = {}) {
  const shape = Object.fromEntries(Object.entries(contribution.configSchema.properties).map(([key, value]) => {
    let type: z.ZodType = value.type === 'string' ? z.string().max(4000) : value.type === 'number' ? z.number().finite() : z.boolean()
    if (value.enum) type = type.refine(v => value.enum!.includes(v as never))
    return [key, type.optional()]
  }))
  return z.object(shape).strict().parse(input) as Record<string, string | number | boolean>
}
