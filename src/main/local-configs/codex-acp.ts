/*
 * [INPUT]: 程序搜索目录、本地 codex-acp 可执行文件与共用程序解析器。
 * [OUTPUT]: 复用启动项的命令查找、文件身份和 Node 自动识别；发现期间不执行程序。
 * [POS]: main/local-configs 的 Codex ACP 程序发现与导入前复查。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { inspectProgram, programSearchPaths, resolveProgram } from '../../runtime/modules/backends/program'

export interface CodexAcpProgram { executable: string; executableHash: string; runtime?: 'node' }

export function inspectCodexAcp(path: string): CodexAcpProgram {
  const program = inspectProgram(path)
  return { executable: program.path, executableHash: program.hash, runtime: program.runtime }
}

export function findCodexAcp(paths = programSearchPaths()): CodexAcpProgram | undefined {
  if (process.platform === 'win32') return
  try {
    const program = resolveProgram('codex-acp', paths)
    return { executable: program.path, executableHash: program.hash, runtime: program.runtime }
  } catch { return undefined }
}
