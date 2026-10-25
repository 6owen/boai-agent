/*
 * [INPUT]: Host scope authorization, real terminal/preview services and application actor.
 * [OUTPUT]: Preview operations remain available; terminal schemas retain old receipts but reject all new calls before execution.
 * [POS]: Application protocol adapter; does not grant command permission.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { z } from 'zod'
import type { ApplicationActor } from '@boai/shared/domain/application-protocol'
import type { TerminalScope } from '@boai/shared/domain/workspace-tools'
import { ApplicationValidationError, type ApplicationOperation } from '../application/application-service'
import type { TerminalService } from './terminal-service'
import type { PreviewService } from './preview-service'

const identity = z.string().min(1).max(200)
const scope = z.object({ employeeId: identity, conversationId: identity }).strict()
const session = z.object({ id: identity }).strict()
export function workspaceOperations(terminals: TerminalService, previews: PreviewService, authorize: (scope: TerminalScope, actor: ApplicationActor, write: boolean, directory?: string) => Promise<string>, show: (scope: TerminalScope & { view: 'terminal' | 'preview' }) => void = () => {}, desktopAvailable = () => true): ApplicationOperation[] {
  const operation = (name: string, description: string, input: z.ZodType, effect: 'read' | 'write', execute: (input: any, actor: ApplicationActor) => Promise<unknown>): ApplicationOperation => ({
    name, description, input, effect, resultType: name, available: () => ['darwin', 'linux'].includes(process.platform),
    validate: async (input, actor) => {
      if (name === 'workspace.show' && input.view === 'terminal' || name === 'workspace.close' && input.terminalIds.length) throw new ApplicationValidationError('INVALID_INPUT', '会话终端已移除，请使用网页预览。')
      try {
        const target = input.employeeId ? input : name.startsWith('terminal.') ? terminals.info(input.id) : previews.status(input.id)
        await authorize(target, actor, effect === 'write', input.directory)
      } catch (error) { throw new ApplicationValidationError('INVALID_INPUT', error instanceof Error ? error.message : '当前终端或预览不可用') }
    },
    execute: (input, _request, actor) => execute(input, actor),
  })
  const terminalAuth = async (id: string, actor: ApplicationActor, write: boolean) => authorize(terminals.info(id), actor, write)
  const receiptScope = (id: string) => { const s = terminals.info(id); return { employeeId: s.employeeId, conversationId: s.conversationId } }
  const previewAuth = async (id: string, actor: ApplicationActor, write: boolean) => authorize(previews.status(id), actor, write)
  return [
    { ...operation('workspace.show', '打开当前会话的网页预览侧栏；不自动启动服务器。', scope.extend({ view: z.enum(['terminal', 'preview']) }), 'write', async (input, actor) => { await authorize(input, actor, false); show(input); return { ...input, requested: true } }), available: desktopAvailable },
    operation('workspace.close', '结束明确指定的网页预览，返回已确认的最终状态；terminalIds仅兼容空数组。', scope.extend({ terminalIds: z.array(identity).max(16), previewIds: z.array(identity).max(16) }), 'write', async (input, actor) => {
      await authorize(input, actor, true)
      const targets: ReturnType<PreviewService['status']>[] = input.previewIds.map((id: string) => previews.status(id))
      if (targets.some(item => item.employeeId !== input.employeeId || item.conversationId !== input.conversationId)) throw new ApplicationValidationError('INVALID_INPUT', '待关闭的进程不属于指定员工会话')
      const pages = await Promise.all(input.previewIds.map((id: string) => previews.stop(id)))
      return { employeeId: input.employeeId, conversationId: input.conversationId, previews: pages, terminals: [] }
    }),
    operation('terminal.list', '列出员工当前会话的持久终端；服务重启后不会重放命令。', scope, 'read', async (input, actor) => { await authorize(input, actor, false); return terminals.list(input) }),
    operation('terminal.create', '在会话工作区或明确目录创建真实持久 shell；员工需要完全访问和命令权限。', scope.extend({ directory: z.string().max(4096).optional(), title: z.string().max(80).optional() }), 'write', async (input, actor) => terminals.create(input, await authorize(input, actor, true, input.directory), input.title)),
    operation('terminal.read', '按游标读取真实终端输出及上次 exec 状态。', session.extend({ cursor: z.number().int().nonnegative().optional() }), 'read', async (input, actor) => { await terminalAuth(input.id, actor, false); return { ...terminals.read(input.id, input.cursor), execution: terminals.execution(input.id) } }),
    operation('terminal.exec', '在同一 shell 执行命令，保留 cd/export。等待超时返回 running，不重放、不假定完成。', session.extend({ command: z.string().min(1).max(30000), waitMs: z.number().int().min(100).max(120000).optional() }), 'write', async (input, actor) => { await terminalAuth(input.id, actor, true); return { ...await terminals.exec(input.id, input.command, input.waitMs), ...receiptScope(input.id), sessionId: input.id } }),
    operation('terminal.write', '输入原始终端文本；换行执行，\\u0003 发送 Ctrl+C。', session.extend({ data: z.string().max(30000) }), 'write', async (input, actor) => { await terminalAuth(input.id, actor, true); await terminals.write(input.id, input.data); return { accepted: true, ...receiptScope(input.id) } }),
    operation('terminal.resize', '调整同一个终端的列数和行数。', session.extend({ cols: z.number().int().min(10).max(500), rows: z.number().int().min(2).max(300) }), 'write', async (input, actor) => { await terminalAuth(input.id, actor, true); terminals.resize(input.id, input.cols, input.rows); return { accepted: true, ...receiptScope(input.id) } }),
    operation('terminal.kill', '结束终端及其子进程，等待实际退出。', session, 'write', async (input, actor) => { await terminalAuth(input.id, actor, true); return terminals.kill(input.id) }),
    operation('preview.detect', '读取目录中的静态首页和开发脚本；不安装或执行依赖。', scope.extend({ directory: z.string().max(4096).optional() }), 'read', async (input, actor) => previews.detect(await authorize(input, actor, false, input.directory))),
    operation('preview.list', '读取当前会话真实预览状态和 URL。', scope, 'read', async (input, actor) => { await authorize(input, actor, false); return previews.list(input) }),
    operation('preview.start', '启动真实回环预览；省略 command 提供静态文件服务，开发命令用 {{port}} 绑定所分配端口。', scope.extend({ directory: z.string().max(4096).optional(), command: z.string().min(1).max(10000).optional() }), 'write', async (input, actor) => previews.start(input, await authorize(input, actor, true, input.directory), input.command)),
    operation('preview.stop', '关闭预览监听和所属开发进程。', session, 'write', async (input, actor) => { await previewAuth(input.id, actor, true); return previews.stop(input.id) }),
  ].map(item => item.name.startsWith('terminal.') ? { ...item, description: '已移除的会话终端操作，仅保留历史回执兼容。', available: () => false, unavailableReason: '会话终端已移除，请使用网页预览或员工原执行工具。' } : item)
}
