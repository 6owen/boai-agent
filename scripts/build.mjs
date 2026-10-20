/*
 * [OUTPUT]: 构建真实 PTY 与 macOS 本地桌面 OCR 辅助程序；构建不采集桌面。
 * [OUTPUT]: 分发 PPT 原版 worker 与相对依赖至 runtime/alma，桌面/独立服务共用。
 * [OUTPUT]: 分发可选本地Qwen语音安装器/固定清单；模型与venv不随包分发。
 * [OUTPUT]: 清单中的完整技能源随 dist 分发供桌面/独立服务首次绑定，排除开发目录地图。
 * [OUTPUT]: 分发员工脚本工具库，复用原CLI客户端；不包含owner发现或独立执行服务。
 * [OUTPUT]: 同时构建独立Node serve装配，原worker共用owner；CLI客户端仍单文件且不内联服务依赖。
 * [OUTPUT]: 构建无Electron依赖的BOAI CLI客户端，并分发固定Craft CLI/协议来源许可。
 * [OUTPUT]: 运行时插件独立构建/SDK与清单产物随应用分发；新增桌面场景纳入F11审阅。
 * [OUTPUT]: 随 runtime 分发 Hermes 文件工具策略的 MIT 许可和固定来源清单。
 * [OUTPUT]: 随渲染资源分发 Craft Scenic 的 Apache 许可、NOTICE 与固定迁入清单。
 * [OUTPUT]: 第16组直接迁入的Rovai钉钉MIT许可与固定来源清单随runtime构建分发。
 * [INPUT]: 宿主/渲染进程源码与离线素材许可。
 * [OUTPUT]: dist 桌面构建及随包分发的 Base46、Geist、Lobe Icons、本地配置扫描与迁入浏览器源码许可/NOTICE；专用工具栏 preload 和三 HTML 入口。
 * [POS]: 项目构建入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { buildRuntimePlugins } from './build-runtime-plugins.mjs'
import buildDesktopActivity from './build-desktop-activity.mjs'
import buildProcessGuard from './build-process-guard.mjs'
import { copyFile, cp, readFile, rm, mkdir } from 'node:fs/promises'
import { basename } from 'node:path'
import { build } from 'esbuild'
import { build as buildRenderer } from 'vite'

export async function buildHost() {
  await buildProcessGuard()
  await buildDesktopActivity()
  await Promise.all([
    buildRuntimePlugins(),
    build({ entryPoints: ['src/cli/employee-tools.ts'], outfile: 'dist/cli/employee-tools.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['bufferutil', 'utf-8-validate'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, sourcemap: true }),
    build({ entryPoints: ['src/cli/index.ts'], outfile: 'dist/cli/index.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['bufferutil', 'utf-8-validate'], banner: { js: "#!/usr/bin/env node\nimport { createRequire as cliCreateRequire } from 'node:module'; const require = cliCreateRequire(import.meta.url);" }, sourcemap: true }),
    build({ entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', '@libsql/client'], sourcemap: true }),
    build({ entryPoints: ['src/main/browser-toolbar-preload.ts'], outfile: 'dist/main/browser-toolbar-preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] }),
    build({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] }),
    build({ entryPoints: ['src/runtime/worker.ts'], outfile: 'dist/runtime/worker.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: true }),
    build({ entryPoints: ['src/runtime/serve.ts'], outfile: 'dist/runtime/serve.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: true }),
  ])
  await cp('src/runtime/modules/presentations/alma', 'dist/runtime/alma', { recursive: true, filter: path => basename(path) !== '.folder.md' })
  const skillManifest = JSON.parse(await readFile('resources/agent-skills/manifest.json', 'utf8'))
  await Promise.all(skillManifest.skills.map(name => readFile(`resources/agent-skills/${name}/SKILL.md`, 'utf8')))
  await rm('dist/agent-skills', { recursive: true, force: true })
  await mkdir('dist/agent-skills', { recursive: true })
  for (const name of skillManifest.skills) await cp(`resources/agent-skills/${name}`, `dist/agent-skills/${name}`, { recursive: true, filter: path => basename(path) !== '.folder.md' })
  await copyFile('resources/agent-skills/manifest.json', 'dist/agent-skills/manifest.json')
  await cp('resources/capabilities/voice', 'dist/capabilities/voice', { recursive: true, filter: path => !['.folder.md', '__pycache__'].includes(basename(path)) })
  for (const name of ['LICENSE.txt', 'NOTICE.txt', 'source-manifest.json']) await copyFile(`src/shared/cli/${name}`, `dist/cli/${name}`)
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
