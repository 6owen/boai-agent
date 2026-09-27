import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
export default defineConfig({ resolve: { alias: { '@': resolve('src/renderer'), '@shared': resolve('src/shared') } }, test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 30_000 } })
