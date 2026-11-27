/*
 * [OUTPUT]: 共享模块只通过公开包入口解析。
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: 单元/合同测试、项目alias及原生进程监督构建。
 * [OUTPUT]: 测试前构建当前平台guard及独立运行时插件包，保持原超时与测试范围。
 * [OUTPUT]: test:changed 禁用 Vitest 的全量重跑触发文件，仅运行变更关联的测试。
 * [POS]: Vitest统一入口；不启动模型或Electron。
 * [PROTOCOL]: 变化同步Header和根目录.folder.md。
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { workspaceViteAliases } from './scripts/workspace-packages.mjs'
export default defineConfig({
  resolve: { alias: [...workspaceViteAliases(), { find: '@', replacement: resolve('apps/electron/src/renderer') }] },
  test: {
    globalSetup: ['./scripts/build-process-guard.mjs', './scripts/build-runtime-plugins.mjs'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    ...(process.env.BOAI_VITEST_CHANGED === '1' ? { forceRerunTriggers: [] } : {}),
  },
})
