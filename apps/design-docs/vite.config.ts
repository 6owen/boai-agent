/*
 * [INPUT]: React、Tailwind及公开内容/token插件。
 * [OUTPUT]: 独立开发服务器和可直接访问子路径的静态站点。
 * [POS]: apps/design-docs，默认localhost:5190，不启动BOAI桌面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
// @ts-expect-error Shared Node build helper intentionally has no declaration file.
import { designTokensPlugin } from '../../scripts/design-packages.mjs'
// @ts-expect-error Public content generator intentionally has no declaration file.
import { designContentPlugin } from '../../scripts/design-content.mjs'

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  plugins: [react(), tailwindcss(), designTokensPlugin(), designContentPlugin()],
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
})
