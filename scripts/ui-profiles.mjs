/*
 * [OUTPUT]: 同仓库PR的明确采集阶段可产候选，普通check仍只读。
 * [INPUT]: 明确UI环境档案、GitHub运行上下文和本地命令。
 * [OUTPUT]: 限定采集/接受与明确本机CI只读入口；GitHub仍逐case官方来源，无跨档案回退。
 * [POS]: 开发侧UI环境合同；不改产品字体或比较阈值。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export const LOCAL_PROFILE = 'local-macos-arm64'
export const CI_PROFILE = 'github-macos15-arm64'
export function assertProfileCommand(command, profile) {
  if (['candidate', 'accept'].includes(command) && profile !== LOCAL_PROFILE) throw new Error('本地候选/接受只能使用本机档案；CI档案必须核验官方artifact')
  if (command === 'candidate-ci' && profile !== CI_PROFILE) throw new Error('远程采集只能使用CI档案')
}
export function uiProfile(root, requested, env = process.env) {
  const github = env.GITHUB_ACTIONS || env.GITHUB_REPOSITORY || env.GITHUB_RUN_ID || env.GITHUB_WORKFLOW_REF
  const localCi = env.CI && env.BOAI_UI_EXECUTION === 'local-ci' && !github
  if (localCi && requested !== LOCAL_PROFILE) throw new Error('本机CI必须明确使用本机档案')
  if (env.CI && !localCi && requested !== CI_PROFILE) throw new Error('CI必须明确使用github-macos15-arm64档案，不回退到本机截图')
  const id = requested ?? LOCAL_PROFILE
  if (![LOCAL_PROFILE, CI_PROFILE].includes(id)) throw new Error('未登记的UI环境档案')
  return { id, directory: join(root, 'tests/e2e/baselines', ...(id === CI_PROFILE ? [CI_PROFILE] : [])) }
}
export function manualCiCapture(env = process.env) {
  const trigger = env.GITHUB_EVENT_NAME === 'workflow_dispatch' || env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/infra/ui-environment-profiles'
  return env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && trigger && env.GITHUB_REPOSITORY === '6owen/boai-agent' && /^6owen\/boai-agent\/\.github\/workflows\/ui-baseline-candidate\.yml@refs\/heads\/.+$/.test(env.GITHUB_WORKFLOW_REF ?? '') && /^\d+$/.test(env.GITHUB_RUN_ID ?? '') && /^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? '') && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && env.RUNNER_OS === 'macOS' && env.RUNNER_ARCH === 'ARM64'
}
export function prCiCapture(env = process.env) {
  return env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_REPOSITORY === '6owen/boai-agent' && env.BOAI_UI_HEAD_REPOSITORY === '6owen/boai-agent' && /^[1-9]\d*$/.test(env.BOAI_UI_PR_NUMBER ?? '') && env.GITHUB_REF === `refs/pull/${env.BOAI_UI_PR_NUMBER}/merge` && env.GITHUB_WORKFLOW_REF === `6owen/boai-agent/.github/workflows/tests.yml@${env.GITHUB_REF}` && /^[a-f0-9]{40}$/.test(env.BOAI_UI_PR_HEAD ?? '') && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && /^\d+$/.test(env.GITHUB_RUN_ID ?? '') && /^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? '') && env.RUNNER_OS === 'macOS' && env.RUNNER_ARCH === 'ARM64'
}
export function assertCaptureMode(command, env = process.env) {
  if (command === 'candidate-ci' && !(manualCiCapture(env) || prCiCapture(env))) throw new Error('远程候选仅允许官方独立或同仓库PR采集')
  if (env.CI && command !== 'check' && command !== 'candidate-ci') throw new Error('普通CI禁止候选采集或基线晋升')
  if (env.CI && env.BOAI_UI_CANDIDATE_DIR && !(env.BOAI_UI_CAPTURE_MODE === 'manual-github' && (manualCiCapture(env) || prCiCapture(env)))) throw new Error('普通CI禁止候选基线写入')
}
export async function readUiBaseline(profile, environment, caseId, contractHash) {
  if (!/^[a-z0-9-]+$/.test(caseId)) throw new Error('非法UI场景名称')
  const manifest = JSON.parse(await readFile(join(profile.directory, 'manifest.json'), 'utf8'))
  if (manifest.profile !== profile.id) throw new Error('UI基线档案不匹配')
  if (profile.id === CI_PROFILE) {
    const p = manifest.cases?.[caseId]?.provenance ?? manifest.provenance
    if (p?.version !== 1 || !/^\d+$/.test(p.runId ?? '') || !Number.isInteger(p.attempt) || p.attempt < 1 || !Number.isInteger(p.artifactId) || p.artifactId < 1 || !/^sha256:[a-f0-9]{64}$/.test(p.digest ?? '') || !/^[a-f0-9]{40}$/.test(p.commit ?? '') || manifest.cases?.[caseId]?.source?.commit !== p.commit) throw new Error('CI基线缺少绑定来源的官方artifact记录')
  }
  if (JSON.stringify(manifest.environment) !== JSON.stringify(environment)) throw new Error('UI基线环境不匹配；需独立审阅环境迁移')
  const expected = manifest.cases?.[caseId]
  if (!expected) throw new Error(`缺少已接受UI基线：${caseId}`)
  if (expected.contract !== contractHash) throw new Error(`UI比较合同变化，需重新审阅：${caseId}`)
  const bytes = await readFile(join(profile.directory, `${caseId}.png`))
  if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`UI基线hash不匹配：${caseId}`)
  return bytes
}
