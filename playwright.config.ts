/*
 * [INPUT]: 18 项 UI 场景、类型化步骤和隔离 Electron fixture。
 * [OUTPUT]: UI 专用 BDD/明确档案的只读视觉基线；只有独立手动工作流可写隔离候选，普通CI禁写。
 * [POS]: 桌面端到端测试唯一配置。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { defineConfig } from '@playwright/test'
import { cucumberReporter, defineBddConfig } from 'playwright-bdd'
import { resolve } from 'node:path'
// @ts-expect-error Shared plain Node policy has no declaration file.
import { uiProfile, assertCaptureMode } from './scripts/ui-profiles.mjs'

const uiRun = process.env.BOAI_UI_RUN_DIR
const candidate = Boolean(process.env.BOAI_UI_CANDIDATE_DIR)
assertCaptureMode('check')
const profile = uiRun ? uiProfile(process.cwd(), process.env.BOAI_UI_PROFILE) : null

const testDir = defineBddConfig({
  features: 'tests/e2e/features/ui-regression.feature',
  featuresRoot: 'tests/e2e/features',
  steps: ['tests/e2e/steps/ui-regression.steps.ts', 'tests/e2e/support/test.ts'],
  outputDir: '.features-gen',
  missingSteps: 'fail-on-gen',
  arityCheck: true,
})

export default defineConfig({
  testDir,
  globalSetup: './tests/e2e/support/desktop-resource.ts',
  timeout: 90_000,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  updateSnapshots: candidate ? 'all' : 'none',
  snapshotPathTemplate: resolve(process.env.BOAI_UI_CANDIDATE_DIR ?? profile?.directory ?? 'tests/e2e/baselines', '{arg}{ext}'),
  ...(uiRun ? { outputDir: resolve(uiRun, 'results') } : {}),
  expect: { timeout: 15_000 },
  // Electron contexts are created outside the browser fixture; Desktop records their traces.
  // Playwright clears its own report directory; Cucumber needs a separate destination.
  reporter: [[process.env.CI ? 'line' : 'list'], ['html', { open: 'never', ...(uiRun ? { outputFolder: resolve(uiRun, 'html') } : {}) }], cucumberReporter('html', { outputFile: uiRun ? resolve(uiRun, 'cucumber/index.html') : 'cucumber-report/index.html' }), ...(uiRun ? [['json', { outputFile: resolve(uiRun, 'playwright.json') }] as const] : [])],
})
