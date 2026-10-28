/*
 * [INPUT]: Explicit execution panel performance diagnosis.
 * [OUTPUT]: Isolated serial Electron panel measurements, separate from visual CI.
 * [POS]: Opt-in performance configuration.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({ ...base, testMatch: 'execution-panel.spec.ts' })
