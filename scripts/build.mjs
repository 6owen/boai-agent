/*
 * [INPUT]: 宿主/渲染进程源码与离线素材许可。
 * [OUTPUT]: dist 桌面构建及随包分发的 Base46、Geist 许可。
 * [POS]: 项目构建入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { copyFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { build as buildRenderer } from 'vite'

export async function buildHost() {
  await Promise.all([
    build({ entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', '@libsql/client'], sourcemap: true }),
    build({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] }),
    build({ entryPoints: ['src/runtime/worker.ts'], outfile: 'dist/runtime/worker.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: true }),
  ])
}
if (process.argv[1]?.endsWith('build.mjs')) {
  await buildHost()
  await buildRenderer()
  await copyFile('src/shared/appearance/BASE46-LICENSE.txt', 'dist/renderer/BASE46-LICENSE.txt')
  await copyFile('src/renderer/assets/Geist-OFL.txt', 'dist/renderer/Geist-OFL.txt')
}
