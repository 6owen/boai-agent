/*
 * [INPUT]: 中文业务场景、类型化步骤和 Electron fixture。
 * [OUTPUT]: BDD 生成目录、串行桌面执行与分别保存的 Playwright/Cucumber 报告。
 * [POS]: 桌面端到端测试唯一配置。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { defineConfig } from '@playwright/test'
import { cucumberReporter, defineBddConfig } from 'playwright-bdd'

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
  forbidOnly: Boolean(process.env.CI),
  expect: { timeout: 15_000 },
  // Electron contexts are created outside the browser fixture; Desktop records their traces.
  // Playwright clears its own report directory; Cucumber needs a separate destination.
  reporter: [['list'], ['html', { open: 'never' }], cucumberReporter('html', { outputFile: 'cucumber-report/index.html' })],
})
