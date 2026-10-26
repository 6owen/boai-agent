/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [OUTPUT]: 共享UI/token按当前worktree的公开导出解析，避免共享node_modules链接读到另一目录；token编辑重新生成默认CSS。
 * [INPUT]: 当前 Renderer、原版浏览器 toolbar/empty-state 独立 HTML 与本地样式。
 * [OUTPUT]: 开发与随包三入口构建，浏览器 UI 路径不依赖旧 Craft 工程。
 * [POS]: vite.config.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { workspaceViteAliases } from './scripts/workspace-packages.mjs'
// @ts-expect-error Shared Node build helper has no declaration file.
import { designTokensPlugin } from './scripts/design-packages.mjs'

// Public workspace exports always resolve inside this worktree.
const workspaceAliases = workspaceViteAliases()

export default defineConfig({
  root: resolve('apps/electron/src/renderer'),
  base: './',
  resolve: { alias: [...workspaceAliases, { find: '@', replacement: resolve('apps/electron/src/renderer') }, { find: '@shared', replacement: resolve('packages/shared/src') }] },
  plugins: [react(), tailwindcss(), designTokensPlugin(), {
    name: 'development-refresh-policy',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
    },
  }],
  build: { outDir: resolve('dist/renderer'), emptyOutDir: true, rolldownOptions: { input: { main: resolve('apps/electron/src/renderer/index.html'), browserToolbar: resolve('apps/electron/src/renderer/browser-toolbar.html'), browserEmptyState: resolve('apps/electron/src/renderer/browser-empty-state.html') } } },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
})
