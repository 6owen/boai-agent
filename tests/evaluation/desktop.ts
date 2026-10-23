/*
 * [INPUT]: 已完成桌面批次的最终Playwright结果、逐尝试manifest、原始资源与构建登记。
 * [OUTPUT]: 只读、逐资源hash核验的实验记录；失败/重试/未运行保留，技术通过仍待内容评审，未采集成本保持未知。
 * [POS]: tests/evaluation/desktop.ts，现有BDD留证到评估的适配，不启动Electron或供应商。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { digest, type EvaluationTrial } from './experiment'

const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)), '无效的记录时间')
const JSON_LIMIT = 16 * 1024 * 1024, RESOURCE_LIMIT = 128 * 1024 * 1024
const resourceSchema = z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative(), kind: z.string().optional(), label: z.string().optional() })
const manifestSchema = z.object({
  testId: z.string().min(1), title: z.string(), location: z.object({ file: z.string() }), project: z.string(),
  retry: z.number().int().nonnegative(), repeatEachIndex: z.number().int().nonnegative(),
  startedAt: timestamp, completedAt: timestamp.optional(), modelMode: z.string().optional(),
  evidence: z.array(resourceSchema), traces: z.array(resourceSchema),
  gaps: z.array(z.object({ label: z.string(), reason: z.string() })).default([]), cleanupErrors: z.array(z.string()).default([]),
})
type Manifest = z.infer<typeof manifestSchema>
interface Result { retry: number; status: string; duration: number; startTime: string }
interface Spec { id: string; title: string; file?: string; tests: { testId?: string; id?: string; projectName: string; expectedStatus: string; status: string; results: Result[] }[] }
interface Suite { file?: string; specs?: Spec[]; suites?: Suite[] }
const suiteSchema: z.ZodType<Suite> = z.lazy(() => z.object({ file: z.string().optional(), suites: z.array(suiteSchema).optional(), specs: z.array(z.object({
  id: z.string(), title: z.string(), file: z.string().optional(), tests: z.array(z.object({
    testId: z.string().optional(), id: z.string().optional(), projectName: z.string(), expectedStatus: z.string(), status: z.string(),
    results: z.array(z.object({ retry: z.number().int().nonnegative(), status: z.enum(['passed', 'failed', 'timedOut', 'interrupted', 'skipped']), duration: z.number().nonnegative(), startTime: timestamp })),
  })),
})).optional() }))
const modelSchema = z.object({ provider: z.string(), model: z.string(), agents: z.array(z.object({ modelId: z.string(), connectionId: z.string(), thinkingLevel: z.string().optional(), role: z.string(), allowCommands: z.boolean(), allowBrowser: z.boolean().optional() })).min(1) })
const usageSchema = z.object({ profileCalls: z.array(z.object({ id: z.string().min(1), usage: z.object({ totalTokens: z.number().nonnegative().optional() }).optional() })),
  budgets: z.array(z.object({ maxModelCalls: z.number().int().positive(), maxRuns: z.number().int().positive(), maxOutputTokens: z.number().int().positive(), usageIncomplete: z.boolean().optional() })) })
type ModelEvidence = z.infer<typeof modelSchema>
type UsageEvidence = z.infer<typeof usageSchema>
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1000)
const within = (root: string, file: string) => { const value = relative(root, file); return value !== '' && value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value) }

async function safeFile(root: string, file: string, limit: number) {
  const path = resolve(file)
  if (!within(root, path)) throw new Error('资源路径超出明确输入目录')
  let component = root
  for (const part of relative(root, path).split(sep)) {
    component = join(component, part)
    if ((await lstat(component)).isSymbolicLink()) throw new Error('拒绝符号链接资源')
  }
  const stat = await lstat(path)
  if (!stat.isFile() || stat.size > limit) throw new Error('资源不是普通文件或超过读取上限')
  return { path, size: stat.size }
}
async function json(root: string, file: string): Promise<unknown> {
  const checked = await safeFile(root, file, JSON_LIMIT)
  return JSON.parse(await readFile(checked.path, 'utf8'))
}
async function verify(root: string, file: string, item: z.infer<typeof resourceSchema>) {
  const checked = await safeFile(root, file, RESOURCE_LIMIT)
  if (checked.size !== item.bytes) throw new Error('资源字节数不一致')
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(checked.path)) hash.update(bytes)
  if (hash.digest('hex') !== item.sha256) throw new Error('资源hash不一致')
}

export async function loadDesktopTrials(input: string) {
  const root = await realpath(input), issues: string[] = []
  const rawReport = await json(root, join(root, 'playwright-results.json'))
  const report = z.object({ suites: z.array(suiteSchema), errors: z.array(z.unknown()).optional(), stats: z.object({ startTime: timestamp }) }).parse(rawReport)
  if (report.errors?.length) issues.push('最终Playwright报告包含全局错误')
  const optional = async (name: string) => { try { return await json(root, join(root, name)) } catch (error) { issues.push(`${name}: ${errorText(error)}`); return undefined } }
  const build = await optional('build-manifest.json') as { files?: Record<string, string>; sourceAndBuildDigest?: string } | undefined
  const registration = await optional('registration.json') as { desktopModelMode?: string; desktopMode?: string; repeat?: number } | undefined
  const verification = await optional('verification.json') as { changed?: string[] } | undefined
  if (!Array.isArray(verification?.changed) || verification.changed.length) issues.push('源码输入未确认保持不变')
  const files = Object.entries(build?.files ?? {}).sort(([a], [b]) => a.localeCompare(b))
  if (!files.length || files.some(([, hash]) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) issues.push('缺少有效构建文件hash清单')
  const contractFiles = files.filter(([file]) => file.startsWith('tests/e2e/') || file === 'scripts/test-group-collaboration.mjs' || file === 'playwright.config.ts' || file === 'ai-docs/spec/14.Agent群聊协作/07-GitHub参考与多轮测试用例集.md')
  const contractHash = contractFiles.length ? digest(contractFiles) : undefined
  const manifests: { path: string; value: Manifest; used: boolean }[] = []
  try {
    for (const dir of await readdir(join(root, 'scenarios'), { withFileTypes: true })) {
      if (!dir.isDirectory() && !dir.isSymbolicLink()) continue
      const path = join(root, 'scenarios', dir.name, 'manifest.json')
      try { manifests.push({ path, value: manifestSchema.parse(await json(root, path)), used: false }) }
      catch (error) { issues.push(`${dir.name}/manifest.json: ${errorText(error)}`) }
    }
  } catch (error) { issues.push(`scenarios: ${errorText(error)}`) }
  const trials: EvaluationTrial[] = []
  async function attempt(spec: Spec, project: string, expectedStatus: string, result: Result | undefined, id: string) {
    const matches = manifests.filter(item => item.value.testId === id && item.value.retry === (result?.retry ?? 0) && item.value.project === project)
    for (const item of matches) item.used = true
    const entry = matches.length === 1 ? matches[0] : undefined, manifest = entry?.value, gaps: string[] = []
    if (!entry) gaps.push('缺少唯一对应本次testId/project/retry的留证清单')
    const feature = basename(spec.file ?? '').replace(/\.feature.*$/, '.feature')
    if (manifest) {
      if (manifest.title !== spec.title || basename(manifest.location.file).replace(/\.feature.*$/, '.feature') !== feature) gaps.push('场景标题或文件身份不一致')
      if (!manifest.completedAt || !Number.isFinite(Date.parse(manifest.completedAt))) gaps.push('场景清单未完成')
      if (!Number.isFinite(Date.parse(manifest.startedAt)) || !result || Date.parse(manifest.startedAt) < Date.parse(result.startTime) || Date.parse(manifest.startedAt) > Date.parse(result.startTime) + result.duration) gaps.push('场景清单与实际尝试时间不对应')
      if (!manifest.evidence.length || !manifest.traces.length) gaps.push('缺少原始资源或回放')
      gaps.push(...manifest.gaps.map(gap => `${gap.label}: ${gap.reason}`), ...manifest.cleanupErrors)
    }
    let model: ModelEvidence | undefined, usage: UsageEvidence | undefined
    const refs: string[] = []
    if (entry) {
      const directory = resolve(entry.path, '..')
      for (const item of [...entry.value.evidence, ...entry.value.traces]) {
        const path = resolve(directory, item.path)
        try {
          await verify(directory, path, item)
          refs.push(relative(root, path))
          if (item.label === '独立员工及模型来源') model = modelSchema.parse(await json(root, path))
          if (item.label === '结束或失败时实际状态共享预算与调用') usage = usageSchema.parse(await json(root, path))
        } catch (error) { gaps.push(`${item.label ?? item.path}: ${errorText(error)}`) }
      }
    }
    const mode = manifest?.modelMode ?? registration?.desktopModelMode
    const modelMode = mode === 'real-provider' ? mode : mode === 'offline-protocol' || mode === 'offline-protocol-or-fixture' ? 'offline-protocol' : 'unknown'
    if (manifest?.modelMode && registration?.desktopModelMode && manifest.modelMode !== registration.desktopModelMode) gaps.push('批次与场景模型来源不一致')
    if (!['development', 'packaged'].includes(registration?.desktopMode ?? '')) gaps.push('桌面运行来源未知')
    const modelValid = model && typeof model.provider === 'string' && typeof model.model === 'string' && Array.isArray(model.agents) && model.agents.length && model.agents.every(agent => typeof agent.modelId === 'string' && typeof agent.connectionId === 'string' && typeof agent.role === 'string')
    const calls = usage && Array.isArray(usage.profileCalls) ? usage.profileCalls : undefined
    const validCalls = calls?.length && calls.every(call => typeof call.id === 'string') && new Set(calls.map(call => call.id)).size === calls.length
    const known = validCalls ? calls.filter(call => typeof call.usage?.totalTokens === 'number' && Number.isFinite(call.usage.totalTokens) && call.usage.totalTokens >= 0) : []
    const knownTokens = known.length ? known.reduce((sum, call) => sum + call.usage!.totalTokens!, 0) : null
    const budgets = usage && Array.isArray(usage.budgets) ? usage.budgets : undefined
    const validBudgets = budgets?.length && budgets.every(budget => [budget.maxModelCalls, budget.maxRuns, budget.maxOutputTokens].every(value => Number.isInteger(value) && value > 0))
    const failed = result && ['failed', 'timedOut', 'interrupted'].includes(result.status)
    if (expectedStatus !== 'passed') gaps.push('预期失败测试不能冒充业务成功')
    const technical = failed ? 'failed' : result?.status === 'passed' && !gaps.length && !issues.length ? 'passed' : 'incomplete'
    trials.push({
      id: `${id}:retry${result?.retry ?? 0}`, caseId: `${feature}:${spec.title}:${project}`, sample: manifest ? manifest.repeatEachIndex + 1 : null, retry: result?.retry ?? 0,
      cluster: feature, split: 'development', source: 'desktop', modelMode: `${registration?.desktopMode ?? 'unknown'}/${modelMode}`,
      attempted: !!result && result.status !== 'skipped', technical, verdict: technical === 'passed' ? 'review-needed' : technical,
      contractHash, modelSignature: modelValid ? digest({ provider: model!.provider, model: model!.model, members: model!.agents.map(agent => [agent.modelId, agent.connectionId, agent.thinkingLevel ?? 'unknown']) }) : undefined,
      // Legacy desktop archives omit complete turn/deadline limits. Partial Work limits cannot prove equal experimental budgets.
      budgetSignature: undefined, sourceHash: files.length ? digest(files) : undefined,
      team: modelValid ? digest(model!.agents.map(agent => [agent.role, agent.allowCommands, agent.allowBrowser])) : undefined,
      scorerVersion: 'boai-desktop-evidence-v1', sampleHash: digest({ rawReport, manifest, build, registration }),
      requests: validCalls ? calls!.length : null, requestMetric: validCalls ? 'profile-calls' : 'unknown',
      knownTokens, totalTokens: validCalls && known.length === calls!.length && validBudgets && budgets!.every(budget => budget.usageIncomplete === false) ? knownTokens : null,
      durationMs: result && Number.isFinite(result.duration) && result.duration >= 0 ? result.duration : null,
      evidence: [...(entry ? [relative(root, entry.path)] : []), ...refs], issues: [...issues, ...gaps],
    })
  }
  async function visit(suite: Suite) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      const id = test.testId || test.id || spec.id
      if (!id || !Array.isArray(test.results)) { issues.push('Playwright场景缺少身份或结果数组'); continue }
      const located = { ...spec, file: spec.file ?? suite.file }
      if (!test.results.length) await attempt(located, test.projectName, test.expectedStatus, undefined, id)
      for (const result of test.results) await attempt(located, test.projectName, test.expectedStatus, result, id)
    }
    for (const child of suite.suites ?? []) await visit(child)
  }
  for (const suite of report.suites) await visit(suite)
  for (const orphan of manifests.filter(item => !item.used)) issues.push(`留证清单不在最终报告中: ${relative(root, orphan.path)}`)
  if (!trials.length) throw new Error('没有可评估的最终桌面尝试；未生成空的通过报告')
  for (const trial of trials) {
    trial.issues = [...new Set([...trial.issues, ...issues])]
    if (trial.issues.length && trial.technical === 'passed') { trial.technical = 'incomplete'; trial.verdict = 'incomplete' }
  }
  return { trials, issues, input: root }
}
