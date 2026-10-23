/*
 * [INPUT]: 单元/合同测试、项目alias及原生进程监督构建。
 * [OUTPUT]: 测试前构建当前平台guard及独立运行时插件包，保持原超时与测试范围。
 * [POS]: Vitest统一入口；不启动模型或Electron。
 * [PROTOCOL]: 变化同步Header和根目录.folder.md。
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
export default defineConfig({ resolve: { alias: { '@': resolve('src/renderer'), '@shared': resolve('src/shared') } }, test: { globalSetup: ['./scripts/build-process-guard.mjs', './scripts/build-runtime-plugins.mjs'], include: ['tests/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 30_000 } })
