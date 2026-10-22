/*
 * [INPUT]: BOAI设计系统包和独立站点Vite配置。
 * [OUTPUT]: 先生成基础变量再启动文档站，组件源码随Vite热更新。
 * [POS]: 根pnpm dev:design入口，不启动桌面或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { buildDesign } from './design-packages.mjs'

await buildDesign()
const server = await createServer({ configFile: fileURLToPath(new URL('../apps/design-docs/vite.config.ts', import.meta.url)) })
await server.listen()
server.printUrls()
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0) })
