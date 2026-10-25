/*
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [INPUT]: 当前员工/运行的目录授权、取消信号与原宿主审批。
 * [OUTPUT]: API与本机共用的独立目录申请；不认领Work、不改变cwd或授予命令执行权。
 * [POS]: 目录申请工具合同，执行权限和目标身份由RunDirectoryAccess核验。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { z } from 'zod'
import type { EngineContext } from '../../contracts'

const schema = z.object({ directory: z.string(), access: z.enum(['read-only', 'read-write']), reason: z.string().trim().min(1).max(1000) }).strict()

export function createDirectoryRequestOperation(context: Pick<EngineContext, 'agent' | 'directoryAccess' | 'signal'>) {
  if (context.agent.executionBackend && context.agent.executionBackend.kind !== 'mastra-model') return undefined
  const access = context.directoryAccess
  if (!access || context.agent.directoryGrants === undefined && context.agent.executionPermission !== 'full-access') return undefined
  return {
    name: 'request_directory',
    description: 'Request this employee’s read-only or read-write access to an existing absolute business directory before using it. The owner chooses run-only or persistent permission; full-access employees are authorized automatically. A refusal is final; never retry previous command side effects. This does not change cwd, create Work, or grant command execution permission.',
    schema,
    execute: async (input: unknown) => {
      context.signal.throwIfAborted()
      const args = schema.parse(input)
      const target = await access.authorizeDirectory(args.directory, args.access, args.reason, context.signal)
      return { directory: target.path, access: args.access, authorized: true }
    },
  }
}
