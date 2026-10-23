/*
 * [INPUT]: Codex开发循环的固定测试计划、Vitest原始JSON和结构化文本修复。
 * [OUTPUT]: 严格输入/补丁合同、完整逐例比较；质量声明限于开发检查，不替代语义评审。
 * [POS]: tests/evaluation/repair-contract.ts，开发侧自迭代的纯合同与评分。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { relative, isAbsolute } from 'node:path'
import { z } from 'zod'

export const REPAIR_VERSION = 'boai-codex-repair-v1'
export const REPAIR_LIMITS = { fileBytes: 1024 * 1024, proposalBytes: 256 * 1024, logBytes: 8 * 1024 * 1024, contextBytes: 160_000, snapshotBytes: 64 * 1024 * 1024 } as const
export function safeRelative(path: string) {
  return /^[\w./-]+$/.test(path) && !isAbsolute(path) && !path.split('/').some(part => !part || part === '.' || part === '..')
}
const pathSchema = z.string().refine(safeRelative, '必须使用仓库内规范相对路径')
export const repairConfigSchema = z.object({
  goal: z.string().trim().min(1).max(8000),
  allowedFiles: z.array(pathSchema.refine(path => /^src\/.+\.(ts|tsx)$/.test(path), '只允许修改src内明确的TS/TSX文件')).min(1).max(20),
  tests: z.array(pathSchema.refine(path => /^tests\/.+\.test\.ts$/.test(path) && !path.includes('holdout'), '必须选择开发/回归Vitest文件')).min(1).max(40),
  contextFiles: z.array(pathSchema).max(30).default([]),
  maxRounds: z.number().int().min(1).max(10).default(3),
  maxNoImprovement: z.number().int().min(1).max(10).default(2),
  repeats: z.number().int().min(1).max(3).default(1),
  testTimeoutMs: z.number().int().min(1000).max(600_000).default(120_000),
  codexTimeoutMs: z.number().int().min(1000).max(600_000).default(180_000),
  totalTimeoutMs: z.number().int().min(1000).max(3_600_000).default(900_000),
  typecheck: z.boolean().default(true),
  model: z.string().regex(/^[\w.:-]+$/).optional(),
}).strict().superRefine((value, ctx) => {
  for (const field of ['allowedFiles', 'tests', 'contextFiles'] as const) if (new Set(value[field]).size !== value[field].length) ctx.addIssue({ code: 'custom', message: `${field}不能重复` })
  if (value.maxNoImprovement > value.maxRounds) ctx.addIssue({ code: 'custom', message: '无提升停止数不能超过最大轮数' })
  if (value.contextFiles.some(path => !/^(src\/|tests\/|ai-docs\/spec\/)/.test(path) || path.includes('holdout') || path.startsWith('tests/evaluation/'))) ctx.addIssue({ code: 'custom', message: '上下文只接源码/开发测试/规格；不投喂冻结题库或私有目录' })
})
export type RepairConfig = z.infer<typeof repairConfigSchema>
export const proposalSchema = z.object({
  hypothesis: z.string().trim().min(1).max(4000),
  edits: z.array(z.object({ path: pathSchema, oldText: z.string().min(1).max(64_000), newText: z.string().max(64_000) }).strict()).max(12),
}).strict()
export type RepairProposal = z.infer<typeof proposalSchema>
// Plain JSON Schema is also supplied to codex exec; application checks remain authoritative.
export const proposalJsonSchema = { type: 'object', additionalProperties: false, required: ['hypothesis', 'edits'], properties: {
  hypothesis: { type: 'string' }, edits: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'oldText', 'newText'], properties: { path: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } } } },
} }
export interface RepairCheck { key: string; file: string; name: string; sample: number; status: 'passed' | 'failed'; failures: string[] }
export interface RepairEvaluation { checks: RepairCheck[]; issues: string[]; typecheck: 'passed' | 'failed' | 'not-requested'; evidence: string[] }
const reportSchema = z.object({
  numTotalTests: z.number().int().nonnegative(), numPassedTests: z.number().int().nonnegative(), numFailedTests: z.number().int().nonnegative(),
  numPendingTests: z.number().int().nonnegative(), numTodoTests: z.number().int().nonnegative(), success: z.boolean(),
  testResults: z.array(z.object({ name: z.string(), status: z.enum(['passed', 'failed']), message: z.string(),
    assertionResults: z.array(z.object({ fullName: z.string().min(1), status: z.string(), failureMessages: z.array(z.string()) })),
  })),
})
export function parseRepairReport(value: unknown, cwd: string, tests: string[], sample: number, exitCode: number | null) {
  const parsed = reportSchema.safeParse(value), checks: RepairCheck[] = [], issues: string[] = []
  if (!parsed.success) return { checks, issues: ['Vitest报告缺失或格式不完整'] }
  const report = parsed.data, seen = new Set<string>(), files = new Set<string>()
  for (const suite of report.testResults) {
    const file = relative(cwd, suite.name).replaceAll('\\', '/')
    if (!tests.includes(file) || files.has(file)) issues.push(`测试文件未登记或重复：${file}`)
    files.add(file)
    if (suite.message || !suite.assertionResults.length) issues.push(`测试装载/钩子失败或空文件：${file}`)
    for (const assertion of suite.assertionResults) {
      const key = JSON.stringify([file, assertion.fullName, sample])
      if (seen.has(key)) issues.push(`测试身份重复：${key}`)
      seen.add(key)
      if (!['passed', 'failed'].includes(assertion.status)) { issues.push(`跳过/未完成测试不能算通过：${key}`); continue }
      checks.push({ key, file, name: assertion.fullName, sample, status: assertion.status as RepairCheck['status'], failures: assertion.failureMessages })
    }
  }
  for (const file of tests) if (!files.has(file)) issues.push(`计划测试未运行：${file}`)
  if (!checks.length || checks.length !== report.numTotalTests || report.numPendingTests || report.numTodoTests || checks.filter(row => row.status === 'passed').length !== report.numPassedTests || checks.filter(row => row.status === 'failed').length !== report.numFailedTests) issues.push('测试分母/计数不完整')
  const passed = checks.every(row => row.status === 'passed') && !issues.length
  if (report.success !== passed || exitCode !== (passed ? 0 : 1)) issues.push('退出码、套件状态与逐例结果不一致')
  return { checks, issues }
}
export function compareRepairChecks(candidate: RepairEvaluation, baseline: RepairEvaluation) {
  const issues = [...baseline.issues, ...candidate.issues], previous = new Map(baseline.checks.map(row => [row.key, row]))
  if (new Set(candidate.checks.map(row => row.key)).size !== candidate.checks.length || previous.size !== baseline.checks.length || candidate.checks.length !== previous.size || candidate.checks.some(row => !previous.has(row.key))) issues.push('固定测试身份/重复采样集合变化')
  const fixes = candidate.checks.filter(row => row.status === 'passed' && previous.get(row.key)?.status === 'failed').map(row => row.key)
  const regressions = candidate.checks.filter(row => row.status === 'failed' && previous.get(row.key)?.status === 'passed').map(row => row.key)
  if (baseline.typecheck !== 'not-requested' && candidate.typecheck === 'not-requested') issues.push('漏掉登记的类型检查')
  const status = issues.length ? 'blocked' : regressions.length || candidate.typecheck === 'failed' ? 'rejected'
    : fixes.length || baseline.typecheck === 'failed' && candidate.typecheck === 'passed' ? 'improved' : 'unchanged'
  return { status, issues, fixes, regressions, allPassed: !issues.length && candidate.checks.length > 0 && candidate.checks.every(row => row.status === 'passed') && candidate.typecheck !== 'failed',
    evidenceLevel: 'fixed-development-checks' as const, semanticQuality: 'not-assessed' as const }
}
export function applyRepairEdits(files: Record<string, string>, proposal: RepairProposal, allowed: string[]) {
  const output = { ...files }
  for (const edit of proposalSchema.parse(proposal).edits) {
    if (!allowed.includes(edit.path) || typeof output[edit.path] !== 'string') throw new Error(`修改超出登记文件：${edit.path}`)
    if (output[edit.path].split(edit.oldText).length !== 2) throw new Error(`原文不是唯一精确匹配：${edit.path}`)
    if (edit.oldText === edit.newText) throw new Error('补丁没有改变内容')
    output[edit.path] = output[edit.path].replace(edit.oldText, () => edit.newText)
    if (Buffer.byteLength(output[edit.path]) > REPAIR_LIMITS.fileBytes) throw new Error('候选文件超过大小限制')
  }
  return output
}
