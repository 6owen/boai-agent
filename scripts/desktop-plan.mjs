/*
 * [INPUT]: UI 场景清单和 Playwright 原始执行报告。
 * [OUTPUT]: 完整场景与严格一次通过核验；缺失/重复/跳过/重试/预期失败不可放行。
 * [POS]: UI 执行与无依赖 CI 汇总共用报告核验；不运行GUI或访问模型。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
import { basename } from 'node:path'

const key = row => JSON.stringify([row.file, row.titles])
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

export function assertDesktopReport(report, selected) {
  const rows = desktopReportRows(report), stats = report.stats
  if (!selected.length || rows.length !== selected.length || new Set(selected.map(row => row.id)).size !== selected.length || new Set(rows.map(row => row.playwrightId)).size !== rows.length || !Array.isArray(report.errors) || report.errors.length || stats?.expected !== selected.length || stats.skipped !== 0 || stats.unexpected !== 0 || stats.flaky !== 0) throw new Error('桌面报告不完整、有异常或未全部一次通过')
  for (const expected of selected) {
    const matches = rows.filter(row => key(row) === key(expected) && row.playwrightId === expected.playwrightId)
    const test = matches[0]?.tests?.[0]
    if (matches.length !== 1 || matches[0].tests.length !== 1 || test.expectedStatus !== 'passed' || test.status !== 'expected' || test.results?.length !== 1 || test.results[0].status !== 'passed' || test.results[0].retry !== 0 || !Number.isFinite(test.results[0].duration)) throw new Error(`必需场景缺失、失败、跳过或重试：${expected.id}`)
  }
}
