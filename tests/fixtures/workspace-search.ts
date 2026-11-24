/*
 * [INPUT]: 官方 Workspace 工具及隔离夹具。
 * [OUTPUT]: 2026-11-24 第三阶段：官方 Workspace 文本及搜索夹具，保留实际业务权限边界；CLI 消费官方文本协议。
 * [POS]: 测试辅助，不进入产品运行。
 * [PROTOCOL]: 修改同步 fixtures/.folder.md。
 */
/* Native Workspace search fixture through the real employee filesystem boundary. */
import { Workspace, createWorkspaceTools, WORKSPACE_TOOLS } from '@mastra/core/workspace'
import { noopObserve } from '@mastra/core/tools'
import { employeeFilesystem } from '../../packages/runtime/src/adapters/mastra/workspace-filesystem'
import type { EngineContext } from '../../packages/runtime/src/contracts'
export async function searchWorkspace(context: Pick<EngineContext, 'signal' | 'canAccessTaskPath' | 'readTaskFile'>, root: string, pattern: string) {
  const filesystem = employeeFilesystem({ ...context, agent: { id: 'fixture' }, conversation: { id: 'fixture' } } as EngineContext, root, async file => ({ root, relative: file, mount: 'fixture' }))
  const workspace = new Workspace({ filesystem, tools: { enabled: false, [WORKSPACE_TOOLS.FILESYSTEM.GREP]: { enabled: true } } })
  try {
    await workspace.init()
    const tools = await createWorkspaceTools(workspace)
    return await tools[WORKSPACE_TOOLS.FILESYSTEM.GREP].execute({ pattern, path: '.', maxCount: 100 }, { observe: noopObserve }) as string
  } finally { await workspace.destroy() }
}
