/*
 * [INPUT]: Real UI detector, preview entry and Actions definitions.
 * [OUTPUT]: UI changes trigger preview; missing credentials fail; recorder cannot write the repo.
 * [POS]: Magpie preview integration regressions, no model calls.
 * [PROTOCOL]: Update tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { parse } from 'yaml'
// @ts-expect-error Upstream-derived plain Node module.
import { isUiFile } from '../.github/ui-preview/publish.mjs'

it('detects BOAI pages and shared styling without recording backend-only changes', () => {
  for (const file of ['apps/electron/src/renderer/app.tsx', 'packages/ui/src/dialog.tsx', 'packages/tokens/src/colors.css', 'vite.config.ts']) expect(isUiFile(file)).toBe(true)
  for (const file of ['packages/runtime/src/app-service.ts', 'README.md', 'tests/ui-preview.test.ts']) expect(isUiFile(file)).toBe(false)
})
it('missing model credentials stop before launching the app or claiming a preview', () => {
  const env = { ...process.env }; delete env.DEEPSEEK_API_KEY; delete env.PLAN_FILE
  const child = spawnSync(process.execPath, ['.github/ui-preview/run.mjs'], { env, encoding: 'utf8' })
  expect(child.status).not.toBe(0)
  expect(child.stderr).toContain('Set DEEPSEEK_API_KEY')
})
it('keeps untrusted PR execution apart from the trusted writer and engineering gate', async () => {
  const workflow = parse(await readFile('.github/workflows/ui-preview.yml', 'utf8'))
  expect(workflow.permissions).toEqual({})
  expect(workflow.jobs.record.permissions).toEqual({ contents: 'read' })
  expect(workflow.jobs.publish.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' })
  expect(workflow.jobs.record.environment).toBe('ui-preview')
  const writer = workflow.jobs.publish.steps.map((step: { run?: string }) => step.run || '').join('\n')
  expect(writer).not.toContain('pnpm')
  expect(writer).toContain('publish.mjs publish')
  const test = parse(await readFile('.github/workflows/test.yml', 'utf8'))
  expect(test.jobs.required.needs).toEqual(['test'])
  expect(test.jobs.test.steps.some((step: { run?: string }) => step.run === 'pnpm test')).toBe(true)
  expect(JSON.stringify(test.jobs.required)).not.toMatch(/baseline|candidate|ui-regression/)
})
