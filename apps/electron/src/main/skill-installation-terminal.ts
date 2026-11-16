/*
 * [INPUT]: Explicit skills.sh item identity and main-window-owned terminal requests.
 * [OUTPUT]: One guarded interactive CLI installation per request, with fixed arguments and isolated ledger.
 * [POS]: Desktop skill installation host; no employee or model execution.
 * [PROTOCOL]: Update Header and main/.folder.md when changed.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { SkillInstallationTerminalRequest, WorkspaceTerminalResponse } from '@boai/shared/ipc/workspace-terminal'
import { WorkspaceTerminalService } from './workspace-terminal/service'

export function skillInstallCommand(source: string) {
  const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*)$/.exec(source)
  if (!match || match.slice(1).some(part => part === '.' || part === '..')) throw new Error('技能来源必须为 owner/repository/skill')
  return `npx --yes skills@1.8.1 add '${match[1]}/${match[2]}' --skill '${match[3]}' --global --agent codex --yes; exit $?`
}

export class SkillInstallationTerminal {
  private readonly clientEpochs = new Map<number, number>()
  private readonly operations = new Map<string, { source: string; clientId: number; result: Promise<WorkspaceTerminalResponse> }>()
  private readonly terminals: WorkspaceTerminalService
  private ready?: Promise<void>
  constructor(dataPath: string) {
    this.terminals = new WorkspaceTerminalService(join(dataPath, 'skill-installer'), {
      resolveScope: async scope => {
        if (scope.employeeId !== 'skill-installer' || !this.operations.has(scope.conversationId)) throw new Error('安装终端来源无效')
        return homedir()
      },
    })
  }
  async handle(clientId: number, input: SkillInstallationTerminalRequest): Promise<WorkspaceTerminalResponse> {
    if (input.action !== 'install') {
      if (['create', 'list'].includes(input.action)) throw new Error('安装终端不能创建通用工作区')
      return this.terminals.handle(clientId, input)
    }
    const value = z.object({ action: z.literal('install'), requestId: z.string().uuid(), source: z.string().min(1).max(240) }).strict().parse(input)
    const epoch = this.clientEpochs.get(clientId) ?? 0
    const command = skillInstallCommand(value.source)
    const prior = this.operations.get(value.requestId)
    if (prior) {
      if (prior.source !== value.source || prior.clientId !== clientId) throw new Error('安装请求身份已被使用')
      return prior.result
    }
    if (this.operations.size >= 128) throw new Error('安装终端记录已满，请重新启动应用')
    const result = Promise.resolve().then(async () => {
      this.ready ??= this.terminals.recover().catch(error => { this.ready = undefined; throw error })
      await this.ready
      if ((this.clientEpochs.get(clientId) ?? 0) !== epoch) throw new Error('原安装页面已失效，请重新打开')
      return this.terminals.startCommand(clientId, value.requestId, { employeeId: 'skill-installer', conversationId: value.requestId }, command)
    })
    this.operations.set(value.requestId, { source: value.source, clientId, result })
    return result
  }
  releaseClient(id: number) { this.clientEpochs.set(id, (this.clientEpochs.get(id) ?? 0) + 1); this.terminals.releaseClient(id) }
  close() { return this.terminals.close() }
  resumeAfterShutdown() { this.terminals.resumeAfterShutdown(); this.ready = undefined; this.operations.clear() }
}
