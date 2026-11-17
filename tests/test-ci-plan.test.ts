/*
 * [INPUT]: PR change scopes, a real temporary Git repository and controlled Vitest file-list output.
 * [OUTPUT]: Small frontend changes avoid unrelated backend tests; mixed/core changes, missing tests and failed checks cannot silently pass.
 * [POS]: Test workflow routing regressions, no Electron or model calls.
 * [PROTOCOL]: Update tests/.folder.md and scripts/test-ci-plan.mjs together.
 */
import { afterEach, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'
// @ts-expect-error Plain Node CI entrypoint.
import { frontendTest, preparePlan, relatedFiles, selectFrontendTests, supplementalTests, testMode } from '../scripts/test-ci-plan.mjs'

const page = 'apps/electron/src/renderer/pages/example.tsx'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const temporary = () => { const root = mkdtempSync(join(tmpdir(), 'boai-ci-plan-')); roots.push(root); return root }
const write = (root: string, path: string, content: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content) }
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

it('routes a frontend-only PR without treating the whole repository as affected', () => {
  expect(testMode([page, 'ai-docs/implementation/change.md', 'apps/electron/src/renderer/pages/.folder.md'])).toBe('frontend')
  expect(testMode(['packages/ui/src/components/button.tsx'])).toBe('frontend')
  expect(testMode(['packages/tokens/src/theme.css'])).toBe('frontend')
  expect(testMode(['README.md', '.agents/skills/boai-dev-workflow/SKILL.md'])).toBe('documentation')
  expect(testMode(['UI_TEST_CI.md', 'ai-docs/design/flow.svg', 'ai-docs/design/flow.tldraw'])).toBe('documentation')
})

it.each(['packages/runtime/src/service.ts', 'packages/shared/src/ipc.ts', 'apps/electron/src/preload.ts', 'pnpm-lock.yaml', 'package.json', 'vite.config.ts', '.github/workflows/test.yml', 'scripts/test-ci-plan.mjs', 'tests/test-ci-plan.test.ts', 'tests/service.test.ts'])('keeps mixed frontend and %s changes on full regression', path => {
  expect(testMode([page, path])).toBe('full')
})

it('keeps main, manual, unknown and explicit full runs on full regression', () => {
  for (const eventName of ['push', 'workflow_dispatch', 'unknown']) expect(testMode([page], { eventName })).toBe('full')
  expect(testMode([page], { forceFull: true })).toBe('full')
  expect(testMode([])).toBe('full')
})

it('allows an accompanying component regression but escalates deleted or runtime tests', () => {
  const paths = [page, 'tests/page.test.ts']
  expect(testMode(paths, { readTest: () => '// @vitest-environment jsdom\nimport Page from "../apps/electron/src/renderer/pages/example"' })).toBe('frontend')
  expect(testMode(paths, { readTest: () => '' })).toBe('full')
  expect(testMode(paths, { readTest: () => '// @vitest-environment jsdom\nimport Service from "../packages/runtime/src/service"' })).toBe('full')
  expect(frontendTest('import { service } from "@boai/runtime"')).toBe(false)
})

it('reads the complete Git diff and includes a renamed backend file, rather than trusting a frontend destination', () => {
  const root = temporary()
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'CI fixture'); git(root, 'config', 'user.email', 'ci@example.invalid')
  write(root, 'packages/runtime/src/service.ts', 'export const value = 1\n')
  git(root, 'add', '--', 'packages/runtime/src/service.ts'); git(root, 'commit', '-qm', 'base')
  const base = git(root, 'rev-parse', 'HEAD')
  mkdirSync(dirname(join(root, page)), { recursive: true }); git(root, 'mv', 'packages/runtime/src/service.ts', page)
  git(root, 'commit', '-qm', 'move'); const sha = git(root, 'rev-parse', 'HEAD')
  const plan = preparePlan(root, 'pull_request', { pull_request: { base: { sha: base }, labels: [] } }, sha)
  expect(plan.paths).toEqual(expect.arrayContaining([page, 'packages/runtime/src/service.ts']))
  expect(plan.mode).toBe('full')
  expect(() => preparePlan(root, 'pull_request', { pull_request: { base: { sha: base } } }, 'f'.repeat(40))).toThrow('checkout')
})

it('combines static dependency selection with source-reading contracts and changed tests', () => {
  const selected = supplementalTests([page, 'tests/page.test.ts'], {
    'tests/source-contract.test.ts': `readFileSync('${page}')`,
    'tests/page.test.ts': '// @vitest-environment jsdom',
    'tests/service.test.ts': 'test backend service',
  })
  expect(selected.sort()).toEqual(['tests/page.test.ts', 'tests/source-contract.test.ts'])
  expect(supplementalTests(['packages/ui/src/components/button.tsx'], { 'tests/other-page.test.ts': '// @vitest-environment jsdom', 'tests/service.test.ts': 'test service' })).toEqual(['tests/other-page.test.ts'])
})

it('uses a nonempty UI fallback when the dependency graph has no matching tests', () => {
  const root = temporary(); write(root, 'tests/other.test.ts', '// @vitest-environment jsdom')
  const plan = { mode: 'frontend', base: 'a'.repeat(40), paths: [page] }
  const selected = selectFrontendTests(root, plan, (args: string[]) => {
    expect(args).toContain('--filesOnly'); expect(args).toContain('--changed')
    writeFileSync(join(root, '.local/test-ci/related.json'), '[]')
  })
  expect(selected).toEqual(['tests/other.test.ts'])
  write(root, 'tests/other.test.ts', 'test unrelated backend')
  expect(() => selectFrontendTests(root, plan, () => writeFileSync(join(root, '.local/test-ci/related.json'), '[]'))).toThrow('No frontend regression')
})

it('rejects malformed, missing or out-of-repository test selections', () => {
  const root = temporary(); write(root, 'tests/page.test.ts', 'test')
  expect(relatedFiles(root, [{ file: join(root, 'tests/page.test.ts') }])).toEqual(['tests/page.test.ts'])
  for (const input of [null, [{}], [{ file: '../outside.test.ts' }], [{ file: join(root, 'tests/missing.test.ts') }]]) expect(() => relatedFiles(root, input)).toThrow()
})

it('keeps engineering and fixed UI assertions on the frontend route and full tests on the full route', () => {
  const workflow = parse(readFileSync('.github/workflows/test.yml', 'utf8'))
  const steps = workflow.jobs.test.steps
  for (const command of ['pnpm typecheck', 'pnpm lint:ui', 'pnpm build', 'pnpm test:ui:behavior']) {
    expect(steps.find((step: { run?: string }) => step.run === command).if).toBe("steps.scope.outputs.mode != 'documentation'")
  }
  expect(steps.find((step: { run?: string }) => step.run === 'pnpm test').if).toBe("steps.scope.outputs.mode == 'full'")
  expect(workflow.jobs.required.needs).toEqual(['test'])
  const gate = workflow.jobs.required.steps[0].run
  for (const result of ['failure', 'cancelled', 'skipped', '']) expect(spawnSync('bash', ['-c', gate], { env: { ...process.env, RESULT: result } }).status).not.toBe(0)
  expect(spawnSync('bash', ['-c', gate], { env: { ...process.env, RESULT: 'success' } }).status).toBe(0)
})
