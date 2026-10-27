/*
 * [INPUT]: Explicit local performance request and an isolated Electron build.
 * [OUTPUT]: Serial page measurements without baseline writes, retries or model calls.
 * [POS]: Opt-in performance diagnostics, separate from CI visual qualification.
 * [PROTOCOL]: Update performance/.folder.md when changed.
 */
import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
const output = resolve(process.env.BOAI_PERF_OUTPUT ?? '.local/frontend-performance/scan')
export default defineConfig({
  testDir: '.', testMatch: 'frontend-pages.spec.ts', workers: 1, retries: 0,
  timeout: 240_000, expect: { timeout: 15_000 },
  globalSetup: '../e2e/support/desktop-resource.ts',
  outputDir: resolve(output, 'playwright'),
  reporter: [['list'], ['json', { outputFile: resolve(output, 'playwright.json') }]],
})
