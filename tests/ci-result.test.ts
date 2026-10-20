/*
 * [INPUT]: 必需CI任务、工程步骤清单、UI全场景结果和确切SHA。
 * [OUTPUT]: 漏步骤/漏场景/取消/旧SHA/脏树或缺字段均不能通过固定门槛。
 * [POS]: CI汇总的确定性验收；远程Actions另外验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
// @ts-expect-error Plain Node ESM CLI intentionally has no declaration file.
import { validateGate } from '../scripts/ci-result.mjs'

const jobs = { desktop: { result: 'success' }, ui: { result: 'success' } }
const selected = ['install', 'types', 'lint', 'unit', 'dataset', 'bdd']
const engineering = { sha: 'current', status: 'passed', selected, outcomes: Object.fromEntries(selected.map(id => [id, 'success'])) }
const ui = { status: 'passed', source: { commit: 'current', dirty: false }, cases: ['a', 'b'], errors: [] }
it('仅放行同SHA的完整必需检查', () => expect(() => validateGate(jobs, engineering, ui, ['a', 'b'], 'current')).not.toThrow())
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
])('%s不能放行', (_, jobResults, stepResults, uiResults) => expect(() => validateGate(jobResults, stepResults, uiResults, ['a', 'b'], 'current')).toThrow())
it.each([undefined, ''])('缺少目标SHA不能放行', sha => expect(() => validateGate(jobs, { ...engineering, sha }, { ...ui, source: { commit: sha, dirty: false } }, ['a', 'b'], sha)).toThrow())
