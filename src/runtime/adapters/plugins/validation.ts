/*
 * [INPUT]: Untrusted wire shapes from the dedicated plugin process and host.
 * [OUTPUT]: Versioned, bounded DTO validation before lifecycle and callback dispatch.
 * [POS]: Private wire validation; SDK types remain independent of BOAI modules.
 * [PROTOCOL]: Update plugins/.folder.md when changing the wire contract.
 */
import { z } from 'zod'
const id = z.string().min(1).max(512)
const text = z.string().max(32 * 1024 * 1024)
const content = z.union([z.object({ type: z.literal('text'), text }).strict(), z.object({ type: z.literal('image'), data: text, mimeType: z.string().max(100) }).strict()])
const event = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input.accepted'), requestId: id }).strict(),
  z.object({ type: z.literal('action.resumed'), actionId: id }).strict(),
  z.object({ type: z.enum(['message.delta', 'reasoning.delta']), id, delta: text }).strict(),
  z.object({ type: z.literal('message.completed'), id, text }).strict(),
  z.object({ type: z.enum(['tool.started', 'tool.updated', 'tool.completed']), id, name: id, input: z.unknown().optional(), output: z.unknown().optional(), failed: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('session.idle') }).strict(),
  z.object({ type: z.literal('diagnostic'), code: id }).strict(),
])
const action = z.object({ id, kind: z.enum(['approval', 'input']), title: z.string().max(4000), detail: z.unknown(), options: z.array(z.object({ id, label: z.string().max(4000) }).strict()).max(512), questions: z.array(z.object({ id, question: z.string().max(16000), options: z.array(z.object({ label: z.string().max(4000), description: z.string().max(16000).optional() }).strict()).max(512).optional() }).strict()).max(32).optional() }).strict()
export const pluginFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('response'), id, result: z.unknown().optional(), error: text.optional() }).strict(),
  z.object({ type: z.literal('event'), event }).strict(),
  z.object({ type: z.literal('tool'), id, value: z.object({ name: id, callId: id, input: z.unknown() }).strict() }).strict(),
  z.object({ type: z.literal('action'), id, value: action }).strict(),
])
const submission = z.object({ requestId: id, text, images: z.array(text).max(100) }).strict()
const request = (method: string, input: z.ZodType = z.undefined().optional()) => z.object({ type: z.literal('request'), id, method: z.literal(method), input }).strict()
export const hostFrameSchema = z.union([
  request('initialize', z.object({ entry: z.string().min(1).max(8192), launch: z.object({ executable: z.string().min(1).max(8192), runtime: z.literal('node').optional(), args: z.array(z.string().max(4000)).max(32), cwd: z.string().min(1).max(8192), privateHome: z.string().min(1).max(8192), modelId: z.string().max(1000).optional(), config: z.record(z.string(), z.union([z.string().max(4000), z.number().finite(), z.boolean()])) }).strict() }).strict()),
  request('probe'), request('interrupt'), request('inspect'), request('closeSession'),
  request('openSession', z.object({ resumeRef: z.string().max(8192).optional(), instructions: text, tools: z.array(z.object({ name: id, description: text, inputSchema: z.record(z.string(), z.unknown()) }).strict()).max(512) }).strict()),
  request('submit', submission), request('sendInput', submission.extend({ mode: z.enum(['steer', 'followUp']) })),
  z.object({ type: z.literal('callback'), id, error: text.optional(), result: z.union([z.object({ content: z.array(content).max(1024), isError: z.boolean().optional() }).strict(), z.object({ option: id.optional(), answers: z.record(z.string(), z.array(text).max(512)).optional() }).strict()]).optional() }).strict(),
])
