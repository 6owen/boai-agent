/*
 * [INPUT]: 冻结任务JSON、明确仓库和run/status/deliver命令。
 * [OUTPUT]: 唯一领取/隔离开发/原检查/独立审查及draft PR；未知结果退出非零，取消写入先核对。
 * [POS]: 第22组开发侧CLI；完整恢复接续仍待实施。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { build } from 'esbuild'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const [command, ...args] = process.argv.slice(2)
const help = 'dev-task.mjs run|deliver --config TASK.json [--source REPO] | status --task ID [--source REPO]'
if (!command || command === '--help') { console.log(help); process.exit(0) }
const allowed = ['run', 'deliver'].includes(command) ? ['--config', '--source'] : command === 'status' ? ['--task', '--source'] : []
const options = new Map()
for (let index = 0; index < args.length; index += 2) {
  if (!allowed.includes(args[index]) || options.has(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(help)
  options.set(args[index], args[index + 1])
}
if (!allowed.length || !options.get(command === 'status' ? '--task' : '--config')) throw new Error(help)
const controller = new AbortController(), cancel = () => controller.abort(new Error('用户取消，不重放未知操作'))
process.once('SIGINT', cancel); process.once('SIGTERM', cancel)
const parent = resolve('.local/development-tools'); await mkdir(parent, { recursive: true })
const directory = await mkdtemp(join(parent, 'controller-'))
try {
  const entry = join(directory, 'controller.mjs')
  await build({ stdin: { contents: "export {runDevelopmentTask} from './scripts/development/controller.ts'; export {taskStatus} from './scripts/development/task.ts';export {deliverDevelopmentTask} from './scripts/development/pull-request.ts'", resolveDir: process.cwd() }, outfile: entry, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' })
  process.env.BOAI_DEV_CONTROLLER_HASH = createHash('sha256').update(await readFile(entry)).digest('hex')
  process.env.BOAI_DEV_CONTROLLER_FILE = entry
  const api = await import(pathToFileURL(entry).href), source = resolve(options.get('--source') ?? '.')
  const task = command === 'status' ? null : JSON.parse(await readFile(resolve(options.get('--config')), 'utf8'))
  const result = command === 'status' ? api.taskStatus(source, options.get('--task')) : command === 'run' ? await api.runDevelopmentTask(source, task, controller.signal) : await api.deliverDevelopmentTask(source, task, undefined, controller.signal)
  console.log(JSON.stringify(result, null, 2))
  if (command === 'run' && result.state.phase !== 'reviewed') process.exitCode = result.state.phase === 'cancelled' ? 130 : 2
  if (command === 'deliver' && result.state.phase !== 'delivered') process.exitCode = 2
} finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); await rm(directory, { recursive: true, force: true }) }
