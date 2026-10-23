/*
 * [INPUT]: 隔离 Desktop、真实商店服务和受控 provider fixture。
 * [OUTPUT]: 无外网请求的商店测试服务、跨搜索/提供方的延迟释放与下一页故障控制。
 * [POS]: Electron 商店场景的网络支撑，不修改生产运行环境。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer } from 'vite'
import { resolve } from 'node:path'
import type { Desktop } from './desktop'
import { SkillMarketplace } from '../../../src/runtime/modules/resources/skill-marketplace'

export async function startMarketplaceFixture(runtime: Desktop) {
  const requests: string[] = []
  let releaseSlow: (() => void) | undefined, failNextPage = true
  const marketplace = new SkillMarketplace(async input => {
    const url = new URL(String(input)), query = url.searchParams.get('q') ?? ''
    requests.push(url.href)
    if (query === 'slow' || query === 'provider-slow') await new Promise<void>(resolve => { releaseSlow = resolve })
    if (url.hostname === 'skills.sh' && url.pathname.endsWith('/1') && failNextPage) { failNextPage = false; return new Response('offline', { status: 503 }) }
    let data: unknown
    if (url.hostname === 'skills.sh') data = { skills: [{ id: `owner/repo/${query || 'alpha'}`, skillId: query || 'alpha', source: 'owner/repo', name: query || 'alpha' }, ...(url.pathname.endsWith('/1') ? [{ skillId: 'beta', source: 'owner/repo' }] : [])], hasMore: !query && url.pathname.endsWith('/0') }
    else if (url.hostname === 'clawhub.ai') data = { items: [{ slug: 'alpha', ownerHandle: 'alice', displayName: 'Claw alpha' }], nextCursor: null }
    else data = { data: { skills: [{ slug: 'hub', name: 'Hub result' }], total: 1 } }
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  })
  const server = await createServer({ configFile: resolve('vite.config.ts'), root: resolve('tests/fixtures/skills'), server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [resolve('.')] } }, plugins: [{ name: 'controlled-marketplace', configureServer(server) {
    server.middlewares.use('/fixture-marketplace', async (request, response) => {
      try {
        let text = ''; for await (const chunk of request) text += chunk
        const { method, input } = JSON.parse(text)
        const result = method === 'listSkillMarketplace' ? await marketplace.list(input) : method === 'getSkillMarketplaceDetail' ? await marketplace.detail(input) : marketplace.invalidate(input.provider)
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ result }))
      } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })) }
    })
  } }] })
  runtime.defer(async () => { releaseSlow?.(); await marketplace.close(); await server.close() })
  await server.listen()
  const address = server.httpServer!.address() as { port: number }
  await runtime.start({ rendererURL: `http://127.0.0.1:${address.port}` })
  return { requests, releaseSlow: () => releaseSlow?.() }
}
