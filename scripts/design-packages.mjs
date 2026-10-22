/*
 * [INPUT]: 共享包源码、锁定编译器和可选设计文档站。
 * [OUTPUT]: 全量组件子路径、共享CSS/本地图标、声明与同源Token数据；无CLI副作用。
 * [POS]: 设计系统共享构建核心，Vite配置导入时不自动执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))

export async function buildDesign({ declarations = true, tokensOnly = false } = {}) {
  const tokens = resolve(root, 'packages/tokens')
  await build({ entryPoints: [resolve(tokens, 'src/index.ts'), resolve(tokens, 'src/typography.ts')], outdir: resolve(tokens, 'dist'), bundle: true, splitting: true, format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'warning' })
  const module = await import(`${pathToFileURL(resolve(tokens, 'dist/index.js')).href}?build=${Date.now()}`)
  await writeFile(resolve(tokens, 'dist/foundation.css'), module.foundationCss())
  await writeFile(resolve(tokens, 'dist/tokens.json'), JSON.stringify(module.tokenDocument(JSON.parse(await readFile(resolve(tokens, 'package.json'), 'utf8')).version), null, 2) + '\n')
  if (!tokensOnly) {
    const ui = resolve(root, 'packages/ui')
    const names = (await readdir(resolve(ui, 'src/components'))).filter(name => name.endsWith('.tsx')).map(name => name.slice(0, -4))
    const entries = { index: resolve(ui, 'src/index.ts'), icons: resolve(ui, 'src/icons.tsx'), 'use-mobile': resolve(ui, 'src/use-mobile.ts'), 'shiki-highlighter': resolve(ui, 'src/components/shiki-highlighter.ts'), ...Object.fromEntries(names.map(name => [name, resolve(ui, `src/components/${name}.tsx`)])) }
    await build({ entryPoints: entries, outdir: resolve(ui, 'dist'), bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', packages: 'external', jsx: 'automatic', logLevel: 'warning' })
    await mkdir(resolve(ui, 'dist/styles'), { recursive: true })
    for (const name of (await readdir(resolve(ui, 'src'))).filter(name => name.endsWith('.css'))) await copyFile(resolve(ui, 'src', name), resolve(ui, 'dist/styles', name))
    // Published CSS must scan the shipped source, relative to dist/styles rather than src.
    const styles = await readFile(resolve(ui, 'dist/styles/styles.css'), 'utf8')
    await writeFile(resolve(ui, 'dist/styles/styles.css'), styles.replace("@source './components';", "@source '../../src/components';"))
  }
  if (declarations) {
    await run('pnpm', ['exec', 'tsc', '-p', 'packages/tokens/tsconfig.json'], { cwd: root })
    if (!tokensOnly) await run('pnpm', ['exec', 'tsc', '-p', 'packages/ui/tsconfig.json'], { cwd: root })
  }
}

export function designTokensPlugin() {
  return {
    name: 'boai-design-token-generation',
    async handleHotUpdate(context) {
      const directory = resolve(root, 'packages/tokens/src')
      if (context.file.startsWith(directory + '/') && context.file.endsWith('.ts')) await buildDesign({ declarations: false, tokensOnly: true })
    },
  }
}
