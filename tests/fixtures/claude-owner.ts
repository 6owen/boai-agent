/*
 * [INPUT]: 隔离程序/目录与真实Claude进程传输。
 * [OUTPUT]: 宿主由测试实际SIGKILL，静默CLI及关闭管道的后代不得独立存活；无产品/供应商数据。
 * [POS]: Claude宿主死亡回归子进程，不替代传输实现。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { runClaudeProcess } from '../../src/runtime/adapters/claude/process'
const [executable, cwd] = process.argv.slice(2)
await runClaudeProcess({ executable, runtime: 'node', cwd, env: { PATH: process.env.PATH }, args: [],
  stdin: 'owner-death-tree', signal: new AbortController().signal, timeoutMs: 60000, onLine: () => {} })
