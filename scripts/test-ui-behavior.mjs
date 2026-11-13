/*
 * [INPUT]: 已构建的应用、固定 UI BDD 和 Playwright 原始 JSON 报告。
 * [OUTPUT]: 三项实际行为结果、截图/trace与汇总；缺场、跳过、重试和全局错误均失败。
 * [POS]: 日常 UI 行为入口，不比较或更新截图基准。
 * [PROTOCOL]: 变化同步 Header、scripts/.folder.md、开发技能和 UI_TEST_CI.md。
 */
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const UI_BEHAVIOR_CASES = [
  '会话草稿在页面和会话切换后保持隔离',
  '外观设置通过界面保存并在重启后保持',
  '工具入口切换任务和知识资料时保持原会话',
]

export function summarizeUiBehavior(report) {
  const cases = [], errors = []
  const walk = suites => {
    if (!Array.isArray(suites)) throw new Error('缺少 Playwright 场景结果')
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        if (!Array.isArray(spec.tests) || !spec.tests.length) throw new Error('缺少实际测试结果')
        for (const test of spec.tests) {
          const passed = test.expectedStatus === 'passed' && test.status === 'expected' && test.results?.length === 1 && test.results[0].status === 'passed' && test.results[0].retry === 0
          cases.push({ name: spec.title, status: passed ? 'passed' : 'failed' })
        }
      }
      walk(suite.suites ?? [])
    }
  }
  try {
    if (!Array.isArray(report.errors) || report.errors.length) throw new Error('报告缺失或含有全局错误')
    walk(report.suites)
    if (cases.length !== UI_BEHAVIOR_CASES.length || UI_BEHAVIOR_CASES.some(name => cases.filter(item => item.name === name).length !== 1)) errors.push('固定三项场景缺失、重复或出现额外场景')
    if (cases.some(item => item.status !== 'passed')) errors.push('场景未通过、跳过、重试或未实际执行')
  } catch (error) { errors.push(error.message) }
  return { status: errors.length ? 'failed' : 'passed', cases, errors }
}

async function run() {
  if (process.argv.length > 2) throw new Error('Usage: pnpm test:ui:behavior (run pnpm build first)')
  const out = resolve('.local/ui-behavior'), report = join(out, 'playwright.json')
  await mkdir(out, { recursive: true })
  for (const name of ['playwright.json', 'summary.json']) await rm(join(out, name), { force: true })
  const env = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: report }
  for (const key of ['BOAI_UI_RUN_DIR', 'BOAI_UI_CANDIDATE_DIR', 'BOAI_UI_PROFILE', 'BOAI_TEST_PACKAGED_PATH', 'BOAI_TEST_DEV_SERVER']) delete env[key]
  const generate = spawnSync('pnpm', ['test:bddgen'], { stdio: 'inherit', env })
  if (generate.status !== 0) throw new Error('BDD 生成失败，未启动 UI 行为验证')
  const child = spawnSync('pnpm', ['exec', 'playwright', 'test', '--grep', '@ui-behavior', '--reporter=line,json', '--output', join(out, 'results')], {
    stdio: 'inherit', env,
  })
  let summary
  try { summary = summarizeUiBehavior(JSON.parse(await readFile(report, 'utf8'))) }
  catch (error) { summary = { status: 'failed', cases: [], errors: [`没有完整原始报告：${error.message}`] } }
  if (child.status !== 0) { summary.status = 'failed'; summary.errors.push(`Playwright 退出：${child.status ?? child.signal ?? 'unknown'}`) }
  await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify(summary, null, 2))
  if (summary.status !== 'passed') process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run().catch(error => { console.error(error); process.exitCode = 1 })
