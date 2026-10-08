/*
 * [INPUT]: 已知 Agent 命令注册表、获准搜索路径及无凭据登录来源。
 * [OUTPUT]: 只读实际可执行文件后才产生候选；保存协议/来源/程序身份，未接入的程序只报告发现。
 * [POS]: main/local-configs 的可扩展程序发现；不运行程序、不读取 Claude 个人登录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { localAgentPrograms, type DetectedLocalAgent, type DetectedOAuthConfig } from '../../shared/domain/local-configs'
import { resolveProgram } from '../../runtime/modules/backends/program'
import { CLAUDE_PROGRAM_LIMIT } from '../../runtime/adapters/claude/policy'

export function discoverAgentPrograms(paths: string[] | undefined, logins: DetectedOAuthConfig[], directoryOnly = false) {
  const found: { candidate: DetectedLocalAgent; hash: string }[] = []
  for (const entry of localAgentPrograms) {
    let program
    try { program = resolveProgram(entry.command, paths, entry.protocol === 'claude-cli' ? CLAUDE_PROGRAM_LIMIT : undefined) }
    catch { continue }
    const sources = ['codex', 'codex-acp'].includes(entry.command) ? logins : []
    if (directoryOnly && !sources.length) continue
    for (const source of sources.length ? sources : [undefined]) {
      found.push({
        hash: program.hash,
        candidate: {
          candidateId: createHash('sha256').update(JSON.stringify([entry.command, program.path, source?.configId])).digest('hex'),
          name: entry.name, executable: program.path, protocol: entry.protocol,
          availability: entry.protocol ? 'available' : 'unsupported',
          ...(source ? { localConfigId: source.configId, sourcePath: source.sourcePath } : {}),
        },
      })
    }
  }
  return found
}
