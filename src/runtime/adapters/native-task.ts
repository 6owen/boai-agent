/*
 * [OUTPUT]: 原生产品工具可显式返回文字/真实图片部件；默认原JSON文本与执行方式保持。
 * [INPUT]: 本机员工已认领Work、冻结资源与宿主文件/审批/成果工具。
 * [OUTPUT]: Codex与Claude共用的宿主任务工具和真实调用回执；原权限、来源hash、技能激活和实际退出保持。
 * [POS]: 成熟本机运行时的薄工具适配，不建立另一套业务或模型循环。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import { resolve } from 'node:path'
import { createSkillTools } from '@mastra/core/workspace'
import type { EngineContext } from '../contracts'
import { createTaskRuntime } from './mastra/task-runtime'
import { prepareEnvironment, readVersionedText } from '../modules/workspaces/environment-plan'
import { summarizeMedia } from '../modules/browser/media'
export type NativeToolContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
export interface NativeTool { name: string; description: string; inputSchema: Record<string, unknown>; execute(input: unknown, callId: string): Promise<unknown>; toModelContent?(result: unknown): NativeToolContent[] }

export async function createNativeTask(context: EngineContext, runtimeName: 'Codex' | 'Claude') {
  if (!context.work || context.responseKind !== 'task') throw new Error('本机任务须认领真实工作')
  const controller = new AbortController()
  context = { ...context, signal: AbortSignal.any([context.signal, controller.signal]) }
  context.environment ??= await prepareEnvironment(context)
  const stop = () => controller.abort(new Error('本机执行阶段已退出'))
  const runtime = await createTaskRuntime(context)
  try {
    const workspaceSkills = runtime.workspace.skills
    // Explicit catalog + activation/reference reads avoid inheriting Codex's global
    // skill discovery or a cached search index outside this frozen resource set.
    const nativeSkills = workspaceSkills && runtime.skills.length ? createSkillTools(workspaceSkills) : undefined
    const available = { ...runtime.tools, ...(nativeSkills ? { skill: nativeSkills.skill, skill_read: nativeSkills.skill_read } : {}) }
    const catalog = workspaceSkills ? (await workspaceSkills.list()).map(({ name, description }) => ({ name, description })) : []
    const tools: NativeTool[] = Object.entries(available).map(([name, tool]) => ({
      name, description: tool.description ?? name,
      inputSchema: z.toJSONSchema(tool.inputSchema as z.ZodType, { io: 'input' }),
      execute: async (input, callId) => {
        context.signal.throwIfAborted()
        const createdAt = new Date().toISOString()
        const event = async (status: 'running' | 'completed' | 'failed', detail: unknown) => context.onTool({ id: callId, name, status, createdAt,
          detail: (JSON.stringify(summarizeMedia(detail)) ?? '').slice(0, 2000) })
        await event('running', input)
        try {
          const validated = (tool.inputSchema as z.ZodType).parse(input)
          const requested = validated as { name?: string; skillName?: string; path?: string }
          const skill = name === 'skill' || name === 'skill_read' ? runtime.skills.find(item => [item.name, item.path].includes(requested.name ?? requested.skillName ?? '')) : undefined
          if (name === 'skill' || name === 'skill_read') {
            if (!skill) throw new Error('技能不属于本次员工获准资源')
            // Mastra may cache parsed instructions. Verify source bytes even when
            // its cache serves the result; a mid-run edit is not the frozen version.
            const versions = context.environment!.skills.filter(version => version.resource.id === skill.id)
            await readVersionedText(resolve(skill.path, 'SKILL.md'), versions)
            if (name === 'skill_read') await readVersionedText(resolve(skill.path, requested.path!), versions)
            context.signal.throwIfAborted()
          }
          const result = await tool.execute!(validated as never, { agent: { toolCallId: callId }, abortSignal: context.signal } as never)
          context.signal.throwIfAborted()
          if (name === 'skill' && skill && typeof result === 'string' && !result.startsWith('Skill "')) await context.onSkillActivated?.(callId, { id: skill.id, name: skill.name })
          await event('completed', result)
          return result
        } catch (error) { await event('failed', error instanceof Error ? error.message : '工具执行失败'); throw error }
      },
    }))
    const prefix = runtimeName === 'Codex' ? 'boai.' : 'mcp__boai__'
    return { ...runtime, instructions: runtime.instructions
      + `\nThe boai namespace consists of client-executed tools supplied by the BoAI product host. Native ${runtimeName} shell, filesystem mutation and native permission escalation remain unavailable. The denied native approval categories do not describe these client tools: use the current boai tool definitions and actual returned host receipts to determine their availability. If execute_command is present, calling ${prefix}execute_command submits the exact command to the original-chat approval UI and waits; it does not execute before that approval. Do not separately request native sandbox permissions or claim that the command is already approved or executed. The host can refuse it; do not retry or use another tool to bypass a refusal.`
      + '\nBound skill catalog (metadata, not instructions or permissions). Use skill to load applicable instructions and skill_read for listed references: ' + JSON.stringify(catalog), tools, stop }
  } catch (error) { stop(); await runtime.dispose(); throw error }
}
