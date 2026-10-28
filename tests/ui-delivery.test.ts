/*
 * [INPUT]: Real PNGs, official PR-shaped identities and delivery-state fault cases.
 * [OUTPUT]: Visual pending cannot pass the gate; stale review, foreign runs and unsafe sync fail closed.
 * [POS]: Local delivery protocol checks; no Electron or real GitHub mutation.
 * [PROTOCOL]: Update tests/.folder.md with scope changes.
 */
import { expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
// @ts-expect-error Shared plain Node delivery protocol.
import { candidateWorkflow, baselineOnlyCommit, deliveryOutcome, BASELINE_PREFIX } from '../scripts/ui-delivery-protocol.mjs'
// @ts-expect-error Shared plain Node delivery CLI.
import { currentPrRun, assertReview, assertBaselineAdvance } from '../scripts/ui-delivery.mjs'
// @ts-expect-error Shared plain Node CI controller.
import { comparePng, checkPayload, classifyCandidate, checkCommit } from '../scripts/ui-delivery-ci.mjs'
// @ts-expect-error Shared plain Node capture protocol.
import { assertCaptureMode } from '../scripts/ui-profiles.mjs'
// @ts-expect-error Shared official candidate verifier.
import { verifyCandidateRun, verifyCandidateIdentity } from '../scripts/ui-ci-baseline.mjs'
// @ts-expect-error Shared main-only updater.
import { verifyOnlineUpdate } from '../scripts/ui-baseline-update.mjs'
// @ts-expect-error Real evidence generator.
import { createBaselineReview } from '../scripts/ui-baseline-review.mjs'
// @ts-expect-error Shared contract hash.
import { baselineContractHash } from '../scripts/ui-regression.mjs'
const repo = '6owen/boai-agent', sha = 'a'.repeat(40), next = 'b'.repeat(40)
const pr = { number: 99, head: { sha, ref: 'fix/ui', repo: { id: 123 } }, base: { repo: { id: 123 } } }
const run = { id: 456, path: '.github/workflows/tests.yml', event: 'pull_request', head_sha: sha, head_branch: 'fix/ui', repository: { id: 123, full_name: repo }, head_repository: { full_name: repo }, pull_requests: [pr], run_attempt: 1, status: 'completed', conclusion: 'success' }
const source = { commit: sha, sourceHash: 'c'.repeat(64), dirty: false }
const artifact = { id: 7, name: 'ui-candidate-github-macos15-arm64', digest: 'sha256:' + 'd'.repeat(64), size_in_bytes: 12, expired: false, workflow_run: { head_sha: sha } }
const env = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: repo, GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/tests.yml@refs/pull/99/merge`, GITHUB_REF: 'refs/pull/99/merge', GITHUB_SHA: next, GITHUB_RUN_ID: '456', GITHUB_RUN_ATTEMPT: '1', RUNNER_OS: 'macOS', RUNNER_ARCH: 'ARM64', BOAI_UI_PR_HEAD: sha, BOAI_UI_PR_NUMBER: '99', BOAI_UI_HEAD_REPOSITORY: repo }
const environment = { version: 3, platform: 'darwin', arch: 'arm64', osVersion: '15.7.2', displays: [{ primary: true, width: 1920, height: 1080, workWidth: 1920, workHeight: 1000, scaleFactor: 1 }] }
const candidate = { profile: 'github-macos15-arm64', source, ci: { repository: repo, runId: '456', attempt: '1', sha, workflow: env.GITHUB_WORKFLOW_REF }, environment, built: { version: 1, inputHash: 'e'.repeat(64), outputHash: 'f'.repeat(64) }, selected: ['a'], cases: { a: {} } }
const updateEnv = { GITHUB_REPOSITORY: repo, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/ui-baseline-update.yml@refs/heads/main` }
it('真实PR API形状贯通采集、下载、身份和main受信更新，feature SHA与merge SHA分开', () => {
  expect(candidateWorkflow(run)).toBe(env.GITHUB_WORKFLOW_REF)
  expect(() => assertCaptureMode('candidate-ci', env)).not.toThrow()
  expect(verifyCandidateRun(run, [artifact], source, 456)).toEqual(artifact)
  expect(() => verifyCandidateIdentity(candidate, run, source, ['a'], candidate.built.inputHash)).not.toThrow()
  expect(verifyOnlineUpdate(run, sha, sha, updateEnv)).toBe('fix/ui')
  expect(() => verifyCandidateIdentity({ ...candidate, ci: { ...candidate.ci, sha: next } }, run, source, ['a'], candidate.built.inputHash)).toThrow()
})
it.each([{ event: 'push' }, { pull_requests: [] }, { pull_requests: [pr, pr] }, { pull_requests: [{ ...pr, head: { ...pr.head, sha: next } }] }, { pull_requests: [{ ...pr, base: { repo: { id: 999 } } }] }, { path: '.github/workflows/other.yml' }, { conclusion: 'failure' }])('拒绝非当前同仓库PR候选：%j', patch => {
  expect(() => verifyCandidateRun({ ...run, ...patch }, [artifact], source, 456)).toThrow()
  expect(() => verifyOnlineUpdate({ ...run, ...patch }, sha, sha, updateEnv)).toThrow()
})
it.each([{ BOAI_UI_PR_HEAD: '' }, { BOAI_UI_PR_NUMBER: '100' }, { BOAI_UI_HEAD_REPOSITORY: 'fork/repo' }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/tests.yml@refs/heads/main` }])('伪造PR采集上下文不能写候选：%j', patch => expect(() => assertCaptureMode('candidate-ci', { ...env, ...patch })).toThrow())
it('待审阅时Required是in_progress；跳过或失败不能冒充成功', () => {
  const needs = { plan: { result: 'success', outputs: { mode: 'capture' } }, capture: { result: 'success', outputs: { review: 'required' } }, ui: { result: 'skipped' } }
  expect(deliveryOutcome(needs)).toBe('review')
  const pending = checkPayload('review', next, 456, 1)
  expect(pending).toMatchObject({ name: 'Required checks', head_sha: next, status: 'in_progress', external_id: 'ui-delivery-456-1' })
  expect(pending).not.toHaveProperty('conclusion')
  for (const result of ['skipped', 'failure', 'cancelled']) {
    expect(deliveryOutcome({ ...needs, capture: { ...needs.capture, result } })).toBe('failed')
    expect(deliveryOutcome({ ...needs, plan: { result, outputs: { mode: 'verify' } } })).toBe('failed')
    expect(deliveryOutcome({ ...needs, plan: { result: 'success', outputs: { mode: 'verify' } }, ui: { result } })).toBe('failed')
  }
  expect(deliveryOutcome({ ...needs, capture: { result: 'success', outputs: { review: 'none' } }, ui: { result: 'success' } })).toBe('verify')
  expect(deliveryOutcome({ ...needs, capture: { result: 'success', outputs: {} }, ui: { result: 'success' } })).toBe('failed')
  expect(checkPayload('failed', next, 456, 1).conclusion).toBe('failure')
})
const reason = '需求调整菜单宽度，已查看a的旧新和diff', files = [BASELINE_PREFIX + 'manifest.json', BASELINE_PREFIX + 'a.png']
const manifest = { cases: { a: { source: { commit: sha }, provenance: { commit: sha, runId: '456', attempt: 1 }, reason } } }
const state = { head: sha, run: 456, attempt: 1, changed: ['a'], submission: { cases: ['a'], reason } }
it('只允许已审阅的纯基准提交快进；新源码回到采集，旧审阅失效', () => {
  expect(baselineOnlyCommit(files, manifest, sha)).toBe(true)
  expect(() => assertBaselineAdvance({ state, head: next, parent: sha, files, manifest })).not.toThrow()
  for (const patch of [{ files: [...files, 'apps/main.ts'] }, { parent: next }, { manifest: { cases: { a: { ...manifest.cases.a, reason: 'other review' } } } }, { state: { ...state, submission: undefined } }]) expect(() => assertBaselineAdvance({ state, head: next, parent: sha, files, manifest, ...patch })).toThrow()
  expect(baselineOnlyCommit(['apps/main.ts'], manifest, sha)).toBe(false)
  expect(() => assertReview(state, sha, run, ['a'], reason)).not.toThrow()
  for (const patch of [{ head: next }, { attempt: 2 }, { changed: ['a', 'b'] }]) expect(() => assertReview({ ...state, ...patch }, sha, run, ['a'], reason)).toThrow()
  expect(() => assertReview(state, sha, run, ['a', 'unrelated'], reason)).toThrow()
  expect(() => assertReview(state, sha, { ...run, conclusion: 'failure' }, ['a'], reason)).toThrow()
})
it('只接续当前head的PR运行，独立dispatch/其他PR/旧head不得审批', () => {
  const wrong = [{ ...run, id: 999, event: 'workflow_dispatch' }, { ...run, id: 1000, head_sha: next }, { ...run, id: 1001, pull_requests: [{ number: 12 }] }]
  expect(currentPrRun([...wrong, run], pr)).toEqual(run)
  expect(currentPrRun(wrong, pr)).toBeUndefined()
})
const png = (color: string) => { const canvas = createCanvas(2, 2), context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 2, 2); return canvas.toBuffer('image/png') }
it('分类使用锁定Playwright真实比较器与原阈值，保留已校准1/255容差', () => {
  expect(comparePng(png('#fefefe'), png('#ffffff'), { threshold: 0, maxDiffPixels: 0 })).toBeTruthy()
  expect(comparePng(png('#fefefe'), png('#ffffff'), { threshold: 0.005, maxDiffPixels: 0 })).toBeNull()
  expect(comparePng(png('#000000'), png('#ffffff'), { threshold: 0.005, maxDiffPixels: 0 })).toBeTruthy()
})
it('真实候选原件：阈值内无需改图，明确变化待审阅，行为失败和篡改仍失败', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-delivery-')), directory = join(root, 'candidate'), baseline = join(root, BASELINE_PREFIX)
  const save = async (path: string, data: unknown) => writeFile(path, JSON.stringify(data))
  const contract = { version: 1, threshold: 0.005, maxDiffPixels: 0, masks: [], height: 2, cases: [{ id: 'a', width: 2, mode: 'light' }] }
  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')
  try {
    await mkdir(baseline, { recursive: true }); await mkdir(join(directory, 'snapshots'), { recursive: true }); await mkdir(join(directory, 'capture'))
    const old = png('#ffffff'), actual = png('#fefefe'), contractHash = baselineContractHash(contract, 'a')
    await save(join(root, 'tests/e2e/baselines/contract.json'), contract)
    await writeFile(join(baseline, 'a.png'), old); await writeFile(join(directory, 'snapshots/a.png'), actual)
    await save(join(baseline, 'manifest.json'), { version: 1, profile: candidate.profile, environment, cases: { a: { sha256: hash(old), contract: contractHash, source, provenance: { version: 1, runId: '1', attempt: 1, artifactId: 7, commit: sha, digest: artifact.digest } } } })
    const nextCandidate = { ...candidate, cases: { a: { sha256: hash(actual), contract: contractHash } } }
    await save(join(directory, 'candidate.json'), nextCandidate)
    const raw = { suites: [{ specs: [{ title: '已登记界面 a 保持行为布局和视觉基线', tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }] }] }] }] }
    await save(join(directory, 'capture/playwright.json'), raw); await save(join(directory, 'capture/summary.json'), { status: 'passed' })
    await createBaselineReview(directory, ['a'], baseline)
    expect((await classifyCandidate(root, directory)).review).toBe('none')
    const changed = png('#000000'); await writeFile(join(directory, 'snapshots/a.png'), changed)
    nextCandidate.cases.a.sha256 = hash(changed); await save(join(directory, 'candidate.json'), nextCandidate); await rm(join(directory, 'review'), { recursive: true }); await createBaselineReview(directory, ['a'], baseline)
    expect((await classifyCandidate(root, directory)).changed).toEqual(['a'])
    raw.suites[0]!.specs[0]!.tests[0]!.results[0]!.status = 'failed'; await save(join(directory, 'capture/playwright.json'), raw)
    await expect(classifyCandidate(root, directory)).rejects.toThrow('一次成功')
    raw.suites[0]!.specs[0]!.tests[0]!.results[0]!.status = 'passed'; await save(join(directory, 'capture/playwright.json'), raw)
    await writeFile(join(directory, 'review/a-diff.png'), png('#00ff00'))
    await expect(classifyCandidate(root, directory)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('实际工作流不把skipped当green：自定义Required独立于调度job；保留readonly原件门禁', async () => {
  const workflow = parse(await readFile('.github/workflows/tests.yml', 'utf8'))
  expect(workflow.jobs.plan.permissions.checks).toBe('write')
  expect(workflow.jobs.required.permissions.checks).toBe('write')
  expect(workflow.jobs.required.name).not.toBe('Required checks')
  expect(workflow.jobs.required.steps.at(-1)).toMatchObject({ if: 'always()', run: 'node scripts/ui-delivery-ci.mjs finish' })
  expect(workflow.jobs.capture.steps.find((step: { run?: string }) => step.run?.includes('candidate-ci')).env.BOAI_UI_PR_HEAD).toBe('${{ github.event.pull_request.head.sha }}')
  const controller = await readFile('scripts/ui-delivery-ci.mjs', 'utf8')
  expect(controller).toContain("['scripts/ci-result.mjs', 'gate-shards']")
  expect(workflow.jobs.ui.if).toContain("needs.capture.outputs.review == 'none'")
})

it('Required发布到PR head供合并保护识别，实际测试仍使用独立merge SHA', () => {
  expect(checkCommit('pull_request', { pull_request: pr }, next)).toBe(sha)
  expect(checkCommit('push', null, next)).toBe(next)
  expect(() => checkCommit('pull_request', null, next)).toThrow()
})
