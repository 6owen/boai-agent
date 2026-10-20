/*
 * [OUTPUT]: 2026-10-20原生Node测试加载的package.json导入标注JSON类型；CLI业务协议与退出状态保持。
 * [OUTPUT]: 2026-10-19应用业务协议：增加app catalog/describe/call/receipt/receipt-id，写操作显式稳定请求ID及真实结果退出状态。
 * [OUTPUT]: run监听覆盖服务启动至原执行结束；ready前中断保留恢复身份，退出130且不提交业务。
 * [OUTPUT]: 完整validate-server区分现有服务只读诊断与新隔离profile业务验证，输出步骤/耗时/错误和实际退出。
 * [OUTPUT]: CLI诊断/TTY动画开关、本机自定义服务入口及本次诊断日志保留，业务数据沿原生命周期。
 * [OUTPUT]: session create显式模式核对保存权限并进入稳定请求身份，旧回执不受后来改权影响。
 * [OUTPUT]: 显式CLI权限仅核对员工已保存模式，受理后继续沿原审批和当前授权，不临时改权。
 * [OUTPUT]: run上传附件后由原员工发送入口建会话/原子首发，不先创建空核心会话。
 * [OUTPUT]: --attachment传输客户端真实字节，沿原材料选择和发送，不把文件路径当服务授权。
 * [OUTPUT]: 本轮API模型覆盖沿原请求与执行，冻结来源且临时凭据不写入公开记录或默认配置。
 * [OUTPUT]: send/run接受--cwd及--workspace-dir别名，保持服务器路径和原消息回执。
 * [OUTPUT]: send/run的--source沿原Composer固定引用、员工授权和受理版本核验。
 * [OUTPUT]: 员工进程使用原run短期环境租约，剥离owner/服务密钥变量，实际退出后撤回；不可用时禁止CLI用户配置回退。
 * [OUTPUT]: CLI原执行文本增量/快照替换废弃和工具结果接线；receipt --follow只读原请求，待审批/输入与未知结果给出核对入口。
 * [OUTPUT]: CLI消息游标复用原历史双向分页；app/session:event沿公共发布器隔离会话，订阅确认及中断/断开退出可核对。
 * [OUTPUT]: 运行时版本查询复用程序身份/原验证与插件内容核验；未知明确、零启动，CLI区分自身及服务版本，验证归21组01 §12.9。
 * [OUTPUT]: cancel支持明确--run及唯一活动run选择；歧义列出对象，保留--request-id原消息取消。
 * [OUTPUT]: Session create/delete/receipt submit once and reconcile original durable receipts; deletion follows desktop clear-and-hide.
 * [INPUT]: BOAI CLI arguments/stdin environment and the explicit or discovered service endpoint.
 * [OUTPUT]: Craft-style queries/send/run/serve; auto-start, reuse, original cancellation and registered handoff.
 * [POS]: Product CLI executable; full run/serve and lifecycle commands continue under 21组01.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { ExecutionPermission } from '../shared/domain/execution'
import { CliPresentation } from './presentation'
import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { CliRpcClient } from './client'
import { readLocalConnection } from './discovery'
import { CliError, PROTOCOL_VERSION } from '../shared/cli/protocol'
import appPackage from '../../package.json' with { type: 'json' }
import { randomUUID } from 'node:crypto'
import { executeMessage, executionWriter, readPrompt } from './execution'
import type { MessageExecution } from '../shared/domain/message-execution'
import type { DigitalAgent } from '../shared/domain'
import { connectRunServer, type RunServer } from './server-spawner'
import { executeSessionOperation } from './session'
import { executeRunCancellation } from './cancel'
import { historyQuery } from './history'
import { eventChannelSchema } from './events'
import { apiModelOverrideSchema, assertModelEndpoint } from '../shared/domain/model-source'
import { validateServer } from './validation'
import { selectAttachments, uploadEmployeeAttachments } from './attachments'
import { MATERIAL_LIMITS } from '../shared/domain/materials'
import { selectSources } from './sources'

const { version } = appPackage
const help = `BOAI CLI ${version}
Usage: boai <command> [options]

  ping | health | versions | workspaces | employees | connections
  sessions [--employee ID] [--cursor ID] [--limit N]
  sources [--employee ID]
  session create --employee ID [--name TEXT] [--request-id ID]
  session messages ID [--limit N] [--cursor JSON] [--direction before|after]
  session delete ID [--request-id ID]   Clear history and hide, as in the desktop
  session receipt REQUEST_ID
  receipt REQUEST_ID [--follow]   Observe the same request without sending again
  send SESSION_ID [MESSAGE] [--stdin] [--request-id ID]
  run [MESSAGE] [--employee ID_OR_UNIQUE_NAME] [--stdin] [--request-id ID]
  cancel SESSION_ID [--run RUN_ID | --request-id MESSAGE_REQUEST_ID]
  serve --data-dir PATH [--host ADDRESS] [--port NUMBER]
  validate | --validate-server   Existing target: read-only; no target: isolated integration
  app catalog [DOMAIN]
  app describe OPERATION
  app call OPERATION [JSON] --request-id ID
  app receipt REQUEST_ID | app receipt-id RECEIPT_ID
  invoke CHANNEL [JSON]
  listen app|session:event [--session ID]

Options:
  --url URL --token TOKEN     Explicit service connection (remote requires WSS)
  --data-dir PATH             Discover a service; run starts it if absent
  --workspace ID             Require this profile identity
  --tls-ca PATH              Trusted CA file for WSS
  --timeout MS               RPC/connect wait (default 10000)
  --json                     JSON results; listen always emits JSON lines
  --output-format FORMAT     send/run/cancel/receipt --follow: text or stream-json
  --send-timeout MS          Client wait only (default 300000; 0 waits indefinitely)
  --mention ID               send: repeat for explicitly selected employees
  --cwd PATH                 send/run: server-side business directory (alias --workspace-dir)
  --attachment PATH          send/run: repeat for local files uploaded as real attachments
  --source ID                send/run: repeat for authorized data sources
  --mode MODE                send/run/session create: read-only, ask, allow-all; must match saved employee permission
                             Omit to inherit. Change permissions in employee configuration first.
  --provider NAME --model ID  send/run: this request only, API employees
  --base-url URL --api-key KEY  Explicit API source; credentials stay in service memory
  --reply-to ID              send: original message to reply to
  --verbose, -v              Lifecycle diagnostics on stderr (no credentials or request bodies)
  --no-spinner               Disable interactive connection animation (alias --disable-spinner)
  --server-entry PATH        run: local module exporting serve(options), only when starting a service
  --no-cleanup               run: retain this CLI's diagnostic log; business history is always retained
  --validation-profile PATH   validate: create a NEW dedicated directory (overrides launcher data-dir)
                             Retains report/evidence; existing directories are never modified.
                             Real API flags require this explicit directory; approvals remain pending.
  --help | --version
`
function defaultDataPath() {
  if (process.env.BOAI_DATA_DIR) return join(resolve(process.env.BOAI_DATA_DIR), 'v2')
  const base = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : process.platform === 'win32' ? process.env.APPDATA : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  if (!base) throw new CliError('INVALID_REQUEST', '请使用 --data-dir 指定 BOAI 服务配置')
  return join(base, 'BoAI Agent', 'v2')
}
async function main() {
  const { values, positionals } = parseArgs({ strict: true, allowPositionals: true, options: {
    help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' }, url: { type: 'string' }, token: { type: 'string' }, 'data-dir': { type: 'string' }, workspace: { type: 'string' }, 'tls-ca': { type: 'string' }, timeout: { type: 'string' }, employee: { type: 'string' }, cursor: { type: 'string' }, limit: { type: 'string' }, session: { type: 'string' },
    stdin: { type: 'boolean' }, 'request-id': { type: 'string' }, 'output-format': { type: 'string' }, 'send-timeout': { type: 'string' }, mention: { type: 'string', multiple: true }, source: { type: 'string', multiple: true }, attachment: { type: 'string', multiple: true }, cwd: { type: 'string' }, 'workspace-dir': { type: 'string' }, 'reply-to': { type: 'string' },
    verbose: { type: 'boolean', short: 'v' }, 'no-spinner': { type: 'boolean' }, 'disable-spinner': { type: 'boolean' }, 'no-cleanup': { type: 'boolean' }, 'server-entry': { type: 'string' }, mode: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' }, 'base-url': { type: 'string' }, 'api-key': { type: 'string' },
    run: { type: 'string' }, host: { type: 'string' }, port: { type: 'string' }, name: { type: 'string' }, direction: { type: 'string' }, follow: { type: 'boolean' },
    'validate-server': { type: 'boolean' }, 'validation-profile': { type: 'string' },
  } })
  if (values.help || (!positionals.length && !values.version && !values['validate-server'])) { process.stdout.write(help); return }
  if (values.version) { process.stdout.write(`${version}\n`); return }
  if (values['validate-server'] || positionals[0] === 'validate') {
    const allowed = new Set(['validate-server', 'validation-profile', 'json', 'url', 'token', 'data-dir', 'workspace', 'tls-ca', 'timeout', 'verbose', 'no-spinner', 'disable-spinner', 'provider', 'model', 'base-url', 'api-key'])
    if (positionals.length && (positionals.length !== 1 || positionals[0] !== 'validate') || Object.keys(values).some(key => !allowed.has(key))) throw new CliError('INVALID_REQUEST', 'validate不接受业务命令或发送参数')
    if (process.env.BOAI_CLI_EMPLOYEE_RUN) throw new CliError('AUTH_FAILED', '服务验证需要本人终端，不可使用员工运行凭据')
    const url = values.url ?? process.env.BOAI_SERVER_URL
    const token = values.token ?? ((!values.url || values.url === process.env.BOAI_SERVER_URL) ? process.env.BOAI_SERVER_TOKEN : undefined)
    if (url && !token || token && !url) throw new CliError('INVALID_REQUEST', '明确服务地址需要成对的凭据，不会借用其他profile')
    const directory = values['validation-profile'], isolated = !!directory || !url && !values['data-dir']
    if (directory !== undefined && (!directory.trim() || /[\x00-\x1f\x7f]/u.test(directory)) || directory && url || isolated && values.workspace) throw new CliError('INVALID_REQUEST', '新验证目录不能与远端地址或已有工作空间身份混用')
    const timeout = values.timeout === undefined ? 30000 : Number(values.timeout)
    if (!/^\d+$/.test(values.timeout ?? '30000') || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new CliError('INVALID_REQUEST', '验证timeout必须是正整数毫秒')
    const hasModel = [values.provider, values.model, values['base-url'], values['api-key']].some(value => value !== undefined)
    if (hasModel && (!directory || !values.provider || !values.model || !values['base-url'] || !values['api-key'])) throw new CliError('INVALID_REQUEST', '真实模型验证需要明确的新validation-profile及完整provider/model/base-url/api-key；不修改已有服务')
    const parsedModel = hasModel ? apiModelOverrideSchema.safeParse({ provider: values.provider, model: values.model, baseUrl: values['base-url'], apiKey: values['api-key'] }) : undefined
    if (parsedModel && !parsedModel.success) throw new CliError('INVALID_REQUEST', '验证模型参数无效')
    const apiModel = parsedModel?.success ? parsedModel.data : undefined
    if (apiModel) { try { assertModelEndpoint(apiModel.provider!, apiModel.baseUrl!) } catch { throw new CliError('INVALID_REQUEST', '验证模型地址无效') } }
    const caPath = values['tls-ca'] ?? process.env.BOAI_TLS_CA
    const controller = new AbortController(), interrupt = () => controller.abort()
    process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
    try {
      const report = await validateServer({ directory, dataPath: directory ? undefined : values['data-dir'] && resolve(values['data-dir']), url, token, workspaceId: values.workspace, ca: caPath ? await readFile(caPath) : undefined, timeout, apiModel, signal: controller.signal, diagnostic: value => { if (values.verbose) process.stderr.write(`${JSON.stringify({ type: 'diagnostic', ...value })}\n`) }, step: value => { if (values.verbose) process.stderr.write(`${JSON.stringify({ type: 'diagnostic', event: 'validation_step', step: value.step, status: value.status, elapsedMs: value.elapsedMs })}\n`); if (!values.json) process.stdout.write(`${value.status} ${value.step} (${value.elapsedMs}ms): ${value.detail}${value.code ? ` [${value.code}]` : ''}\n`) } })
      process.stdout.write(values.json ? `${JSON.stringify(report)}\n` : `验证完成：${report.passed}通过，${report.failed}失败，${report.skipped}未执行${report.directory ? `；证据 ${report.directory}` : ''}${report.startup ? `；服务尚未确认，进程 ${report.startup.pid}，日志 ${report.startup.logPath}` : ''}\n`)
      process.exitCode = report.exitCode
    } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt) }
    return
  }
  if (values['validation-profile'] !== undefined || values['validate-server'] !== undefined) throw new CliError('INVALID_REQUEST', '验证参数仅适用于validate')
  const [command, ...args] = positionals
  const following = command === 'receipt' && values.follow === true
  if (values.follow !== undefined && command !== 'receipt') throw new CliError('INVALID_REQUEST', '--follow仅适用于receipt')
  const requestId = following ? args[0] : values['request-id'] ?? randomUUID()
  const sessionMutation = command === 'session' && ['create', 'delete'].includes(args[0])
  if (command === 'serve') {
    if (args.length || !values['data-dir'] || Object.keys(values).some(key => !['data-dir', 'host', 'port', 'json', 'verbose', 'no-spinner', 'disable-spinner'].includes(key))) throw new CliError('INVALID_REQUEST', 'serve需要明确 --data-dir，仅接受 --host/--port/--json；凭据/TLS由服务环境提供')
    const entry = new URL('../runtime/serve.mjs', import.meta.url)
    const { serve } = await import(entry.href).catch(error => { if (error?.code === 'ERR_MODULE_NOT_FOUND') throw new CliError('CAPABILITY_UNAVAILABLE', '当前CLI旁缺少独立服务或其依赖，请使用完整BOAI构建'); throw error })
    if (values.verbose) process.stderr.write(`${JSON.stringify({ type: 'diagnostic', event: 'service_start', pid: process.pid })}\n`)
    await serve({ dataPath: values['data-dir'], host: values.host, port: values.port }); return
  }
  if (values.host !== undefined || values.port !== undefined) throw new CliError('INVALID_REQUEST', '--host/--port仅适用于serve')
  const noArgs = ['ping', 'health', 'versions', 'workspaces', 'employees', 'connections', 'sessions', 'sources']
  const messages = command === 'session' && args[0] === 'messages'
  let channel: string, input: unknown
  const integer = (value: string, max: number) => { if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) throw new CliError('INVALID_REQUEST', '数字参数超出范围'); return Number(value) }
  if (noArgs.includes(command) && !args.length) {
    channel = command
    input = command === 'sessions' ? { employeeId: values.employee, cursor: values.cursor, limit: values.limit !== undefined ? integer(values.limit, 80) : 40 } : command === 'sources' ? { employeeId: values.employee } : undefined
  } else if (messages && args.length === 2) { channel = 'listConversationMessages'; input = historyQuery(args[1], values.limit !== undefined ? integer(values.limit, 80) : 40, values.cursor, values.direction) }
  else if (command === 'session' && args[0] === 'create' && args.length === 1 && values.employee) { channel = 'createEmployeeSession'; input = undefined }
  else if (command === 'session' && args[0] === 'delete' && args.length === 2) { channel = 'deleteSession'; input = undefined }
  else if (command === 'session' && args[0] === 'receipt' && args.length === 2) { channel = 'getSessionReceipt'; input = { requestId: args[1] } }
  else if (command === 'receipt' && args.length === 1) { channel = 'getMessageExecution'; input = { requestId: args[0] } }
  else if (command === 'send' && args.length >= 1) { channel = 'sendMessage'; input = undefined }
  else if (command === 'run') { channel = 'sendEmployeeMessage'; input = undefined }
  else if (command === 'cancel' && args.length === 1) { channel = values['request-id'] ? 'cancelMessageExecution' : 'cancelRunExecution'; input = undefined }
  else if (command === 'app' && args[0] === 'catalog' && args.length <= 2) { channel = 'application:catalog'; input = args[1] ? { domain: args[1] } : {} }
  else if (command === 'app' && args[0] === 'describe' && args.length === 2) { channel = 'application:catalog'; input = { operation: args[1] } }
  else if (command === 'app' && args[0] === 'receipt-id' && args.length === 2) { channel = 'application:receipt'; input = { receiptId: args[1] } }
  else if (command === 'app' && args[0] === 'receipt' && args.length === 2) { channel = 'application:receipt'; input = { requestId: args[1] } }
  else if (command === 'app' && args[0] === 'call' && args.length >= 2 && args.length <= 3) {
    channel = 'application:call'
    let payload: unknown
    try { payload = args.length === 3 ? JSON.parse(args[2]) : {} } catch { throw new CliError('INVALID_REQUEST', 'app call 参数不是有效 JSON') }
    // Writes require a caller-chosen stable ID. Never silently generate one on retry.
    input = { operation: args[1], input: payload, ...(values['request-id'] ? { requestId: values['request-id'] } : {}) }
  }
  else if (command === 'invoke' && args.length >= 1 && args.length <= 2) { channel = args[0]; try { input = args.length === 2 ? JSON.parse(args[1]) : undefined } catch { throw new CliError('INVALID_REQUEST', 'invoke 参数不是有效 JSON') } }
  else if (command === 'listen' && args.length === 1 && eventChannelSchema.safeParse(args[0]).success) { channel = 'events:subscribe'; input = { channel: args[0], conversationId: values.session } }
  else throw new CliError('INVALID_REQUEST', '命令或参数无效，请使用 --help 查看当前可用命令')
  if ((values.employee !== undefined && !['sessions', 'sources', 'run'].includes(command) && !(command === 'session' && args[0] === 'create')) || (values.name !== undefined && !(command === 'session' && args[0] === 'create')) || (values.cursor !== undefined && command !== 'sessions' && !messages) || (values.limit !== undefined && command !== 'sessions' && !messages) || (values.direction !== undefined && !messages) || (values.session !== undefined && command !== 'listen')) throw new CliError('INVALID_REQUEST', '该选项不适用于当前命令')
  if (values.run !== undefined && (command !== 'cancel' || !values.run.length || values.run.length > 200 || values['request-id'] !== undefined)) throw new CliError('INVALID_REQUEST', '--run仅适用于cancel，且不能与--request-id同时使用')
  if (values.source !== undefined && !['send', 'run'].includes(command)) throw new CliError('INVALID_REQUEST', '--source仅适用于send/run')
  if (values.attachment !== undefined && (!['send', 'run'].includes(command) || values.attachment.length > MATERIAL_LIMITS.perMessage || values.attachment.some(file => !file))) throw new CliError('INVALID_REQUEST', '--attachment仅适用于send/run，每条消息最多三份本地文件')
  if (values.mode !== undefined && (!(['send', 'run'].includes(command) || command === 'session' && args[0] === 'create') || !['read-only', 'ask', 'allow-all'].includes(values.mode))) throw new CliError('INVALID_REQUEST', '--mode仅适用于send/run/session create，接受read-only、ask或allow-all；省略则继承员工配置')
  const expectedExecutionPermission: ExecutionPermission | undefined = values.mode === 'allow-all' ? 'full-access' : values.mode as ExecutionPermission | undefined
  const hasModelOverride = [values.provider, values.model, values['base-url'], values['api-key']].some(value => value !== undefined)
  if (hasModelOverride && !['send', 'run'].includes(command)) throw new CliError('INVALID_REQUEST', '本轮API模型参数仅适用于send/run')
  const parsedModel = hasModelOverride ? apiModelOverrideSchema.safeParse({ provider: values.provider, model: values.model, baseUrl: values['base-url'], apiKey: values['api-key'] }) : undefined
  if (parsedModel && !parsedModel.success) throw new CliError('INVALID_REQUEST', '本轮API模型参数无效，请核对provider/model/base-url/api-key')
  const apiModel = parsedModel?.success ? parsedModel.data : undefined
  const workingDirectory = values.cwd ?? values['workspace-dir']
  if (workingDirectory !== undefined && (!['send', 'run'].includes(command) || !workingDirectory.length || workingDirectory.length > 4096 || /[\x00-\x1f\x7f]/u.test(workingDirectory))) throw new CliError('INVALID_REQUEST', '--cwd/--workspace-dir仅接受send/run的有效服务器目录路径')
  if (values.cwd !== undefined && values['workspace-dir'] !== undefined && values.cwd !== values['workspace-dir']) throw new CliError('INVALID_REQUEST', '--cwd与--workspace-dir不能指定不同目录')
  const executing = ['send', 'run', 'cancel'].includes(command) || following
  if (following && values['request-id'] !== undefined) throw new CliError('INVALID_REQUEST', 'receipt使用原位置参数的requestId')
  if ((!executing && !sessionMutation && !(command === 'app' && args[0] === 'call') && values['request-id'] !== undefined) || (!executing && (values['output-format'] !== undefined || values['send-timeout'] !== undefined)) || (!['send', 'run'].includes(command) && values.stdin !== undefined) || (command !== 'send' && (values.mention !== undefined || values['reply-to'] !== undefined))) throw new CliError('INVALID_REQUEST', '该执行选项不适用于当前命令')
  if (values['output-format'] && !['text', 'stream-json'].includes(values['output-format']) || values.json && values['output-format'] === 'text') throw new CliError('INVALID_REQUEST', '输出格式无效或与 --json 冲突')
  if (values['request-id'] !== undefined && (!values['request-id'].length || values['request-id'].length > 200)) throw new CliError('INVALID_REQUEST', 'request-id 长度必须为 1–200')
  const waitTimeout = values['send-timeout'] === '0' ? undefined : values['send-timeout'] ? integer(values['send-timeout'], 2_147_483_647) : 300_000
  const content = ['send', 'run'].includes(command) ? await readPrompt(command === 'run' ? args : args.slice(1), process.stdin, values.stdin, !!values.attachment?.length) : undefined
  const url = values.url ?? process.env.BOAI_SERVER_URL
  if ((values['no-cleanup'] !== undefined || values['server-entry'] !== undefined) && command !== 'run') throw new CliError('INVALID_REQUEST', '--no-cleanup/--server-entry仅适用于run')
  if (values['server-entry'] !== undefined && (url || !values['server-entry'].trim() || values['server-entry'].length > 4096 || /[\x00-\x1f\x7f]/u.test(values['server-entry']))) throw new CliError('INVALID_REQUEST', '--server-entry仅用于本机自动启动，不能与明确服务地址同时使用')
  const token = values.token ?? ((!values.url || values.url === process.env.BOAI_SERVER_URL) ? process.env.BOAI_SERVER_TOKEN : undefined)
  if (process.env.BOAI_CLI_EMPLOYEE_RUN && (!url || !token)) throw new CliError('AUTH_FAILED', '当前员工运行没有可用CLI凭据，不会读取用户连接配置')
  if (values.token && !url) throw new CliError('INVALID_REQUEST', '--token 必须与明确的服务地址一起提供')
  if (url && !token) throw new CliError('AUTH_FAILED', '明确的服务地址需要对应 token，不会使用其他本机配置的凭据')
  const dataPath = values['data-dir'] ? resolve(values['data-dir']) : defaultDataPath()
  const local = url || command === 'run' ? undefined : await readLocalConnection(dataPath)
  const timeout = values.timeout ? integer(values.timeout, 2_147_483_647) : 10_000
  const caPath = values['tls-ca'] ?? process.env.BOAI_TLS_CA
  const ca = caPath ? await readFile(caPath) : undefined
  const presentation = new CliPresentation({ stdout: process.stdout, stderr: process.stderr, json: !!values.json || values['output-format'] === 'stream-json' || command === 'listen', verbose: values.verbose, noSpinner: values['no-spinner'] || values['disable-spinner'], noColor: process.env.NO_COLOR !== undefined, term: process.env.TERM })
  const startedAt = Date.now()
  let runServer: RunServer | undefined, preserve = false, commandFailed = true
  const runController = command === 'run' ? new AbortController() : undefined
  const interruptRun = () => { process.exitCode = 130; runController?.abort(new Error('用户中断，正在按原请求取消')) }
  if (runController) { process.on('SIGINT', interruptRun); process.on('SIGTERM', interruptRun) }
  let connectedClient: CliRpcClient | undefined
  let attachmentUpload: Awaited<ReturnType<typeof uploadEmployeeAttachments>> | undefined
  try {
  presentation.diagnostic({ event: 'connecting' }); presentation.wait('连接 BOAI…')
  if (command === 'run' && !url) runServer = await connectRunServer({ signal: runController?.signal, dataPath, serverEntry: values['server-entry'], diagnostic: event => presentation.diagnostic(event), timeout, workspaceId: values.workspace, ca })
  const client = runServer?.client ?? new CliRpcClient(url ?? local!.url, { token: token ?? local!.token, serverId: local?.serverId, workspaceId: values.workspace ?? local?.workspaceId, requestTimeout: timeout, connectTimeout: timeout, ca })
  connectedClient = client
  const writer = executionWriter(values.json || values['output-format'] === 'stream-json' ? 'stream-json' : 'text', text => presentation.stdout(text), text => presentation.stderr(text))
    if (!client.isConnected) await client.connect()
    if (runController?.signal.aborted) throw new CliError('CLIENT_DISCONNECTED', '连接等待已中断，未提交业务请求')
    presentation.stop(); presentation.diagnostic({ event: 'connected', elapsedMs: Date.now() - startedAt })
    if (sessionMutation) {
      const outcome = await executeSessionOperation(client, args[0] === 'create' ? { kind: 'create', ...(expectedExecutionPermission ? { expectedExecutionPermission } : {}), employeeId: values.employee!, ...(values.name === undefined ? {} : { name: values.name }) } : { kind: 'delete', conversationId: args[1] }, requestId)
      process.stdout.write(`${JSON.stringify(outcome.result, null, values.json ? undefined : 2)}\n`)
      process.exitCode = outcome.exitCode
    } else if (command === 'cancel' && !values['request-id']) {
      const controller = new AbortController(), interrupt = () => controller.abort(new Error('用户结束停止等待'))
      process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
      try { process.exitCode = await executeRunCancellation(client, args[0], values.run, { signal: controller.signal, waitTimeout, emit: value => {
        if (values.json || values['output-format'] === 'stream-json') process.stdout.write(`${JSON.stringify(value)}\n`)
        else if (value.type === 'result' && value.state === 'stopped') process.stdout.write(value.runId ? `运行 ${value.runId} 已停止\n` : '当前会话没有活动执行\n')
        else process.stderr.write(`${JSON.stringify(value)}\n`)
      } }) }
      finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt) }
    } else if (executing) {
      let employeeId: string | undefined
      if (command === 'run') {
        const employees = await client.invoke('employees') as DigitalAgent[]
        const selected = values.employee ? employees.filter(agent => agent.id === values.employee) : employees.filter(agent => agent.id === 'bobo' && agent.systemRole === 'core')
        const matches = selected.length ? selected : employees.filter(agent => agent.name === values.employee)
        if (matches.length !== 1) throw new CliError('INVALID_REQUEST', '请指定已配置员工的ID或唯一名称；未找到唯一员工')
        employeeId = matches[0].id
      }
      const attachmentConversationId = command === 'send' ? args[0] : undefined
      const materialSelections = values.attachment?.length && command === 'send' ? await selectAttachments(client, values.attachment, attachmentConversationId!, requestId) : undefined
      if (values.attachment?.length && command === 'run') attachmentUpload = await uploadEmployeeAttachments(client, values.attachment, requestId)
      const composerReferences = await selectSources(client, values.source, command === 'run' ? { employeeId: employeeId! } : { conversationId: args[0] }, requestId)
      if (command === 'cancel') {
        const status = await client.invoke('getMessageExecution', { requestId }) as MessageExecution | null
        if (!status || status.conversationId !== args[0]) throw new CliError('INVALID_REQUEST', '原请求不属于指定会话')
      }
      if (runController?.signal.aborted) throw new CliError('CLIENT_DISCONNECTED', '消息准备已中断，未提交业务请求')
      const controller = runController ?? new AbortController(), interrupt = () => controller.abort(new Error(command === 'run' ? '用户中断，正在按原请求取消' : '用户结束终端等待；原执行未取消'))
      if (!runController) { process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt) }
      try {
        process.exitCode = await executeMessage(client, following ? { kind: 'observe' } : command === 'run' ? { kind: 'employee', ...(expectedExecutionPermission ? { expectedExecutionPermission } : {}), ...(attachmentUpload?.materialUploads ? { materialUploads: attachmentUpload.materialUploads } : {}), ...(attachmentUpload?.materialSelections ? { materialSelections: attachmentUpload.materialSelections } : {}), employeeId: employeeId!, content: content!, ...(composerReferences ? { composerReferences } : {}), ...(workingDirectory ? { workingDirectory } : {}), ...(apiModel ? { apiModel } : {}) } : command === 'send' ? { kind: 'send', ...(expectedExecutionPermission ? { expectedExecutionPermission } : {}), conversationId: attachmentConversationId!, ...(materialSelections ? { materialSelections } : {}), content: content!, mentionIds: values.mention ?? [], ...(composerReferences ? { composerReferences } : {}), ...(workingDirectory ? { workingDirectory } : {}), ...(apiModel ? { apiModel } : {}), ...(values['reply-to'] ? { replyToMessageId: values['reply-to'] } : {}) } : { kind: 'cancel' }, {
          requestId, signal: controller.signal, waitTimeout,
          emit: writer,
        })
        if (command === 'run' && controller.signal.aborted) {
          const cancelled = await executeMessage(client, { kind: 'cancel' }, { requestId, waitTimeout: 10_000, emit: writer })
          preserve = cancelled !== 0
          process.exitCode = 130
        } else preserve = process.exitCode === 3 || process.exitCode === 4
      } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt) }
    } else if (command === 'listen') {
      let interrupt!: () => void, removeDisconnect!: () => void
      let rejectDisconnected!: (error: Error) => void
      const stopped = new Promise<void>((resolve, reject) => { rejectDisconnected = reject; interrupt = () => { process.exitCode = 130; resolve() }; removeDisconnect = client.onDisconnect(reject); process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt) })
      // Attach rejection handling before the subscription RPC can fail.
      void stopped.catch(() => {})
      const unsubscribe = client.on(args[0], event => process.stdout.write(`${JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: 'event', channel: args[0], event })}\n`))
      try {
        await client.invoke(channel, input)
        if (!client.isConnected) rejectDisconnected(new CliError('CLIENT_DISCONNECTED', '事件连接已断开'))
        else process.stdout.write(`${JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: 'subscribed', channel: args[0], ...(values.session ? { conversationId: values.session } : {}) })}\n`)
        await stopped
      }
      finally { unsubscribe(); removeDisconnect(); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt) }
    } else {
      const response = await client.invoke(channel, ...(input === undefined ? [] : [input]))
      if (command === 'app' && response && typeof response === 'object' && 'status' in response) process.exitCode = response.status === 'succeeded' ? 0 : response.status === 'rejected' ? 1 : 3
      const result = command === 'versions' ? { ...(response as object), cli: version } : response
      process.stdout.write(`${JSON.stringify(result ?? null, null, values.json ? undefined : 2)}\n`)
    }
    commandFailed = false
  } finally {
    presentation.stop()
    await attachmentUpload?.dispose()
    if (runServer) {
      try {
        const service = await runServer.finish(preserve, !!values['no-cleanup'] || commandFailed || !!process.exitCode)
        const event = { protocolVersion: PROTOCOL_VERSION, type: 'service', requestId, ...service }
        ;(values.json || values['output-format'] === 'stream-json' ? process.stdout : process.stderr).write(`${JSON.stringify(event)}\n`)
      } catch {
        preserve = true
        process.stderr.write(`${JSON.stringify({ type: 'service', state: 'unknown', requestId, serverId: runServer.connection.serverId, url: runServer.connection.url, pid: runServer.connection.pid })}\n`)
        if (!process.exitCode) process.exitCode = 4
      }
    }
    connectedClient?.destroy()
    if (runController) { process.off('SIGINT', interruptRun); process.off('SIGTERM', interruptRun) }
  }
}
await main().catch(error => {
  // The separately built serve entry has its own module class identity.
  const code = error instanceof CliError || error?.name === 'CliError' && ['AUTH_FAILED', 'PROFILE_MISMATCH', 'INVALID_REQUEST', 'SERVER_BUSY', 'CAPABILITY_UNAVAILABLE', 'CLIENT_DISCONNECTED', 'REQUEST_TIMEOUT'].includes(error.code) ? error.code : typeof error?.code === 'string' && error.code.startsWith('ERR_PARSE_ARGS') ? 'INVALID_REQUEST' : 'HANDLER_ERROR'
  process.stderr.write(`${JSON.stringify({ code, message: code === 'HANDLER_ERROR' ? 'CLI 操作失败，请核对配置、服务与文件是否可用' : error.message })}\n`)
  process.exitCode = process.exitCode === 130 ? 130 : code === 'INVALID_REQUEST' ? 2 : ['REQUEST_TIMEOUT', 'CLIENT_DISCONNECTED'].includes(code) ? 4 : 1
})
