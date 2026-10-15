/*
 * [OUTPUT]: 随 runtime 分发 Hermes 文件工具策略的 MIT 许可和固定来源清单。
 * [OUTPUT]: 随渲染资源分发 Craft Scenic 的 Apache 许可、NOTICE 与固定迁入清单。
 * [OUTPUT]: 第16组直接迁入的Rovai钉钉MIT许可与固定来源清单随runtime构建分发。
 * [INPUT]: 宿主/渲染进程源码与离线素材许可。
 * [OUTPUT]: dist 桌面构建及随包分发的 Base46、Geist、Lobe Icons、本地配置扫描与迁入浏览器源码许可/NOTICE；专用工具栏 preload 和三 HTML 入口。
 * [POS]: 项目构建入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import buildProcessGuard from './build-process-guard.mjs'
import { copyFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { build as buildRenderer } from 'vite'

export async function buildHost() {
  await buildProcessGuard()
  await Promise.all([
    build({ entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', '@libsql/client'], sourcemap: true }),
    build({ entryPoints: ['src/main/browser-toolbar-preload.ts'], outfile: 'dist/main/browser-toolbar-preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] }),
    build({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] }),
    build({ entryPoints: ['src/runtime/worker.ts'], outfile: 'dist/runtime/worker.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: true }),
  ])
  await copyFile('src/runtime/adapters/channels/rovai/LICENSE.txt', 'dist/runtime/rovai-channels-LICENSE.txt')
  await copyFile('src/runtime/adapters/channels/rovai/source-manifest.json', 'dist/runtime/rovai-channels-source-manifest.json')
  await copyFile('src/runtime/modules/workspaces/hermes/LICENSE.txt', 'dist/runtime/hermes-file-tools-LICENSE.txt')
  await copyFile('src/runtime/modules/workspaces/hermes/source-manifest.json', 'dist/runtime/hermes-file-tools-source-manifest.json')
}
if (process.argv[1]?.endsWith('build.mjs')) {
  await buildHost()
  await buildRenderer()
  for (const name of ['LICENSE.txt', 'NOTICE.txt', 'source-manifest.json']) await copyFile(`src/renderer/styles/craft-scenic/${name}`, `dist/renderer/craft-scenic-${name}`)
  await copyFile('src/shared/appearance/BASE46-LICENSE.txt', 'dist/renderer/BASE46-LICENSE.txt')
  await copyFile('src/renderer/assets/Geist-OFL.txt', 'dist/renderer/Geist-OFL.txt')
  await copyFile('src/renderer/assets/LobeIcons-LICENSE.txt', 'dist/renderer/LobeIcons-LICENSE.txt')
  await copyFile('src/main/local-configs/LICENSE.txt', 'dist/main/local-configs-LICENSE.txt')
  await copyFile('src/main/local-configs/NOTICE.txt', 'dist/main/local-configs-NOTICE.txt')
  await copyFile('src/main/browser/LICENSE.txt', 'dist/main/browser-LICENSE.txt')
  await copyFile('src/main/browser/NOTICE.txt', 'dist/main/browser-NOTICE.txt')
  await copyFile('src/main/browser/source-manifest.json', 'dist/main/browser-source-manifest.json')
}
