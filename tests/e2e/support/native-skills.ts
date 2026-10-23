/*
 * [INPUT]: 独立 Desktop、生产 main/worker 构建与本地 provider/ZIP 响应。
 * [OUTPUT]: 真实原生 IPC 的本地与受管商店安装/更新、取消/中途断流与重启支撑，以及脚本/远程图片的副作用探针；替换进程内网络边界并创建隔离用户目录。
 * [POS]: Skills 原生桌面验收支撑；不新增产品测试入口或关闭产品来源校验。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer, type ServerResponse } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import type { Desktop } from './desktop'

export async function startNativeSkills(runtime: Desktop) {
  await mkdir(join(runtime.root, 'local-user'), { recursive: true })
  let version = 1, offline = false, stall = false, partial = false
  let imageRequests = 0, imageURL = ''
  const executionMarker = join(runtime.root, 'unexpected-skill-execution')
  const requests: string[] = [], held = new Set<ServerResponse>()
  const packageBytes = () => zipSync({
    'SKILL.md': strToU8(`---\nname: native-helper\ndescription: 原生商店技能验收\n---\n# 原生上游版本 ${version}\n必须由用户明确绑定员工后才能读取。\n\n<script>document.title = 'UNEXPECTED_SKILL_SCRIPT'</script>\n\n![未加载的远程图片](${imageURL})`),
    'references/guide.md': strToU8(`版本 ${version} 的参考依据`),
    'scripts/do-not-run.mjs': strToU8(`import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(executionMarker)}, 'Skill installation executed package code');`),
    'package.json': strToU8('{"scripts":{"install":"node scripts/do-not-run.mjs"}}'),
    ...(version > 1 ? { 'references/new.md': strToU8(`新增依据 ${version}`) } : {}),
  })
  const server = createServer((req, res) => {
    if (req.url === '/image-probe') { imageRequests++; res.end('Unexpected image request'); return }
    const target = new URL(new URL(req.url!, 'http://fixture').searchParams.get('target')!)
    requests.push(target.href)
    if (req.headers.authorization || req.headers.cookie) { res.writeHead(400); res.end('Unexpected credentials'); return }
    if (offline) { res.writeHead(503); res.end('Fixture is offline'); return }
    if (target.pathname.endsWith('/download') || target.pathname.endsWith('.zip')) {
      res.setHeader('Content-Type', 'application/zip')
      if (partial) {
        const bytes = packageBytes()
        res.setHeader('Content-Length', bytes.length); res.writeHead(200); res.write(bytes.subarray(0, 32))
        held.add(res); res.once('close', () => held.delete(res)); return
      }
      if (stall) { res.writeHead(200); res.flushHeaders(); held.add(res); res.once('close', () => held.delete(res)); return }
      res.end(packageBytes()); return
    }
    res.setHeader('Content-Type', 'application/json')
    if (target.hostname === 'skills.sh') res.end(JSON.stringify({ skills: [{ id: 'fixture/repo/native-helper', skillId: 'native-helper', name: '原生商店助手', source: 'fixture/repo' }], hasMore: false }))
    else if (target.hostname === 'clawhub.ai' && target.pathname === '/api/v1/skills') res.end(JSON.stringify({ items: ['fixture', 'other-owner'].map(ownerHandle => ({ slug: 'native-helper', ownerHandle, displayName: '原生商店助手', summary: '预览后安装的真实包' })), nextCursor: null }))
    else if (target.hostname === 'clawhub.ai' && target.pathname.includes('/skills/')) res.end(JSON.stringify({ skill: { slug: 'native-helper', displayName: '原生商店助手', summary: '预览后安装的真实包', description: '# 商店说明\n下载后需检查实际内容。' }, owner: { handle: target.searchParams.get('ownerHandle') ?? 'fixture' }, latestVersion: { version: String(version) } }))
    else { res.writeHead(404); res.end('{}') }
  })
  runtime.trackServer(server)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/network`
  imageURL = new URL('/image-probe', endpoint).href
  const mainEntry = join(runtime.root, 'native-skills-main.cjs'), worker = join(runtime.root, 'native-skills-worker.mjs')
  await writeFile(worker, `import os from 'node:os';\nimport { syncBuiltinESMExports } from 'node:module';\nos.homedir = () => ${JSON.stringify(join(runtime.root, 'local-user'))};\nsyncBuiltinESMExports();\ndelete process.env.CODEX_HOME;\nimport { installNativeSkillNetwork } from ${JSON.stringify(pathToFileURL(resolve('tests/fixtures/skills/native-network.mjs')).href)};\ninstallNativeSkillNetwork(${JSON.stringify(endpoint)});\nawait import(${JSON.stringify(pathToFileURL(resolve('dist/runtime/worker.mjs')).href)});\n`)
  await writeFile(mainEntry, `const { utilityProcess } = require('electron');\nconst fork = utilityProcess.fork.bind(utilityProcess);\nutilityProcess.fork = (entry, args, options) => fork(entry.endsWith('/runtime/worker.mjs') ? ${JSON.stringify(worker)} : entry, args, options);\nrequire(${JSON.stringify(resolve('dist/main/main.cjs'))});\n`)
  await runtime.start({ mainEntry })
  return { requests, executionMarker, imageRequests: () => imageRequests, version: (value: number) => { version = value }, offline: (value: boolean) => { offline = value }, stall: (value: boolean) => { stall = value }, partial: () => { partial = true }, interruptDownload: () => { for (const response of held) response.destroy() }, pending: () => held.size }
}
