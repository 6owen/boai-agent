/*
 * [INPUT]: Upstream Mastra browser packages, a run identity and a host command callback.
 * [OUTPUT]: Original upstream tool schemas/results and independently owned browser lifecycle.
 * [POS]: Thin community-browser adapter; never connects to BOAI's Electron browser or cookies.
 * [PROTOCOL]: Update Header and src/.folder.md on change.
 */
import { access, mkdtemp, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { BrowserCliHandler, type MastraBrowser } from '@mastra/core/browser'
import type { Tool } from '@mastra/core/tools'
import { z } from 'zod'

export type Provider = 'agent-browser' | 'browser-viewer'
export type BrowserConfig = { headless: boolean; executablePath: string }
export type BrowserContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
const cliInput = z.object({ args: z.array(z.string().max(20000)).min(1).max(128).refine(args => !args.some(value => /^(--cdp|--session|--auto-connect)(=|$)/.test(value)), 'CDP 和 session 由 BrowserViewer 管理') }).strict()
const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`
const require = createRequire(import.meta.url)
export function browserPluginRuntimeRoot() {
  const file = require.resolve('agent-browser/package.json').replace('app.asar/', 'app.asar.unpacked/')
  return file.slice(0, file.indexOf('/node_modules/') + '/node_modules'.length)
}

/** Reuse a browser executable only; Chromium still creates its own upstream profile. */
async function executablePath(configured: string): Promise<string | undefined> {
  if (configured) { await access(configured, constants.X_OK); return configured }
  const candidates = process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    : process.platform === 'linux' ? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'] : []
  for (const file of candidates) { try { await access(file, constants.X_OK); return file } catch { /* Try the next executable, then upstream's Chromium. */ } }
  return undefined
}

export interface BrowserPluginSession {
  inspect(): { name: string; description: string; inputSchema: unknown }[]
  call(name: string, input: Record<string, unknown>, callId: string): Promise<{ content: BrowserContent[] }>
  close(): Promise<void>
}

function content(output: unknown, tool?: Tool<any, any>): BrowserContent[] {
  const result: any = tool?.toModelOutput?.(output as never)
  if (result?.type === 'content' && Array.isArray(result.value)) return result.value.flatMap((part: any): BrowserContent[] => {
    if (part.type === 'text') return [{ type: 'text', text: part.text }]
    if (['media', 'image-data'].includes(part.type) && typeof part.data === 'string' && part.mediaType?.startsWith('image/')) return [{ type: 'image', data: part.data, mimeType: part.mediaType }]
    return [{ type: 'text', text: JSON.stringify(part) }]
  })
  if (result?.type === 'text') return [{ type: 'text', text: result.value }]
  return [{ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) ?? 'null' }]
}

export async function createBrowserPluginSession(provider: Provider, config: BrowserConfig, threadId: string,
  execute: (command: string, cleanup?: boolean, runtimeWrites?: string[]) => Promise<unknown>): Promise<BrowserPluginSession> {
  const options = { headless: config.headless, executablePath: await executablePath(config.executablePath), scope: 'shared' as const }
  const browser: MastraBrowser = provider === 'agent-browser'
    ? new (await import('@mastra/agent-browser')).AgentBrowser(options)
    : new (await import('@mastra/browser-viewer')).BrowserViewer({ ...options, cli: 'agent-browser' })
  const tools = browser.getTools()
  const cli = new BrowserCliHandler()
  let closed = false, cliStarted = false, closeTask: Promise<void> | undefined
  let socketDirectory: string | undefined
  const cliThread = `boai-${createHash('sha256').update(threadId).digest('hex').slice(0,16)}`
  const cliCommand = (command: string) => {
    const bin = join(dirname(require.resolve('agent-browser/package.json')), 'bin', 'agent-browser.js').replace('app.asar/', 'app.asar.unpacked/')
    return `AGENT_BROWSER_SOCKET_DIR=${quote(socketDirectory!)} ` + command.replace(/^agent-browser(?=\s|$)/, `ELECTRON_RUN_AS_NODE=1 ${quote(process.execPath)} ${quote(bin)}`)
  }
  return {
    inspect: () => provider === 'browser-viewer' ? [{ name: 'execute', description: 'Run the original agent-browser CLI against this BrowserViewer browser. Pass CLI arguments as an array, for example ["open", "https://example.com"], ["snapshot", "-i"], ["click", "@e1"]. Use ["--help"] for upstream commands. This browser is independent of BOAI and AgentBrowser.', inputSchema: z.toJSONSchema(cliInput) }]
      : Object.entries(tools).map(([name, tool]) => ({ name, description: tool.description ?? name, inputSchema: z.toJSONSchema(tool.inputSchema as z.ZodType, { io: 'input' }) })),
    async call(name, input, callId) {
      if (closed) throw new Error('浏览器插件会话已关闭')
      if (provider === 'browser-viewer') {
        if (name !== 'execute') throw new Error('BrowserViewer 工具不存在，请先读取工具目录')
        const { args } = cliInput.parse(input)
        browser.setCurrentThread(threadId)
        await browser.ensureReady()
        if (closed) throw new Error('浏览器插件会话已关闭')
        const cdp = browser.getCdpUrl(threadId)
        if (!cdp) throw new Error('BrowserViewer 未提供浏览器连接')
        socketDirectory ??= await mkdtemp(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'boai-bv-'))
        const command = cli.injectCdpUrl(`agent-browser ${args.map(quote).join(' ')}`, cdp, cliThread)
        // Upstream owns command syntax/CDP injection; the host owns process execution and approval.
        cliStarted = true
        return { content: content(await execute(cliCommand(command), false, [socketDirectory])) }
      }
      const tool = tools[name]
      if (!tool?.execute) throw new Error('浏览器插件工具不存在，请先读取工具目录')
      const output = await tool.execute(input, { agent: { threadId, toolCallId: callId } } as never)
      return { content: content(output, tool) }
    },
    close() {
      closed = true
      return closeTask ??= (async () => {
        // Close the browser first so a waiting CLI operation releases host command admission.
        try { await browser.close() }
        finally {
          if (cliStarted) {
            const result = await execute(cliCommand(`agent-browser --session ${quote(cliThread)} close`), true, [socketDirectory!]) as { exitCode?: number | null }
            if (result?.exitCode !== undefined && result.exitCode !== 0) throw new Error('BrowserViewer CLI 清理失败，临时会话目录已保留')
          }
          if (socketDirectory) await rm(socketDirectory, { recursive: true, force: true })
        }
      })()
    },
  }
}
