/*
 * [OUTPUT]: 只从当前宿主租约接受脚本Node/工具库位置，继承的BOAI_CLI变量仍全部剥离。
 * [INPUT]: Inherited host/provider environment and an explicitly acquired run credential lease.
 * [OUTPUT]: Employee process environment without owner CLI/BOAI secret references; unavailable scope blocks local discovery.
 * [POS]: Shared process boundary for host commands, native drivers and plugin runners.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { RunCliEnvironment } from './run-access'

export function employeeEnvironment(inherited: NodeJS.ProcessEnv, scope?: RunCliEnvironment): NodeJS.ProcessEnv {
  const env = { ...inherited }
  for (const key of Object.keys(env)) if (/^BOAI_(SERVER_|CLI_|SECRET_|DATA_DIR$)/.test(key)) delete env[key]
  env.BOAI_CLI_EMPLOYEE_RUN = scope?.BOAI_CLI_EMPLOYEE_RUN ?? 'unavailable'
  if (scope?.BOAI_CLI_NODE && scope.BOAI_CLI_TOOL_CLIENT) {
    env.BOAI_CLI_NODE = scope.BOAI_CLI_NODE
    env.BOAI_CLI_TOOL_CLIENT = scope.BOAI_CLI_TOOL_CLIENT
  }
  if (scope?.BOAI_SERVER_URL && scope.BOAI_SERVER_TOKEN) {
    env.BOAI_SERVER_URL = scope.BOAI_SERVER_URL
    env.BOAI_SERVER_TOKEN = scope.BOAI_SERVER_TOKEN
  }
  return env
}
