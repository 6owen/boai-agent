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
  build: { outDir: resolve('dist/renderer'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
})
