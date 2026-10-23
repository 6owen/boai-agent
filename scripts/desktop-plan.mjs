/*
 * [INPUT]: 用户确认的T1固定计划、Playwright实际清单和原始执行报告。
 * [OUTPUT]: 唯一场景选择与严格一次通过核验；缺失/重复/跳过/重试/预期失败不可放行。
 * [POS]: T1执行与无依赖CI汇总共用合同；不运行GUI或访问模型。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
import { createHash } from 'node:crypto'
import { basename } from 'node:path'

const key = row => JSON.stringify([row.file, row.titles])
export function desktopPlanIdentity(bytes) {
  const plan = JSON.parse(bytes.toString())
  if (plan.version !== 1 || plan.t1?.mode !== 'offline-protocol-or-fixture' || plan.t1.ui !== 'all-registered-cases' || !Array.isArray(plan.t1.cases) || !plan.t1.cases.length) throw new Error('缺少完整T1核心及全UI计划')
  const ids = new Set(), keys = new Set()
  for (const row of plan.t1.cases) {
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(row.id ?? '') || typeof row.family !== 'string' || !row.family || !/^[a-z][a-z0-9-]*\.feature$/.test(row.file ?? '') || !Array.isArray(row.titles) || row.titles.length < 2 || row.titles.some(title => typeof title !== 'string' || !title.trim()) || ids.has(row.id) || keys.has(key(row))) throw new Error('T1场景身份缺失、重复或不明确')
    ids.add(row.id); keys.add(key(row))
  }
  return { plan, hash: createHash('sha256').update(bytes).digest('hex'), ids: [...ids] }
}

export function desktopReportRows(report) {
  if (!Array.isArray(report?.suites)) throw new Error('缺少桌面原始报告')
  const rows = []
  const walk = (suite, parents = []) => {
    const names = [...parents, suite.title]
    for (const spec of suite.specs ?? []) {
      const file = basename(spec.file ?? '')
      if (!file.endsWith('.feature.spec.js') || !spec.id || !Number.isInteger(spec.line) || spec.line < 1 || names[0] !== file) throw new Error('桌面清单场景位置不完整')
      rows.push({ file: file.slice(0, -8), titles: [...names.slice(1), spec.title], playwrightId: spec.id, line: spec.line, tests: spec.tests })
    }
    for (const nested of suite.suites ?? []) walk(nested, names)
  }
  for (const suite of report.suites) walk(suite)
  return rows
}

export function selectDesktopCases(identity, inventory, tier) {
  if (!['t1', 't3'].includes(tier) || !Array.isArray(inventory.errors) || inventory.errors.length) throw new Error('桌面层级或实际清单无效')
  const rows = desktopReportRows(inventory)
  const required = tier === 't1' ? identity.plan.t1.cases : rows.map(row => ({ id: `legacy-${row.playwrightId}`, file: row.file, titles: row.titles }))
  if (!required.length) throw new Error('桌面清单为空')
  const selected = required.map(row => {
    const found = rows.filter(actual => key(actual) === key(row))
    if (found.length !== 1 || found[0].tests?.length !== 1 || found[0].tests[0].expectedStatus !== 'passed') throw new Error(`必需场景缺失、重复或不是正常成功要求：${row.id}`)
    return { id: row.id, file: row.file, titles: row.titles, playwrightId: found[0].playwrightId, line: found[0].line }
  })
  if (new Set(selected.map(row => row.playwrightId)).size !== selected.length) throw new Error('场景映射不唯一')
  return selected
}

export function assertDesktopReport(report, selected) {
  const rows = desktopReportRows(report), stats = report.stats
  if (!selected.length || rows.length !== selected.length || new Set(selected.map(row => row.id)).size !== selected.length || new Set(rows.map(row => row.playwrightId)).size !== rows.length || !Array.isArray(report.errors) || report.errors.length || stats?.expected !== selected.length || stats.skipped !== 0 || stats.unexpected !== 0 || stats.flaky !== 0) throw new Error('桌面报告不完整、有异常或未全部一次通过')
  for (const expected of selected) {
    const matches = rows.filter(row => key(row) === key(expected) && row.playwrightId === expected.playwrightId)
    const test = matches[0]?.tests?.[0]
    if (matches.length !== 1 || matches[0].tests.length !== 1 || test.expectedStatus !== 'passed' || test.status !== 'expected' || test.results?.length !== 1 || test.results[0].status !== 'passed' || test.results[0].retry !== 0 || !Number.isFinite(test.results[0].duration)) throw new Error(`必需场景缺失、失败、跳过或重试：${expected.id}`)
  }
}
