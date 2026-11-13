/*
 * [INPUT]: 固定 UI 行为清单和 Playwright 原始结果的正反例。
 * [OUTPUT]: 零场、缺场、重复、跳过、重试、全局错误和未预期失败不能冒充通过。
 * [POS]: 无 GUI 的日常 UI runner 回归。
 * [PROTOCOL]: 变化同步 Header 和 tests/.folder.md。
 */
import { expect, it } from 'vitest'
// @ts-expect-error Plain Node CLI intentionally has no declaration file.
import { UI_BEHAVIOR_CASES, summarizeUiBehavior } from '../scripts/test-ui-behavior.mjs'

const report = () => ({ errors: [], suites: [{ specs: UI_BEHAVIOR_CASES.map((title: string) => ({ title, tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0 }] }] })) }] })
it('requires each fixed behavior to actually pass once', () => {
  expect(summarizeUiBehavior(report())).toMatchObject({ status: 'passed', cases: UI_BEHAVIOR_CASES.map((name: string) => ({ name, status: 'passed' })), errors: [] })
})
it.each(['missing', 'extra', 'duplicate', 'skipped', 'retry', 'expected-failure', 'global-error', 'empty', 'truncated'])('rejects %s evidence', kind => {
  const value = report()
  if (kind === 'missing') value.suites[0].specs.pop()
  if (kind === 'extra') value.suites[0].specs.push({ ...value.suites[0].specs[0], title: '额外场景' })
  if (kind === 'duplicate') value.suites[0].specs[1].title = value.suites[0].specs[0].title
  if (kind === 'skipped') value.suites[0].specs[0].tests[0].results[0].status = 'skipped'
  if (kind === 'retry') value.suites[0].specs[0].tests[0].results.push({ status: 'passed', retry: 1 })
  if (kind === 'expected-failure') value.suites[0].specs[0].tests[0].expectedStatus = 'failed'
  if (kind === 'global-error') Object.assign(value, { errors: [{ message: 'worker crashed' }] })
  if (kind === 'empty') value.suites = []
  expect(summarizeUiBehavior(kind === 'truncated' ? {} : value).status).toBe('failed')
})
