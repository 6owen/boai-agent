/*
 * [INPUT]: Persisted BOAI sources/resources and original removal methods after recovery.
 * [OUTPUT]: Retire the reviewed computer-use-mcp install and unchanged BOAI skill copies; preserve custom content.
 * [POS]: Upgrade cleanup before default skill seeding and new employee execution.
 * [PROTOCOL]: Update Header and resources/.folder.md on change.
 */
import type { Resource } from '@boai/shared/domain'
import type { DataSource } from '@boai/shared/domain/sources'
import { inspectResourceTree } from './local-resources'

const revision = '82dd8093e44819c51537f489059e172777d7f1d7'
// Hash of the entire shipped skill tree, including companion files.
const skillTreeHash = '550b0a078a9c14763f1a55170fe22d6e14bcbf24956b86c71f50ddc945f8fda9'
export async function retireComputerUse(input: {
  sources: DataSource[]; resources: Resource[]
  removeSource: (id: string, expectedRevision: number) => Promise<unknown>
  removeResource: (id: string) => Promise<unknown>
  failed: (error: string) => void
}) {
  for (const source of input.sources) {
    if (source.type !== 'mcp' || source.name !== 'BOAI Computer Use' || source.mcp.transport !== 'stdio' || !source.mcp.command.endsWith(`/tools/computer-use/${revision}/computer-use-mcp`) || JSON.stringify(source.mcp.args) !== '["serve"]') continue
    try { await input.removeSource(source.id, source.revision) }
    catch (error) { input.failed(`旧电脑操作连接清理未完成：${String(error)}`) }
  }
  for (const resource of input.resources) {
    if (resource.kind !== 'skill' || resource.name !== 'boai-computer-use') continue
    try {
      if ((await inspectResourceTree(resource.path)).hash !== skillTreeHash) {
        input.failed(`旧电脑操作技能包含自定义内容，已保留供手动处理：${resource.id}`)
        continue
      }
      await input.removeResource(resource.id)
    } catch (error) { input.failed(`旧电脑操作技能清理未完成：${resource.id}；${String(error)}`) }
  }
}
