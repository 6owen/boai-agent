/*
 * [INPUT]: 明确UI环境档案、GitHub运行上下文和本地命令。
 * [OUTPUT]: 固定基线路径及独立手动采集资格；普通CI始终只读、无跨环境回退。
 * [POS]: 开发侧UI环境合同；不改产品字体或比较阈值。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export const LOCAL_PROFILE = 'local-macos-arm64'
export const CI_PROFILE = 'github-macos15-arm64'
export function uiProfile(root, requested, env = process.env) {
  if (env.CI && requested !== CI_PROFILE) throw new Error('CI必须明确使用github-macos15-arm64档案，不回退到本机截图')
  const id = requested ?? LOCAL_PROFILE
  if (![LOCAL_PROFILE, CI_PROFILE].includes(id)) throw new Error('未登记的UI环境档案')
  return { id, directory: join(root, 'tests/e2e/baselines', ...(id === CI_PROFILE ? [CI_PROFILE] : [])) }
}
export function manualCiCapture(env = process.env) {
  const trigger = env.GITHUB_EVENT_NAME === 'workflow_dispatch' || env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/infra/ui-environment-profiles'
  return env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && trigger && env.GITHUB_REPOSITORY === '6owen/boai-agent' && /^6owen\/boai-agent\/\.github\/workflows\/ui-baseline-candidate\.yml@refs\/heads\/.+$/.test(env.GITHUB_WORKFLOW_REF ?? '') && /^\d+$/.test(env.GITHUB_RUN_ID ?? '') && /^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? '') && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && env.RUNNER_OS === 'macOS' && env.RUNNER_ARCH === 'ARM64'
}
export function assertCaptureMode(command, env = process.env) {
  if (command === 'candidate-ci' && !manualCiCapture(env)) throw new Error('远程候选仅允许独立手动采集工作流')
  if (env.CI && command !== 'check' && command !== 'candidate-ci') throw new Error('普通CI禁止候选采集或基线晋升')
  if (env.CI && env.BOAI_UI_CANDIDATE_DIR && !(env.BOAI_UI_CAPTURE_MODE === 'manual-github' && manualCiCapture(env))) throw new Error('普通CI禁止候选基线写入')
}
export async function readUiBaseline(profile, environment, caseId, contractHash) {
  if (!/^[a-z0-9-]+$/.test(caseId)) throw new Error('非法UI场景名称')
  const manifest = JSON.parse(await readFile(join(profile.directory, 'manifest.json'), 'utf8'))
  if (manifest.profile !== profile.id) throw new Error('UI基线档案不匹配')
  if (JSON.stringify(manifest.environment) !== JSON.stringify(environment)) throw new Error('UI基线环境不匹配；需独立审阅环境迁移')
  const expected = manifest.cases?.[caseId]
  if (!expected) throw new Error(`缺少已接受UI基线：${caseId}`)
  if (expected.contract !== contractHash) throw new Error(`UI比较合同变化，需重新审阅：${caseId}`)
  const bytes = await readFile(join(profile.directory, `${caseId}.png`))
  if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`UI基线hash不匹配：${caseId}`)
  return bytes
}
