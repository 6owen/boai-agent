/*
 * [OUTPUT]: 命令与BOAI托管MCP共用同一macOS文件策略；直接程序启动保留原argv，不经shell重新解释。
 * [OUTPUT]: 受限命令中业务目录许可排除BOAI受管存储，明确当前运行内部输入独立允许；完整权限保持宿主原行为。
 * [INPUT]: 员工当前目录许可与明确的受管输入/运行目录；安装平台与真实路径元信息。
 * [OUTPUT]: macOS命令/继承子进程的读写目录策略；旧配置及完全访问不施加目录白名单，不自动重试被拒命令。
 * [POS]: Mastra宿主命令的OS访问边界，复用原进程组退出；不是目录审批器或通用跨平台沙箱。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { realpath, stat } from 'node:fs/promises'
import type { DigitalAgent } from '../../../shared/domain'
import type { DirectoryGrant } from '../../../shared/domain/directory-access'

export type CommandDirectoryScope = { readOnly: string[]; readWrite: string[]; executables?: string[]; business?: DirectoryGrant[]; protectedRoots?: string[] }
export type DirectoryCommandBoundary = { command: string; args: string[] }

// macOS loader/system services only. No home, shared temporary tree or Applications grant.
const systemReadRoots = ['/System', '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/usr/lib', '/usr/libexec', '/usr/share', '/Library/Apple', '/private/var/db', '/private/etc']
const systemReadFiles = ['/opt/homebrew/etc/openssl@3/openssl.cnf', '/usr/local/etc/openssl@3/openssl.cnf']
const literal = (value: string) => `(literal ${JSON.stringify(value)})`
const subpath = (value: string) => `(subpath ${JSON.stringify(value)})`

async function pathRule(value: string, canonicalRequired = false) {
  if (/[\x00-\x1f\x7f]/u.test(value)) throw new Error('目录路径不能包含控制字符')
  const canonical = await realpath(value)
  if (canonicalRequired && canonical !== value) throw new Error('已授权目录被替换，请重新核对目录')
  return (await stat(canonical)).isDirectory() ? subpath(canonical) : literal(canonical)
}

/** Directory constraints are opt-in; full-access still runs with the user's actual OS permissions. */
export async function employeeCommandScope(agent: Pick<DigitalAgent, 'directoryGrants' | 'executionPermission'>, internal: CommandDirectoryScope, temporary: readonly DirectoryGrant[] = [], protectedRoots: string[] = []): Promise<CommandDirectoryScope | undefined> {
  if (agent.directoryGrants === undefined || agent.executionPermission === 'full-access') return undefined
  const grants = [...agent.directoryGrants, ...temporary]
  for (const grant of grants) {
    if (await realpath(grant.path) !== grant.path || !(await stat(grant.path)).isDirectory()) throw new Error('已授权目录不可用或已变化，请重新核对目录')
  }
  const readOnly = internal.readOnly
  const readWrite = agent.executionPermission === 'read-only' ? [] : internal.readWrite
  return {
    readOnly: [...new Set(await Promise.all([...readOnly, ...internal.readWrite].map(value => realpath(value))))],
    readWrite: [...new Set(await Promise.all(readWrite.map(value => realpath(value))))],
    executables: internal.executables,
    business: grants.map(grant => ({ ...grant, access: agent.executionPermission === 'read-only' ? 'read-only' : grant.access })),
    protectedRoots: await Promise.all(protectedRoots.map(value => realpath(value))),
  }
}

export async function directoryCommandBoundary(command: string, scope: CommandDirectoryScope): Promise<DirectoryCommandBoundary> {
  return directoryProcessBoundary('/bin/sh', ['-c', command], scope)
}

export async function directoryProcessBoundary(command: string, args: string[], scope: CommandDirectoryScope): Promise<DirectoryCommandBoundary> {
  if (process.platform !== 'darwin') throw new Error('当前平台尚未接入命令目录隔离，操作未执行')
  const readRules = await Promise.all([...new Set([...scope.readOnly, ...scope.readWrite])].map(value => pathRule(value, true)))
  const executableRules = await Promise.all([...new Set([process.execPath, ...scope.executables ?? []])].map(value => pathRule(value)))
  // Homebrew Node links libraries outside its bin directory. Allow only actual
  // libraries already mapped by this trusted host, never the whole package prefix.
  const report = process.report?.getReport() as { sharedObjects?: string[] } | undefined
  const runtimeLibraries: string[] = []
  for (const library of [...report?.sharedObjects ?? [], ...systemReadFiles]) {
    try { runtimeLibraries.push(literal(await realpath(library))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  const writeRules = await Promise.all([...new Set(scope.readWrite)].map(value => pathRule(value, true)))
  // A business grant to Home or another ancestor cannot expose other employees'
  // product data. Only separately listed, current-run internal inputs stay readable.
  for (const grant of scope.business ?? []) {
    const rule = await pathRule(grant.path, true)
    const constrained = scope.protectedRoots?.length ? `(require-all ${rule} ${scope.protectedRoots.map(root => `(require-not ${subpath(root)})`).join(' ')})` : rule
    readRules.push(constrained)
    if (grant.access === 'read-write') writeRules.push(constrained)
  }
  const profile = [
    '(version 1)', '(deny default)',
    '(allow process-exec process-fork)', '(allow signal (target self))',
    '(allow sysctl-read)', '(allow sysctl-write (sysctl-name "kern.grade_cputype"))',
    // Metadata traversal is required to resolve authorized descendants; file contents/listing stay gated.
    '(allow file-read-metadata)',
    `(allow file-read-data file-map-executable ${literal('/')} ${systemReadRoots.map(subpath).join(' ')} ${readRules.join(' ')} ${executableRules.join(' ')} ${runtimeLibraries.join(' ')})`,
    `(allow file-read-data ${['/dev/null', '/dev/zero', '/dev/random', '/dev/urandom'].map(literal).join(' ')} ${subpath('/dev/fd')})`,
    `(allow file-write* ${literal('/dev/null')} ${subpath('/dev/fd')} ${writeRules.join(' ')})`,
    '(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo"))',
    // This is the file permission boundary. Existing command/network authorization remains in the host.
    '(allow network*)',
  ].join('\n')
  return { command: '/usr/bin/sandbox-exec', args: ['-p', profile, command, ...args] }
}
