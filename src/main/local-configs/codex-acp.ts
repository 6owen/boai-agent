/*
 * [INPUT]: 程序搜索目录与本地 codex-acp 可执行文件。
 * [OUTPUT]: 实际文件位置、内容身份和 Node 启动方式；发现期间不执行程序。
 * [POS]: main/local-configs 的 Codex ACP 程序发现与导入前复查。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { accessSync, constants, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

export interface CodexAcpProgram { executable: string; executableHash: string; runtime?: 'node' }

export function inspectCodexAcp(path: string): CodexAcpProgram {
  const executable = realpathSync(path), info = statSync(executable)
  if (!info.isFile() || info.size > 200 * 1024 * 1024) throw new Error('ACP 程序不可用')
  accessSync(executable, constants.X_OK)
  const content = readFileSync(executable)
  const node = /^#![^\r\n]*(?:\/|\s)node(?:\s|$)/.test(content.subarray(0, 512).toString().split('\n')[0])
  return { executable, executableHash: createHash('sha256').update(content).digest('hex'), ...(node ? { runtime: 'node' as const } : {}) }
}

function defaultPaths() {
  const paths = [...(process.env.PATH ?? '').split(delimiter), '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')]
  // GUI applications may not inherit the shell's nvm PATH. Inspect only its known version directory.
  const versions = join(process.env.NVM_DIR || join(homedir(), '.nvm'), 'versions/node')
  try {
    const names = readdirSync(versions, { withFileTypes: true }).filter(item => item.isDirectory() && /^v\d+\.\d+\.\d+$/.test(item.name)).map(item => item.name)
    for (const name of names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).slice(0, 50)) paths.push(join(versions, name, 'bin'))
  } catch { /* nvm is optional. */ }
  return paths
}

export function findCodexAcp(paths = defaultPaths()): CodexAcpProgram | undefined {
  if (process.platform === 'win32') return
  for (const directory of new Set(paths.filter(isAbsolute))) {
    try { return inspectCodexAcp(join(directory, 'codex-acp')) } catch { /* Continue through known executable locations. */ }
  }
  return undefined
}
