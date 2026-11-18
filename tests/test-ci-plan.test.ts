/*
 * [INPUT]: PR/manual events, a real temporary Git repository and actual workflow steps.
 * [OUTPUT]: Daily PRs cannot silently run build/UI/Vitest; explicit full runs and failing checks remain enforced.
 * [POS]: Lean CI routing regressions, no Electron or model calls.
 * [PROTOCOL]: Update tests/.folder.md and scripts/test-ci-plan.mjs together.
 */
import { afterEach, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'
// @ts-expect-error Plain Node CI entrypoint.
import { preparePlan, testMode } from '../scripts/test-ci-plan.mjs'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

it('keeps docs light, including skills and diagrams', () => {
  expect(testMode(['README.md', '.agents/skills/boai-dev-workflow/SKILL.md'])).toBe('documentation')
  expect(testMode(['UI_TEST_CI.md', 'ai-docs/design/flow.svg', 'ai-docs/design/flow.tldraw'])).toBe('documentation')
})
it.each(['apps/electron/src/renderer/pages/example.tsx', 'packages/ui/src/button.tsx', 'packages/runtime/src/service.ts', 'packages/shared/src/ipc.ts', 'pnpm-lock.yaml', '.github/workflows/test.yml', 'tests/service.test.ts', 'scripts/test-ci-plan.mjs'])('ordinary %s changes use engineering checks rather than all tests', path => {
  expect(testMode([path, 'README.md'])).toBe('checks')
})
it('only explicit requests run full tests; unknown events fail and an empty PR still gets engineering checks', () => {
  expect(testMode(['README.md'], { eventName: 'workflow_dispatch' })).toBe('full')
  expect(testMode(['README.md'], { forceFull: true })).toBe('full')
  for (const eventName of ['push', 'unknown']) expect(() => testMode([], { eventName })).toThrow()
  expect(testMode([])).toBe('checks')
})
it('reads the complete exact checkout diff and includes both sides of a rename', () => {
  const root = mkdtempSync(join(tmpdir(), 'boai-ci-plan-')); roots.push(root)
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'CI fixture'); git(root, 'config', 'user.email', 'ci@example.invalid')
  writeFileSync(join(root, 'README.md'), 'base\n'); git(root, 'add', '--', 'README.md'); git(root, 'commit', '-qm', 'base')
  const base = git(root, 'rev-parse', 'HEAD'), path = 'apps/electron/src/renderer/page.tsx'
  mkdirSync(dirname(join(root, path)), { recursive: true }); git(root, 'mv', 'README.md', path); git(root, 'commit', '-qm', 'move')
  const sha = git(root, 'rev-parse', 'HEAD'), event = { pull_request: { base: { sha: base }, labels: [] as { name: string }[] } }
  expect(preparePlan(root, 'pull_request', event, sha)).toMatchObject({ mode: 'checks', paths: expect.arrayContaining(['README.md', path]) })
  expect(preparePlan(root, 'pull_request', { pull_request: { ...event.pull_request, labels: [{ name: 'ci:full' }] } }, sha).mode).toBe('full')
  expect(() => preparePlan(root, 'pull_request', event, 'f'.repeat(40))).toThrow('checkout')
})
it('ordinary PR execution excludes all expensive commands, while full dispatch keeps their order and failed checks block', () => {
  const workflow = parse(readFileSync('.github/workflows/test.yml', 'utf8'))
  expect(workflow.on).not.toHaveProperty('push')
  expect(workflow.on).toHaveProperty('pull_request')
  expect(workflow.on).toHaveProperty('workflow_dispatch')
  const steps = workflow.jobs.test.steps
  const commands = (mode: string) => steps.filter((s: { run?: string; if?: string }) => s.run && (!s.if || s.if === "steps.scope.outputs.mode != 'documentation'" && mode !== 'documentation' || s.if === "steps.scope.outputs.mode == 'full'" && mode === 'full')).map((s: { run: string }) => s.run)
  expect(commands('documentation')).toEqual(['node scripts/test-ci-plan.mjs prepare'])
  expect(commands('checks')).toEqual(['node scripts/test-ci-plan.mjs prepare', 'pnpm install --frozen-lockfile --prefer-offline', 'pnpm typecheck', 'pnpm lint:ui'])
  expect(commands('full')).toEqual([...commands('checks'), 'pnpm build', 'pnpm test:ui:behavior', 'pnpm --filter @6owen/avatar-motion test', 'pnpm test'])
  expect(workflow.jobs.required.needs).toEqual(['test'])
  const gate = workflow.jobs.required.steps[0].run
  for (const result of ['failure', 'cancelled', 'skipped', '']) expect(spawnSync('bash', ['-c', gate], { env: { ...process.env, RESULT: result } }).status).not.toBe(0)
  expect(spawnSync('bash', ['-c', gate], { env: { ...process.env, RESULT: 'success' } }).status).toBe(0)
})
