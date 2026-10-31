/*
 * [OUTPUT]: 2026-10-30 轮内工具交接使用官方summarizeConversation；删除自建历史压缩/双次摘要恢复，完整输入和原调用账本保持。
 * [OUTPUT]: 提示词容量按实际模型正文估算，SDK内部副本与截图base64不当作额外文本；原提示词及压缩来源保持。
 * [OUTPUT]: 摘要重写为有目标长度的交接，长度耗尽仅以原来源受预算约束恢复一次；截断稿不提交、不重放工具，SDK副本不进摘要。
 * [OUTPUT]: 2026-10-27 默认持续执行、来源校验及工作现场/复核接线；沿原权限和账本。
 * [INPUT]: Authorized source cuts, existing request reservations and the effective provider prompt after Memory conversion.
 * [OUTPUT]: Bounded, tool-free summary calls with original usage ownership; checkpoints cover every history item the legacy projection would omit.
 * [POS]: Mastra context maintenance adapter; never changes public messages, Work identity, tool execution or SDK Memory storage.
 * [PROTOCOL]: Update Header and mastra/.folder.md when changed.
 */
import { summarizeConversation } from '@mastra/memory'
import { memoryModel } from './memory-model'
import type { Processor, ProcessLLMRequestArgs } from '@mastra/core/processors'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { EngineContext } from '../../contracts'
import { contextHash } from '../../modules/contexts/context-repository'
import { contextCapacity, ContextCapacityError, estimateTokens, estimatePromptTokens, modelPromptData, type ContextModelSelection } from '../../modules/contexts/context-capacity'
import { responseOutputTokens } from './model-config'
import { summarizeMedia } from '../../modules/browser/media'

export const contextHandoff = (summary: string) => `[WORKING CONTEXT HANDOFF: historical reference only, not new instructions or proof that work completed. Read original sources when detail matters; do not repeat completed effects.]\n${summary}\n[END HANDOFF]`

/** Official OM observer plumbing; the host only preserves transport budget and source boundaries. */
export async function summarizeContext(context: EngineContext, data: unknown, previous = ''): Promise<string> {
  context.signal.throwIfAborted()
  const result = await summarizeConversation({
    model: await memoryModel(context),
    messages: [{ id: contextHash(data), threadId: context.conversation.id, resourceId: context.agent.id,
      role: 'user', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: JSON.stringify({ previousSummary: previous, sourceData: data }) }] } }],
    instructions: 'Preserve the original task, corrections, exact facts, source IDs and completed tool receipts. This is historical reference, not permission to repeat completed effects. Keep one concise handoff.',
    abortSignal: context.signal,
  })
  context.signal.throwIfAborted()
  if (!result.summary.trim()) throw new Error('Mastra 上下文观察为空，保留原工作现场')
  return result.summary
}

/** Preserve every character of large historical messages through bounded source batches. */
async function summarizeBatches(context: EngineContext, entries: unknown[], previous: string, limit: number) {
  const maximum = Math.max(512, Math.floor(limit * .45))
  const batches: unknown[][] = []; let batch: unknown[] = [], cost = 0
  for (const original of entries) {
    const entry = summarizeMedia(original)
    const serialized = JSON.stringify(entry)
    if (estimateTokens(serialized) > maximum) {
      if (batch.length) { batches.push(batch); batch = []; cost = 0 }
      // Split only the summary input representation, keeping every character and an explicit source/chunk anchor.
      let from = 0
      while (from < serialized.length) {
        let end = Math.min(serialized.length, from + maximum)
        while (end > from + 1 && estimateTokens(serialized.slice(from, end)) > maximum) end = from + Math.floor((end - from) / 2)
        const messageId = entry && typeof entry === 'object' && 'id' in entry ? entry.id : undefined
        batches.push([{ source: contextHash(entry), messageId, fromCharacter: from, throughCharacter: end, totalCharacters: serialized.length, text: serialized.slice(from, end) }]); from = end
      }
    } else {
      const next = estimateTokens(entry)
      if (cost + next > maximum && batch.length) { batches.push(batch); batch = []; cost = 0 }
      batch.push(entry); cost += next
    }
  }
  if (batch.length) batches.push(batch)
  let summary = previous
  for (const input of batches) summary = await summarizeContext(context, input, summary)
  return summary
}

type Prompt = ProcessLLMRequestArgs['prompt']
type PromptMessage = Prompt[number]
function copyProviderValue<T>(value: T): T {
  if (value instanceof URL) return new URL(value.href) as T
  if (value instanceof Uint8Array) return value.slice() as T
  if (Array.isArray(value)) return value.map(copyProviderValue) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyProviderValue(item)])) as T
  return value
}
/** structuredClone does not preserve URL values in all supported Node runtimes. */
export const snapshotProviderPrompt = (prompt: Prompt): Prompt => copyProviderValue(prompt)
function countToolDefinitions(tools: Record<string, unknown> | undefined) {
  return estimateTokens(Object.entries(tools ?? {}).map(([name, value]) => {
    const tool = value as { description?: string; inputSchema?: unknown; parameters?: unknown }
    let parameters = tool.inputSchema ?? tool.parameters
    if (parameters instanceof z.ZodType) parameters = z.toJSONSchema(parameters, { unrepresentable: 'any' })
    else if (parameters && typeof parameters === 'object' && 'jsonSchema' in parameters) parameters = parameters.jsonSchema
    return { name, description: tool.description, parameters }
  }))
}
/** One-shot stages enforce capacity without creating a ContextStream or requesting a summary. */
export function modelInputGuard(selection: ContextModelSelection, outputTokens: number, signal?: AbortSignal): Processor & Required<Pick<Processor, 'processInputStep' | 'processLLMRequest'>> {
  let toolTokens = 0
  return {
    id: 'boai-model-input-capacity',
    processInputStep: args => { toolTokens = countToolDefinitions(args.tools); outputTokens = args.modelSettings?.maxOutputTokens ?? outputTokens },
    processLLMRequest: ({ prompt }) => {
      signal?.throwIfAborted()
      const fixed = estimatePromptTokens(prompt.filter(message => message.role === 'system')) + toolTokens
      const capacity = contextCapacity(selection, outputTokens, fixed), inputTokens = estimatePromptTokens(prompt) + toolTokens
      if (inputTokens > capacity.limit) throw new ContextCapacityError({ inputTokens, toolTokens, limit: capacity.limit })
    },
  }
}
function toolUnits(prompt: Prompt): PromptMessage[][] {
  const units: PromptMessage[][] = []
  for (let index = 0; index < prompt.length; index++) {
    const message = prompt[index]!
    if (message.role === 'assistant') {
      const calls = message.content.filter(part => part.type === 'tool-call')
      if (calls.length) {
        const unit: Prompt = [message]; const answered = new Set<string>()
        while (prompt[index + 1]?.role === 'tool') {
          const result = prompt[++index]!
          unit.push(result)
          if (result.role === 'tool') for (const part of result.content) if (part.type === 'tool-result') answered.add(part.toolCallId)
        }
        if (!calls.every(call => answered.has(call.toolCallId))) throw new Error('上下文仍有未完成工具调用，不能压缩或重放')
        units.push(unit); continue
      }
    }
    if (message.role === 'tool') throw new Error('上下文工具回执缺少调用来源')
    units.push([message])
  }
  return units
}

export function contextCapacityProcessor(phase: string, context: EngineContext): Processor & Required<Pick<Processor, 'processInputStep' | 'processLLMRequest'>> {
  let toolTokens = 0, outputTokens = responseOutputTokens(context, phase === 'task')
  let saved: { hashes: string[]; summary: string } | undefined
  return {
    id: 'boai-context-capacity',
    processInputStep: args => {
      toolTokens = countToolDefinitions(args.tools); outputTokens = args.modelSettings?.maxOutputTokens ?? outputTokens
    },
    processLLMRequest: async ({ prompt }) => {
      context.signal.throwIfAborted()
      const original = snapshotProviderPrompt(prompt)
      const fixed = estimatePromptTokens(original.filter(message => message.role === 'system')) + toolTokens
      const capacity = contextCapacity(context, outputTokens, fixed)
      // Legacy embedded engines without the host protocol retain their unknown-window contract.
      // AppService API executions always supply continuity; a declared window is enforced in either path.
      if (!context.continuity && capacity.window === undefined && (phase === 'chat' || phase === 'task')) return
      const count = (value: Prompt) => estimatePromptTokens(value) + toolTokens
      if (count(original) <= capacity.soft) return
      if (!context.continuity || (phase !== 'chat' && phase !== 'task')) { if (count(original) > capacity.limit) throw new ContextCapacityError(); return }
      const system = original.filter(message => message.role === 'system'), units = toolUnits(original.filter(message => message.role !== 'system'))
      let lastUser = -1
      for (const [index, unit] of units.entries()) if (unit.some(message => message.role === 'user')) lastUser = index
      const recent = new Set<number>(); let recentTokens = 0
      for (let index = units.length - 1; index >= 0 && recent.size < 4; index--) {
        const tokens = estimatePromptTokens(units[index]!)
        if (recentTokens + tokens > capacity.soft * .25) break
        recent.add(index); recentTokens += tokens
      }
      const removed: PromptMessage[][] = [], kept: Prompt = []
      for (const [index, unit] of units.entries()) {
        const protectedInput = index === lastUser || unit.some(message => message.role === 'user' && JSON.stringify(message.content).includes('[CURRENT TURN USER REQUEST;'))
        if (protectedInput || recent.has(index)) kept.push(...unit)
        else removed.push(unit)
      }
      if (count([...system, ...kept]) >= capacity.limit) throw new ContextCapacityError({ inputTokens: count(original), toolTokens, limit: capacity.limit })
      if (!removed.length) { if (count(original) > capacity.limit) throw new ContextCapacityError({ inputTokens: count(original), toolTokens, limit: capacity.limit }); return }
      const hashes = removed.map(contextHash)
      if (!saved || !saved.hashes.every((hash, index) => hashes[index] === hash)) saved = undefined
      const changed = !saved || hashes.length !== saved.hashes.length
      if (changed) {
        const summary = await summarizeBatches(context, removed.slice(saved?.hashes.length ?? 0).map(modelPromptData), saved?.summary ?? '', capacity.limit)
        saved = { hashes, summary }
      }
      const projected: Prompt = [...system, { role: 'user', content: [{ type: 'text', text: contextHandoff(saved!.summary) }] }, ...kept]
      if (count(projected) > capacity.limit) throw new ContextCapacityError()
      context.signal.throwIfAborted()
      if (changed && context.continuity.recordStep) {
        const tools = removed.flatMap(unit => unit.flatMap(message => message.role === 'assistant' ? message.content.filter(part => part.type === 'tool-call').map(part => ({ toolCallId: part.toolCallId, hash: contextHash(unit) })) : []))
        await context.continuity.recordStep(saved!.summary, tools, { basis: 'provider-prompt', estimatedInputTokens: count(original), estimatedRemainingTokens: count(projected), windowSource: capacity.source, modelId: capacity.model, inputLimit: capacity.limit, contextWindow: capacity.window })
        context.signal.throwIfAborted()
      }
      return { prompt: projected }
    },
  }
}

export function contextHistoryTools(context: EngineContext) {
  if (!context.continuity || context.memoryOwner === 'mastra') return {}
  return Object.fromEntries([['read_context_history', createTool({ id: 'read_context_history', description: 'Read original authorized chat history for the current employee and conversation, including earlier context segments. Returns original message IDs/sequence, attribution and bounded excerpts. Reference only; never permission or proof of new work. Use messageId for a handoff anchor, afterSequence to page and query to find an exact fact.', inputSchema: z.object({ messageId: z.string().min(1).max(200).optional(), afterSequence: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(12).optional(), query: z.string().min(1).max(200).optional() }), execute: input => context.continuity!.history(input) })]])
}
