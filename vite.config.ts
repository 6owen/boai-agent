/*
 * [INPUT]: 当前 Renderer、原版浏览器 toolbar/empty-state 独立 HTML 与本地样式。
 * [OUTPUT]: 开发与随包三入口构建，浏览器 UI 路径不依赖旧 Craft 工程。
 * [POS]: vite.config.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  resolve: { alias: { '@': resolve('src/renderer'), '@shared': resolve('src/shared') } },
  plugins: [react(), tailwindcss(), {
    name: 'development-refresh-policy',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
    },
  }],
  build: { outDir: resolve('dist/renderer'), emptyOutDir: true, rolldownOptions: { input: { main: resolve('src/renderer/index.html'), browserToolbar: resolve('src/renderer/browser-toolbar.html'), browserEmptyState: resolve('src/renderer/browser-empty-state.html') } } },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
})
