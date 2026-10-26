/*
 * [OUTPUT]: 独立目录申请在审批队列内核对现存目录；文件/缺失目标不得扩大为父目录授权。
 * [OUTPUT]: 原生命令与精确文件/目录整组批准，保留原生身份；原生权限不依赖API宿主命令开关。
 * [OUTPUT]: 命令多目录先整组核对/批准再一次接续；与文件访问共用队列及本运行授权，拒绝整组不生效。
 * [OUTPUT]: 提供受管路径排除清单供命令适配；运行结束清除临时许可，持久变更只回填目录字段。
 * [INPUT]: 单一员工/运行的冻结目录授权、取消信号与宿主原审批入口。
 * [OUTPUT]: 访问前等待明确批准、本次运行许可及批准后的真实目标复核；终态关闭后不恢复临时许可。
 * [POS]: 文件工具与命令适配共享的目录访问上下文；持久授权及回执由宿主原事务提交。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import type { DigitalAgent } from '@boai/shared/domain'
import type { DirectoryAccess, DirectoryAccessRequest, DirectoryGrant, DirectoryNativeOrigin } from '@boai/shared/domain/directory-access'
import { directoryGrantsSchema } from '@boai/shared/domain/directory-access'
import { assertDirectoryTargetCurrent, decideDirectoryAccess, type DirectoryOperation, type DirectoryTarget } from './directory-access'

export class RunDirectoryAccess {
  private temporary: DirectoryGrant[] = []
  private pending: Promise<unknown> = Promise.resolve()
  private closed = new AbortController()
  constructor(readonly agent: DigitalAgent, private options: {
    signal: AbortSignal
    protectedRoots?: string[]
    validate(): Promise<void>
    assertTarget(target: DirectoryTarget): Promise<void>
    request(request: DirectoryAccessRequest, target: DirectoryTarget, signal: AbortSignal): Promise<boolean>
    requestCommand?(command: string, cwd: string, requests: DirectoryAccessRequest[], targets: DirectoryTarget[], signal: AbortSignal, origin?: DirectoryNativeOrigin): Promise<boolean>
  }) {}
  get temporaryGrants() { return structuredClone(this.temporary) }
  get protectedRoots() { return [...this.options.protectedRoots ?? []] }
  close() { this.closed.abort(new Error('原目录授权运行已结束')); this.temporary = [] }
  acceptPersistent(agent: DigitalAgent) {
    if (agent.id !== this.agent.id || agent.configVersion !== this.agent.configVersion) throw new Error('目录批准不能修改其他员工或执行配置')
    this.agent.directoryGrants = structuredClone(agent.directoryGrants)
    this.agent.directoryRevision = agent.directoryRevision
  }
  /** Read-only authorization check, for filtered directory listing inside the host serializer. */
  async allows(value: string, operation: DirectoryOperation) {
    this.options.signal.throwIfAborted(); this.closed.signal.throwIfAborted()
    const decision = await decideDirectoryAccess(this.agent, value, operation, this.temporary)
    if (decision.kind !== 'allowed') return false
    await this.options.assertTarget(decision.target)
    return true
  }
  async verifyTarget(target: DirectoryTarget, signal?: AbortSignal) {
    signal?.throwIfAborted(); await this.options.validate()
    await assertDirectoryTargetCurrent(target)
    if (!await this.allows(target.path, target.operation)) throw new Error('目录授权已失效，操作未执行')
    signal?.throwIfAborted()
  }
  authorizeCommand(command: string, cwd: string, directories: DirectoryGrant[], localSignal?: AbortSignal, origin?: DirectoryNativeOrigin): Promise<DirectoryTarget[] | null> {
    const signal = AbortSignal.any([this.options.signal, this.closed.signal, ...(localSignal ? [localSignal] : [])])
    const actual = this.pending.then(async () => {
      signal.throwIfAborted(); await this.options.validate()
      if (!origin && !this.agent.allowCommands || this.agent.executionPermission === 'read-only') throw new Error('当前员工不允许执行命令')
      const targets: DirectoryTarget[] = [], pending = new Map<string, { request: DirectoryAccessRequest; target: DirectoryTarget }>()
      for (const directory of directoryGrantsSchema.parse(directories)) {
        const decision = await decideDirectoryAccess(this.agent, directory.path, directory.access === 'read-write' ? 'write' : 'read', this.temporary)
        if (decision.kind === 'legacy') throw new Error('请先为此员工配置目录授权，再申请命令目录')
        if (decision.kind === 'denied') throw new Error(decision.reason)
        const target = decision.target
        if (!origin && (!target.exists || target.path !== target.directory)) throw new Error('命令目录授权目标必须是已存在的目录')
        await this.options.assertTarget(target); targets.push(target)
        if (decision.kind === 'approval' && pending.get(target.directory)?.request.access !== 'read-write') {
          pending.set(target.directory, { request: { directory: target.directory, target: target.path, access: decision.access, reason: '运行此命令需要访问该目录', ...(origin ? { origin } : {}) }, target })
        }
      }
      const missing = [...pending.values()]
      if (this.agent.executionPermission !== 'full-access') {
        if (!this.options.requestCommand) throw new Error('命令目录组合审批不可用，命令未执行')
        const approved = await this.options.requestCommand(command, cwd, missing.map(item => item.request), missing.map(item => item.target), signal, origin)
        signal.throwIfAborted(); await this.options.validate()
        if (!approved) return null
      }
      // No temporary grant is installed until every approved target is still valid.
      for (const target of targets) { await assertDirectoryTargetCurrent(target); await this.options.assertTarget(target) }
      const temporary = structuredClone(this.temporary)
      for (const { request } of missing) {
        const existing = temporary.find(grant => grant.path === request.directory)
        if (existing) { if (request.access === 'read-write') existing.access = request.access }
        else temporary.push({ path: request.directory, access: request.access })
      }
      for (const target of targets) if ((await decideDirectoryAccess(this.agent, target.path, target.operation, temporary)).kind !== 'allowed') throw new Error('目录批准已失效，命令未执行')
      signal.throwIfAborted(); this.temporary = temporary
      return targets
    })
    this.pending = actual.catch(() => undefined)
    return actual
  }
  authorize(value: string, operation: DirectoryOperation, reason: string, localSignal?: AbortSignal, origin?: DirectoryNativeOrigin): Promise<DirectoryTarget> {
    return this.authorizeTarget(value, operation, reason, localSignal, origin)
  }
  authorizeDirectory(value: string, access: DirectoryAccess, reason: string, localSignal?: AbortSignal): Promise<DirectoryTarget> {
    return this.authorizeTarget(value, access === 'read-write' ? 'write' : 'read', reason, localSignal, undefined, true)
  }
  private authorizeTarget(value: string, operation: DirectoryOperation, reason: string, localSignal?: AbortSignal, origin?: DirectoryNativeOrigin, directoryOnly = false): Promise<DirectoryTarget> {
    const signal = AbortSignal.any([this.options.signal, this.closed.signal, ...(localSignal ? [localSignal] : [])])
    const actual = this.pending.then(async () => {
      signal.throwIfAborted(); await this.options.validate()
      let decision = await decideDirectoryAccess(this.agent, value, operation, this.temporary)
      if (decision.kind === 'legacy') throw new Error('该员工尚未配置业务目录授权，请使用原受管文件路径或先配置授权目录')
      if (decision.kind === 'denied') throw new Error(decision.reason)
      if (directoryOnly && (!decision.target.exists || decision.target.path !== decision.target.directory)) throw new Error('请选择实际存在的绝对目录')
      await this.options.assertTarget(decision.target)
      if (decision.kind === 'approval') {
        const target = decision.target, access = decision.access
        const approved = await this.options.request({ directory: target.directory, target: target.path, access, reason, ...(origin ? { origin } : {}) }, target, signal)
        signal.throwIfAborted(); await this.options.validate()
        if (!approved) throw new Error('用户已拒绝目录访问，操作未执行；请勿重试或绕过审批')
        await assertDirectoryTargetCurrent(target)
        await this.options.assertTarget(target)
        const existing = this.temporary.find(grant => grant.path === target.directory)
        if (existing) { if (access === 'read-write') existing.access = access }
        else this.temporary.push({ path: target.directory, access })
        decision = await decideDirectoryAccess(this.agent, target.path, operation, this.temporary)
        if (decision.kind !== 'allowed') throw new Error('目录批准已失效，操作未执行')
      }
      signal.throwIfAborted()
      await assertDirectoryTargetCurrent(decision.target)
      return decision.target
    })
    this.pending = actual.catch(() => undefined)
    return actual
  }
}
