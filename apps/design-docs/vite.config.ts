/*
 * [INPUT]: React、Tailwind、Fumadocs MDX及公开内容/token插件。
 * [OUTPUT]: 白名单Markdown经Fumadocs编译的独立开发与静态站点。
 * [POS]: apps/design-docs，默认localhost:5190，不启动BOAI桌面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fumadocsMdx } from 'fumadocs-mdx/vite'
import { fileURLToPath } from 'node:url'
// @ts-expect-error Shared Node build helper intentionally has no declaration file.
import { designTokensPlugin } from '../../scripts/design-packages.mjs'
// @ts-expect-error Public content generator intentionally has no declaration file.
import { designContentPlugin } from '../../scripts/design-content.mjs'

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  plugins: [fumadocsMdx({ index: false, macro: false, outDir: '.local/fumadocs' }), react(), tailwindcss(), designTokensPlugin(), designContentPlugin()],
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
})
