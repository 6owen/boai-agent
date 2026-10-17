/*
 * [OUTPUT]: 模型ID共用1000字符/无控制符边界，完整供应商前缀及原生模型名不截断。
 * [INPUT]: 已验证Claude版本、宿主管理配置目录、明确模型端点与API凭据。
 * [OUTPUT]: 2.1.214最小环境、有界文本/媒体输入与私有格式器合同/提醒；格式提交不授予业务权限，任务仅本次明确MCP，不继承订阅登录或插件。
 * [POS]: Claude适配策略；不声明工具任务、员工UI或供应商能力已经接入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { validModelId } from '../../../shared/domain/model-id'
export const CLAUDE_VERIFIED_VERSION = '2.1.214'
export const CLAUDE_PROGRAM_LIMIT = 512 * 1024 * 1024
export const CLAUDE_TEXT_INPUT_LIMIT = 2 * 1024 * 1024
// One full three-attachment submission fits; historical images share this explicit per-phase limit.
export const CLAUDE_IMAGE_BYTES_LIMIT = 60 * 1024 * 1024
export const CLAUDE_INPUT_LIMIT = Math.ceil(CLAUDE_IMAGE_BYTES_LIMIT / 3) * 4 + CLAUDE_TEXT_INPUT_LIMIT + 64 * 1024
export const CLAUDE_STRUCTURED_MAX_TURNS = 3
export const CLAUDE_STRUCTURED_INSTRUCTIONS = 'PRIVATE RESULT TRANSPORT: No business tools are available. Submit the private JSON result through StructuredOutput, the only tool in this phase. StructuredOutput only validates and returns this phase result to BoAI; it cannot read files, run commands, contact peers, publish work or persist memory. Instructions to return one JSON object describe this tool input, not a separate text answer. Do not send a public reply or narrate the formatting. The host separately validates identity, evidence and any proposed action before applying it.'
export const CLAUDE_STRUCTURED_REMINDER = '[structured-output-enforce] You MUST call the StructuredOutput tool to complete this request. Call this tool now.'
export const claudeNoToolsArgs = ['--bare', '-p', '--output-format', 'stream-json',
  '--verbose', '--include-partial-messages', '--tools', '', '--permission-mode', 'dontAsk',
  '--disable-slash-commands', '--setting-sources', '', '--strict-mcp-config', '--no-chrome']

export function claudeEnvironment(configDirectory: string) {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL', 'TMPDIR', 'TMP', 'TEMP']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return { ...env, CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_RESUME_INTERRUPTED_TURN: '0', DISABLE_COMPACT: '1', ENABLE_TOOL_SEARCH: 'false' }
}

export function claudeProviderEnvironment(input: { configDirectory: string; baseUrl: string; apiKey: string; model: string }) {
  const url = new URL(input.baseUrl)
  if (url.username || url.password || url.search || url.hash ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Claude模型端点必须是HTTPS或明确的本机回环地址')
  }
  if (!input.apiKey.trim() || !validModelId(input.model)) throw new Error('Claude需要明确的模型和API凭据')
  return { ...claudeEnvironment(input.configDirectory), ANTHROPIC_BASE_URL: input.baseUrl,
    ANTHROPIC_API_KEY: input.apiKey, ANTHROPIC_MODEL: input.model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: input.model, ANTHROPIC_DEFAULT_SONNET_MODEL: input.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: input.model, CLAUDE_CODE_SUBAGENT_MODEL: input.model }
}
