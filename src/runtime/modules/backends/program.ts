/*
 * [INPUT]: ACP 命令或绝对路径、PATH/标准安装目录及本机程序文件。
 * [OUTPUT]: 不执行程序的命令查找与身份核验；发现/绝对路径均使用调用方明确上限，默认200MiB保持。
 * [POS]: runtime/modules/backends 的程序解析边界，供宿主扫描及启动项仓储复用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { accessSync, constants, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, isAbsolute, join } from 'node:path'

const shells = new Set(['sh', 'bash', 'zsh', 'fish', 'cmd.exe', 'powershell.exe', 'pwsh'])

export function programSearchPaths() {
  const paths = [...(process.env.PATH ?? '').split(delimiter), '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')]
  // Desktop apps may not inherit the shell's nvm PATH; inspect only its known version directory.
  const versions = join(process.env.NVM_DIR || join(homedir(), '.nvm'), 'versions/node')
  try {
    const names = readdirSync(versions, { withFileTypes: true }).filter(item => item.isDirectory() && /^v\d+\.\d+\.\d+$/.test(item.name)).map(item => item.name)
    for (const name of names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).slice(0, 50)) paths.push(join(versions, name, 'bin'))
  } catch { /* nvm is optional. */ }
  return [...new Set(paths.filter(isAbsolute))]
}

export function inspectProgram(path: string, maxBytes = 200 * 1024 * 1024) {
  if (!isAbsolute(path)) throw new Error('程序路径必须是绝对路径。')
  const target = realpathSync(path), info = statSync(target)
  if (shells.has(basename(path).toLowerCase()) || shells.has(basename(target).toLowerCase())) throw new Error('请填写 ACP 程序，不支持 shell 启动命令。')
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !info.isFile() || info.size > maxBytes) throw new Error('程序不可用或超过大小限制')
  accessSync(target, constants.X_OK)
  const content = readFileSync(target)
  const node = /^#![^\r\n]*(?:\/|\s)node(?:\s|$)/.test(content.subarray(0, 512).toString().split('\n')[0])
  return { path: target, hash: createHash('sha256').update(content).digest('hex'), ...(node ? { runtime: 'node' as const } : {}) }
}

export function resolveProgram(command: string, paths = programSearchPaths(), maxBytes?: number) {
  const value = command.trim()
  if (isAbsolute(value)) return inspectProgram(value, maxBytes)
  if (!/^[\w.-]+$/.test(value) || value === '.' || value === '..' || shells.has(value.toLowerCase())) throw new Error('请填写程序名称或绝对路径，启动参数请单独填写。')
  for (const directory of paths.filter(isAbsolute)) {
    try { return inspectProgram(join(directory, value), maxBytes) } catch { /* Continue through known executable locations. */ }
  }
  throw new Error(`未找到 ${value}，请先安装该 Agent，或填写程序的绝对路径。`)
}
