/*
 * [INPUT]: 隔离 Desktop、真实 AppService/SQLite 与仅替换下载传输的 ZIP fixture。
 * [OUTPUT]: 场景隔离用户目录，避免扫描真实本机技能；生产更新组件的服务端请求/事件桥、可变上游内容与本地修改准备。
 * [POS]: Electron 更新场景支撑；不进入生产包，不访问外网或运行技能脚本。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer } from 'vite'
import { join, resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { ServerResponse } from 'node:http'
import { strToU8, zipSync } from 'fflate'
import type { Desktop } from './desktop'
import { AppService } from '../../../packages/runtime/src/service'
import type { Method, Methods } from '../../../packages/shared/src/ipc'

export async function startSkillUpdatesFixture(runtime: Desktop) {
  let upstream = '原始上游说明'
  const events = new Set<ServerResponse>()
  const service = new AppService({ dataPath: join(runtime.root, 'skills-service'), skillDiscovery: { homeDir: join(runtime.root, 'skills-home') }, engine: { run: async () => { throw new Error('No skill or model should execute during updates') }, test: async () => 'ok' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: event => { for (const response of events) response.write(`data: ${JSON.stringify(event)}\n\n`) }, skillDownloads: async () => ({ status: 200, body: Readable.from([zipSync({ 'SKILL.md': strToU8(`---\nname: update-helper\ndescription: 可更新的离线技能\n---\n# ${upstream}`), 'references/guide.md': strToU8('上游参考资料'), ...(upstream !== '原始上游说明' ? { 'references/new.md': strToU8('本次新增的依据') } : {}) })]) }) })
  const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
  await service.init()
  const scan = await api('scanSkillSource', { kind: 'url', source: 'https://example.com/fixture.zip' })
  const operation = await api('installSkills', { requestId: 'seed', scanId: scan.id, candidateIds: scan.candidates.map(value => value.id), addToFavorites: true })
  for (let attempt = 0; ; attempt++) {
    const value = await api('getSkillOperation', { id: operation.id })
    if (value.status !== 'running') { if (value.items[0].status !== 'installed') throw new Error('Fixture skill failed to install'); break }
    if (attempt > 500) throw new Error('Fixture skill installation timed out')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  const snapshot = await api('snapshot', undefined), resource = snapshot.resources[0], employee = snapshot.agents.find(value => value.id === 'researcher')!
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = employee
  const bound = await api('saveAgent', { ...input, skillIds: [resource.id], expectedConfigVersion: configVersion })
  const server = await createServer({ configFile: resolve('vite.config.ts'), root: resolve('tests/fixtures/skills'), server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [resolve('.')] } }, plugins: [{ name: 'skill-updates-service', configureServer(server) {
    server.middlewares.use('/fixture-skill-events', (request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); response.write(': ready\n\n')
      events.add(response); request.on('close', () => events.delete(response))
    })
    server.middlewares.use('/fixture-skill-runtime', async (request, response) => {
      try {
        let text = ''; for await (const chunk of request) text += chunk
        const { method, input } = JSON.parse(text)
        const result = await service.handle(method, input)
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ result }))
      } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })) }
    })
  } }] })
  runtime.defer(async () => { for (const response of events) response.end(); await server.close(); await service.close() })
  await server.listen()
  const address = server.httpServer!.address() as { port: number }
  await runtime.start({ rendererURL: `http://127.0.0.1:${address.port}/updates.html` })
  return { api, resource, bound, changeUpstream: (value: string) => { upstream = value }, editLocally: (value: string) => writeFile(join(resource.path, 'SKILL.md'), `---\nname: update-helper\ndescription: 可更新的离线技能\n---\n# ${value}`) }
}
