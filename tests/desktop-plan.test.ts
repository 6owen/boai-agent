/*
 * [INPUT]: 明确标识的Playwright协议清单/执行报告和固定T1计划。
 * [OUTPUT]: 缺失/重复/跳过/重试/预期失败、假成功统计与不完整计划均拒绝；不是GUI成功证据。
 * [POS]: T1/T3选择和必需报告边界的确定性测试。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { expect, it } from 'vitest'
// @ts-expect-error Shared plain Node contract has no declaration file.
import { desktopPlanIdentity, selectDesktopCases, assertDesktopReport } from '../scripts/desktop-plan.mjs'

const plan = { version: 1, t1: { mode: 'offline-protocol-or-fixture', ui: 'all-registered-cases', cases: [{ id: 'core-case', family: 'chat', file: 'core.feature', titles: ['Core', 'Case'] }] } }
const identity = desktopPlanIdentity(Buffer.from(JSON.stringify(plan)))
const report = () => ({ suites: [{ title: 'core.feature.spec.js', suites: [{ title: 'Core', specs: [{ title: 'Case', file: 'core.feature.spec.js', id: 'pw-one', line: 6, tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, duration: 12 }] }] }] }] }], errors: [], stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 } })
const selected = selectDesktopCases(identity, report(), 't1')
it('固定核心按真实清单唯一映射，原始一次成功才能通过', () => {
  expect(selected).toEqual([{ id: 'core-case', file: 'core.feature', titles: ['Core', 'Case'], playwrightId: 'pw-one', line: 6 }])
  expect(() => assertDesktopReport(report(), selected)).not.toThrow()
})
it.each([
  ['空计划', (p: typeof plan) => { p.t1.cases = [] }],
  ['部分UI', (p: typeof plan) => { p.t1.ui = 'selected-cases' }],
  ['真实模型', (p: typeof plan) => { p.t1.mode = 'real-provider' }],
  ['重复ID', (p: typeof plan) => { p.t1.cases.push({ ...p.t1.cases[0]!, titles: ['Core', 'Other'] }) }],
  ['重复选择', (p: typeof plan) => { p.t1.cases.push({ ...p.t1.cases[0]!, id: 'another-id' }) }],
  ['越界文件', (p: typeof plan) => { p.t1.cases[0]!.file = '../outside.feature' }],
] as const)('%s不构成核心合同', (_, mutate) => { const copy = structuredClone(plan); mutate(copy); expect(() => desktopPlanIdentity(Buffer.from(JSON.stringify(copy)))).toThrow() })
it('计划字节变动不能复用原hash', () => expect(desktopPlanIdentity(Buffer.from(JSON.stringify(plan, null, 2))).hash).not.toBe(identity.hash))
it('核心不在清单时执行前拒绝', () => { const data = report(); data.suites[0]!.suites[0]!.specs = []; expect(() => selectDesktopCases(identity, data, 't1')).toThrow('必需场景缺失') })
it('清单中同名重复不能任择一个', () => { const data = report(); data.suites[0]!.suites[0]!.specs.push({ ...data.suites[0]!.suites[0]!.specs[0]!, id: 'pw-two' }); expect(() => selectDesktopCases(identity, data, 't1')).toThrow('必需场景缺失、重复') })
it('预期失败的测试不能作为必需成功', () => { const data = report(); data.suites[0]!.suites[0]!.specs[0]!.tests[0]!.expectedStatus = 'failed'; expect(() => selectDesktopCases(identity, data, 't1')).toThrow('不是正常成功要求') })
it('T3完整旧清单仍保留核心和其余场景', () => {
  const data = report(); data.suites[0]!.suites[0]!.specs.push({ ...data.suites[0]!.suites[0]!.specs[0]!, title: 'Legacy', id: 'pw-two', line: 12 })
  expect(selectDesktopCases(identity, data, 't1')).toHaveLength(1)
  expect(selectDesktopCases(identity, data, 't3')).toHaveLength(2)
})
it.each([
  ['假通过统计', (data: ReturnType<typeof report>) => { data.stats.expected = 0 }],
  ['漏结果', (data: ReturnType<typeof report>) => { data.suites = [] }],
  ['全局错误', (data: ReturnType<typeof report>) => { Object.assign(data, { errors: [{ message: 'worker failed' }] }) }],
  ['跳过统计', (data: ReturnType<typeof report>) => { data.stats.skipped = 1 }],
  ['失败统计', (data: ReturnType<typeof report>) => { data.stats.unexpected = 1 }],
  ['重试统计', (data: ReturnType<typeof report>) => { data.stats.flaky = 1 }],
  ['另一个场景', (data: ReturnType<typeof report>) => { data.suites[0]!.suites[0]!.specs[0]!.title = 'Other' }],
  ['ID替换', (data: ReturnType<typeof report>) => { data.suites[0]!.suites[0]!.specs[0]!.id = 'other' }],
  ['只改统计掩盖跳过', (data: ReturnType<typeof report>) => { data.suites[0]!.suites[0]!.specs[0]!.tests[0]!.results[0]!.status = 'skipped' }],
  ['预期失败', (data: ReturnType<typeof report>) => { data.suites[0]!.suites[0]!.specs[0]!.tests[0]!.expectedStatus = 'failed' }],
  ['没有真正执行', (data: ReturnType<typeof report>) => { data.suites[0]!.suites[0]!.specs[0]!.tests[0]!.results = [] }],
  ['重试后成功', (data: ReturnType<typeof report>) => { const result = data.suites[0]!.suites[0]!.specs[0]!.tests[0]!.results; result.unshift({ status: 'failed', retry: 0, duration: 12 }); result[1]!.retry = 1 }],
] as const)('%s不能靠退出0或汇总成功放行', (_, mutate) => { const data = report(); mutate(data); expect(() => assertDesktopReport(data, selected)).toThrow() })
