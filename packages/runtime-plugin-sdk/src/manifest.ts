/*
 * [INPUT]: Runtime API v1/v2 provider manifests and serializable configuration.
 * [OUTPUT]: Pure manifest/configuration schemas; no BOAI business services or built-in brands.
 * [POS]: @boai/runtime-plugin-sdk/manifest, private workspace contract.
 * [PROTOCOL]: Update Header and .folder.md when changing this contract.
 */
import { z } from 'zod'
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
export function validateRuntimeConfig(contribution: RuntimeContribution, input: unknown = {}) {
  const shape = Object.fromEntries(Object.entries(contribution.configSchema.properties).map(([key, value]) => {
    let type: z.ZodType = value.type === 'string' ? z.string().max(4000) : value.type === 'number' ? z.number().finite() : z.boolean()
    if (value.enum) type = type.refine(v => value.enum!.includes(v as never))
    return [key, type.optional()]
  }))
  return z.object(shape).strict().parse(input) as Record<string, string | number | boolean>
}
