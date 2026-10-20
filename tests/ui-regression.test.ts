/*
 * [INPUT]: Playwright原始结果和UI门槛CLI。
 * [OUTPUT]: 缺失/跳过/预期失败/重试/重复场景不能冒充通过，CI禁止写基线。
 * [POS]: UI回归门槛负例；实际像素和业务断言由原BDD验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
// @ts-expect-error Plain Node ESM CLI intentionally has no declaration file.
import { acquireUiLock, assertUiExecutionMode, baselineContractHash, validateReport } from '../scripts/ui-regression.mjs'

const record = (patch = {}) => ({ title: '已登记界面 chat-light 保持行为布局和视觉基线', tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }], ...patch }] })
const report = (specs: unknown[]) => ({ errors: [], suites: [{ specs }] })
describe('UI回归结果必须完整且真实成功', () => {
  it.each([{ BOAI_TEST_PACKAGED_PATH: '/Applications/BOAI.app' }, { BOAI_TEST_DEV_SERVER: '1' }, { BOAI_RENDERER_URL: 'http://localhost:5173' }])('拒绝将其他运行入口算作当前构建基线', env => expect(() => assertUiExecutionMode(env)).toThrow(/完整构建/))
  it('新增场景不使无关旧基线失效，修改旧比较条件必须重新审阅', () => {
    const contract = { version: 1, height: 900, threshold: 0, maxDiffPixels: 0, masks: [], cases: [{ id: 'chat-light', width: 1280 }] }
    const initial = baselineContractHash(contract, 'chat-light')
    expect(baselineContractHash({ ...contract, cases: [...contract.cases, { id: 'new', width: 1280 }] }, 'chat-light')).toBe(initial)
    expect(baselineContractHash({ ...contract, threshold: 0.2 }, 'chat-light')).not.toBe(initial)
  })
  it('只接受唯一的一次实际成功', () => expect(validateReport(report([record()]), ['chat-light']).status).toBe('passed'))
  it.each([
    ['缺场景', report([])],
    ['重复场景', report([record(), record()])],
    ['跳过', report([record({ status: 'skipped', results: [{ status: 'skipped' }] })])],
    ['预期失败', report([record({ expectedStatus: 'failed', results: [{ status: 'failed' }] })])],
    ['失败后重试', report([record({ status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] })])],
    ['空结果', report([record({ results: [] })])],
    ['中断', report([record({ results: [{ status: 'interrupted' }] })])],
    ['报告级错误', { ...report([record()]), errors: [{ message: 'worker lost' }] }],
  ])('%s不能通过', (_, input) => expect(validateReport(input, ['chat-light']).status).toBe('failed'))
  it.each(['candidate', 'accept'])('CI拒绝%s写入入口', command => {
    expect(() => execFileSync(process.execPath, ['scripts/ui-regression.mjs', command], { env: { ...process.env, CI: 'true' }, stdio: 'pipe' })).toThrow(/Command failed/)
  })
  it('同一资源仅有一个执行器，持有进程实际死亡后自动释放', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'boai-ui-lock-')), file = join(directory, 'mutex.sqlite')
    const cli = pathToFileURL(resolve('scripts/ui-regression.mjs')).href
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import {acquireUiLock} from ${JSON.stringify(cli)};globalThis.release=acquireUiLock(${JSON.stringify(file)});console.log('ready');setInterval(()=>{},1000)`], { stdio: ['ignore', 'pipe', 'pipe'] })
    const exited = new Promise<void>((done) => child.once('exit', () => done()))
    try {
      await new Promise<void>((done, reject) => { child.once('error', reject); child.stdout.once('data', () => done()); child.once('exit', () => reject(new Error('锁进程在就绪前退出'))) })
      expect(() => acquireUiLock(file)).toThrow(/资源锁/)
      child.kill('SIGKILL'); await exited
      const release = acquireUiLock(file)
      expect(() => acquireUiLock(file)).toThrow(/资源锁/)
      release()
      acquireUiLock(file)()
    } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited } await rm(directory, { recursive: true, force: true }) }
  })
})
