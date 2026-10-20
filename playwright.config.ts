/*
 * [INPUT]: 中文业务场景、类型化步骤和 Electron fixture。
 * [OUTPUT]: BDD串行桌面、只读视觉基线及隔离候选/JSON/HTML报告；CI禁止更新期望图。
 * [POS]: 桌面端到端测试唯一配置。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { defineConfig } from '@playwright/test'
import { cucumberReporter, defineBddConfig } from 'playwright-bdd'
import { resolve } from 'node:path'

const uiRun = process.env.BOAI_UI_RUN_DIR
const candidate = Boolean(process.env.BOAI_UI_CANDIDATE_DIR)
if (candidate && process.env.CI) throw new Error('CI禁止生成或更新UI基线')

const testDir = defineBddConfig({
  features: 'tests/e2e/features/**/*.feature',
  featuresRoot: 'tests/e2e/features',
  steps: ['tests/e2e/steps/**/*.ts', 'tests/e2e/support/test.ts'],
  outputDir: '.features-gen',
  missingSteps: 'fail-on-gen',
  arityCheck: true,
})

export default defineConfig({
  testDir,
  timeout: 90_000,
  workers: 1,
  // UI snapshots have their own environment-checked runner; the existing BDD suite remains offline behavior coverage.
  ...(!uiRun ? { grepInvert: /@ui-regression/ } : {}),
  forbidOnly: Boolean(process.env.CI),
  updateSnapshots: candidate ? 'all' : 'none',
  snapshotPathTemplate: resolve(process.env.BOAI_UI_CANDIDATE_DIR ?? 'tests/e2e/baselines', '{arg}{ext}'),
  ...(uiRun ? { outputDir: resolve(uiRun, 'results') } : {}),
  expect: { timeout: 15_000 },
  // Electron contexts are created outside the browser fixture; Desktop records their traces.
  // Playwright clears its own report directory; Cucumber needs a separate destination.
  reporter: [['list'], ['html', { open: 'never', ...(uiRun ? { outputFolder: resolve(uiRun, 'html') } : {}) }], cucumberReporter('html', { outputFile: uiRun ? resolve(uiRun, 'cucumber/index.html') : 'cucumber-report/index.html' }), ...(uiRun ? [['json', { outputFile: resolve(uiRun, 'playwright.json') }] as const] : [])],
})
