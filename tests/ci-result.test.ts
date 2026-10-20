/*
 * [INPUT]: 必需CI任务、工程步骤清单、UI全场景结果和确切SHA。
 * [OUTPUT]: 桌面证据具名绑定，原工程/UI负例保留；T1缺失/旧计划/T3冒充或原始场景未执行也不能通过。
 * [POS]: CI汇总的确定性验收；远程Actions另外验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
// @ts-expect-error Plain Node ESM CLI intentionally has no declaration file.
import { validateGate } from '../scripts/ci-result.mjs'
// @ts-expect-error Shared plain Node contract has no declaration file.
import { desktopPlanIdentity } from '../scripts/desktop-plan.mjs'

const jobs = { desktop: { result: 'success' }, ui: { result: 'success' } }
const selected = ['install', 'types', 'lint', 'build', 'unit', 'dataset', 'bdd']
const engineering = { sha: 'current', status: 'passed', selected, outcomes: Object.fromEntries(selected.map(id => [id, 'success'])) }
const ui = { status: 'passed', source: { commit: 'current', dirty: false }, cases: ['a', 'b'], errors: [] }
const identity = desktopPlanIdentity(Buffer.from(JSON.stringify({ version: 1, t1: { mode: 'offline-protocol-or-fixture', ui: 'all-registered-cases', cases: [{ id: 'core-case', family: 'chat', file: 'core.feature', titles: ['Core', 'Case'] }] } })))
const desktop = { tier: 't1', status: 'passed', source: { commit: 'current', dirty: false }, cases: ['core-case'], errors: [], planHash: identity.hash }
const raw = { suites: [{ title: 'core.feature.spec.js', suites: [{ title: 'Core', specs: [{ title: 'Case', file: 'core.feature.spec.js', id: 'pw-one', line: 6, tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, duration: 12 }] }] }] }] }], errors: [], stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 } }
it('仅放行同SHA的完整必需检查', () => expect(() => validateGate(jobs, engineering, ui, ['a', 'b'], 'current', { summary: desktop, report: raw, identity })).not.toThrow())
it.each([
  ['取消', { ...jobs, ui: { result: 'cancelled' } }, engineering, ui],
  ['漏工程步骤', jobs, { ...engineering, selected: selected.slice(0, -1) }, ui],
  ['跳过工程步骤', jobs, { ...engineering, outcomes: { ...engineering.outcomes, bdd: 'skipped' } }, ui],
  ['旧工程SHA', jobs, { ...engineering, sha: 'old' }, ui],
  ['旧UI SHA', jobs, engineering, { ...ui, source: { ...ui.source, commit: 'old' } }],
  ['漏UI场景', jobs, engineering, { ...ui, cases: ['a'] }],
  ['重复UI场景', jobs, engineering, { ...ui, cases: ['a', 'a'] }],
  ['缺错误字段', jobs, engineering, { ...ui, errors: undefined }],
  ['执行树脏', jobs, engineering, { ...ui, source: { ...ui.source, dirty: true } }],
  ['缺工作树状态', jobs, engineering, { ...ui, source: { commit: 'current' } }],
])('%s不能放行', (_, jobResults, stepResults, uiResults) => expect(() => validateGate(jobResults, stepResults, uiResults, ['a', 'b'], 'current', { summary: desktop, report: raw, identity })).toThrow())
it.each([undefined, ''])('缺少目标SHA不能放行', sha => expect(() => validateGate(jobs, { ...engineering, sha }, { ...ui, source: { commit: sha, dirty: false } }, ['a', 'b'], sha, { summary: desktop, report: raw, identity })).toThrow())
it.each([{ tier: 't3' }, { planHash: 'old' }, { cases: [] }, { source: { commit: 'old', dirty: false } }, { source: { commit: 'current', dirty: true } }, { errors: undefined }])('T1汇总不完整不能放行：%j', patch => expect(() => validateGate(jobs, engineering, ui, ['a', 'b'], 'current', { summary: { ...desktop, ...patch }, report: raw, identity })).toThrow('T1报告'))
it('退出0和T1汇总通过不能掩盖原报告没有执行', () => {
  const notRun = structuredClone(raw); notRun.suites[0]!.suites[0]!.specs[0]!.tests[0]!.results = []
  expect(() => validateGate(jobs, engineering, ui, ['a', 'b'], 'current', { summary: desktop, report: notRun, identity })).toThrow('必需场景')
})
it('旧CI只有七步骤和UI通过仍因缺T1原件拒绝', () => expect(() => validateGate(jobs, engineering, ui, ['a', 'b'], 'current', { summary: undefined, report: undefined, identity })).toThrow('T1报告'))
