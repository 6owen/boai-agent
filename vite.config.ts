/*
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
import { readFileSync } from 'node:fs'
// @ts-expect-error Shared Node build helper has no declaration file.
import { designTokensPlugin } from './scripts/design-packages.mjs'

// Worktrees may share node_modules, but workspace source and styles must stay local.
const workspaceAliases = ['ui', 'tokens'].flatMap(name => {
  const directory = resolve('packages', name)
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')) as {
    exports: Record<string, string | { development?: string; default: string }>
  }
  return Object.entries(manifest.exports).map(([entry, target]) => ({
    find: `@boai/${name}${entry.slice(1)}`,
    replacement: resolve(directory, typeof target === 'string' ? target : target.development ?? target.default),
  }))
}).sort((a, b) => b.find.length - a.find.length)

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  resolve: { alias: [...workspaceAliases, { find: '@', replacement: resolve('src/renderer') }, { find: '@shared', replacement: resolve('src/shared') }] },
  plugins: [react(), tailwindcss(), designTokensPlugin(), {
    name: 'development-refresh-policy',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
    },
  }],
  build: { outDir: resolve('dist/renderer'), emptyOutDir: true, rolldownOptions: { input: { main: resolve('src/renderer/index.html'), browserToolbar: resolve('src/renderer/browser-toolbar.html'), browserEmptyState: resolve('src/renderer/browser-empty-state.html') } } },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
})
