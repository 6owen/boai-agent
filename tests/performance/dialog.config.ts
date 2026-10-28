/*
 * [INPUT]: Explicit first-open Dialog performance investigation.
 * [OUTPUT]: Isolated serial measurements, no ordinary CI or baseline writes.
 * [POS]: Opt-in performance configuration.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({ ...base, testMatch: 'dialog.spec.ts' })
