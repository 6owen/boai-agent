/*
 * [INPUT]: 真实隔离POSIX进程组、关闭后新增的后代发布及FeatureReview原件归档；Desktop界面仅为类型化替身。
 * [OUTPUT]: 先核对实际组退出再读取最后登记/导出，原件失败仍保留其余文件且结束失败；不证明实际Electron界面或供应商。
 * [POS]: 本机结束留证的时序/原件不变量测试，实际源码及应用包由BDD另验。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header，并上浮检查所属目录.folder.md。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type { TestInfo } from '@playwright/test'
import type { Desktop } from './e2e/support/desktop'
import { FeatureReview } from './e2e/support/feature-review'
import { archiveNativeFinalReview } from './e2e/support/native-final-review'

const roots: string[] = [], children: ChildProcess[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL'); await once(child, 'close')
  }
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
async function fixture(late: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'boai-final-review-')); roots.push(root)
  const file = join(root, 'late.txt'), state = join(root, 'state.json'), body = '退出前最后一次实际发布'
  const artifact = { id: 'late', name: 'late.txt', path: file, contentHash: sha(body) }
  await writeFile(state, JSON.stringify({ artifacts: [], status: 'running' }))
  const publish = `import { writeFile } from 'node:fs/promises'; await new Promise(done => setTimeout(done, 250)); await writeFile(${JSON.stringify(file)}, ${JSON.stringify(body)}); await writeFile(${JSON.stringify(state)}, ${JSON.stringify(JSON.stringify({ artifacts: [artifact], status: 'delivered' }))});`
  const script = `import { spawn } from 'node:child_process'; process.stdin.once('data', () => { ${late ? `spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(publish)}], { stdio: 'ignore' });` : ''} process.exit(0); }); process.stdout.write('ready');`
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child)
  await once(child.stdout!, 'data')
  vi.stubEnv('BOAI_REVIEW_RUN_DIR', join(root, 'review'))
  const info = { testId: 'final-originals', title: '退出后留证', titlePath: ['退出后留证'], file: 'fixture.feature', line: 1, column: 1, project: { name: 'desktop' }, retry: 0, repeatEachIndex: 0, workerIndex: 0, status: 'passed', expectedStatus: 'passed', errors: [], annotations: [], attach: vi.fn(async () => {}) } as unknown as TestInfo
  const review = (await FeatureReview.create(root, info))!
  const directory = join(root, 'review', 'scenarios', (await readdir(join(root, 'review', 'scenarios')))[0])
  const runtime = {
    app: { evaluate: async () => child.pid },
    close: async () => { const stopped = once(child, 'close'); child.stdin!.end('close'); await stopped },
    reviewNativeCheckpoint: async () => {},
    reviewData: (label: string, value: unknown) => review.data(label, value),
    reviewFile: (label: string, path: string, options: { required?: boolean; expectedSha256?: string }) => review.file(label, path, options),
  } as unknown as Desktop
  const records = async () => JSON.parse(await readFile(state, 'utf8')) as { artifacts: typeof artifact[]; status: string }
  const evidence = async () => JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as { evidence: { label: string; kind: string; path: string }[] }
  return { root, directory, child, runtime, records, evidence, artifact, body }
}

test.skipIf(process.platform === 'win32')('captures a last publication from a new group member after the observed leader exits', async () => {
  const { runtime, records, evidence, directory, child, body } = await fixture(true)
  await archiveNativeFinalReview(runtime, { label: '真实进程时序', records })
  expect(child.exitCode).toBe(0)
  const actual = (await evidence()).evidence
  const data = async (label: string) => JSON.parse(await readFile(join(directory, actual.find(item => item.label === label)!.path), 'utf8'))
  expect(await data('真实进程时序退出前实际状态')).toMatchObject({ artifacts: [], status: 'running' })
  expect(await data('真实进程时序实际退出核对')).toMatchObject({ observed: true, exitVerified: true, groups: [child.pid] })
  expect(await data('真实进程时序退出后实际状态')).toMatchObject({ exitVerified: true, records: { status: 'delivered', artifacts: [{ id: 'late' }] } })
  const file = actual.find(item => item.kind === 'file')!
  expect(await readFile(join(directory, file.path), 'utf8')).toBe(body)
})

test.skipIf(process.platform === 'win32')('a mismatched original fails the review and does not prevent later originals being archived', async () => {
  const { root, runtime, records, evidence, directory, artifact, body } = await fixture(false)
  await writeFile(artifact.path, body)
  const wrong = { ...artifact, id: 'changed', name: 'changed.txt', path: join(root, 'changed.txt') }
  await writeFile(wrong.path, '已外改')
  await writeFile(join(root, 'state.json'), JSON.stringify({ status: 'failed', artifacts: [wrong, artifact] }))
  await expect(archiveNativeFinalReview(runtime, { label: '原件失败', records })).rejects.toThrow('结束留证不完整')
  const actual = (await evidence()).evidence
  expect(actual.some(item => item.label === '原件失败退出后原件留证失败-changed')).toBe(true)
  const files = actual.filter(item => item.kind === 'file')
  expect(files).toHaveLength(1)
  expect(await readFile(join(directory, files[0].path), 'utf8')).toBe(body)
})
