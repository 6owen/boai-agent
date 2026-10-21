/*
 * [INPUT]: 公共包构建核心与可选--site参数。
 * [OUTPUT]: 先生成共享包，再按明确参数构建设计站。
 * [POS]: BOAI设计系统CLI；核心模块无导入副作用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { fileURLToPath } from 'node:url'
import { buildDesign } from './design-packages.mjs'

await buildDesign()
if (process.argv.includes('--site')) {
  const { build } = await import('vite')
  await build({ configFile: fileURLToPath(new URL('../apps/design-docs/vite.config.ts', import.meta.url)) })
}
