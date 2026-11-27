/*
 * [OUTPUT]: 隔离预览为已有单聊消息配套静态执行历史，零模型调用，支持折叠状态截图。
 * [OUTPUT]: 设置导航经过二级菜单；隔离预览员工使用首批支持的小牛角色，真实默认值及共享行为夹具保持。
 * [INPUT]: Built BOAI application and existing isolated conversation/schedule fixtures.
 * [OUTPUT]: A real Electron page, demo data and native recording lifecycle.
 * [POS]: BOAI-specific adapter for Magpie's UI preview recorder.
 * [PROTOCOL]: Update this header and .folder.md when changed.
 */
import { _electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { prepareGroupChat } from '../../tests/e2e/support/group-chat'
import { seedScheduleUi } from '../../tests/e2e/support/schedule-ui'
import type { AgentRun, DigitalAgent, Message } from '../../packages/shared/src/domain'
import type { Desktop } from '../../tests/e2e/support/desktop'

export async function createApp() {
  const root = await mkdtemp(join(tmpdir(), 'boai-ui-preview-'))
  const servers: import('node:http').Server[] = []
  let app: Awaited<ReturnType<typeof _electron.launch>> | undefined
  let page: import('@playwright/test').Page
  const runtime = {
    root,
    get page() { return page },
    trackServer(server: import('node:http').Server) { servers.push(server) },
    async start(options: { recordVideo?: { dir: string; size: { width: number; height: number } } } = {}) {
      const env = { ...process.env, BOAI_DATA_DIR: root, NODE_ENV: 'test' }
      delete env.ELECTRON_RUN_AS_NODE
      delete env.BOAI_RENDERER_URL
      delete env.DEEPSEEK_API_KEY
      delete env.SECRETS
      console.log("[ui-preview] launching Electron")
      app = await _electron.launch({ args: [resolve('.')], env, recordVideo: options.recordVideo })
      page = await app.firstWindow()
      page.setDefaultTimeout(8000)
      await page.waitForFunction(() => Boolean(window.boai))
      await page.evaluate(() => window.boai.request('snapshot', undefined))
      await page.setViewportSize({ width: 1280, height: 800 })
      return app
    },
    async close() {
      if (!app) return
      await page.evaluate(() => window.boai.request('setUnsavedChanges', { dirty: false })).catch(() => {})
      const running = app; app = undefined
      await running.close()
    },
    async navigate(where: string) {
      if (!['chat', 'contacts', 'schedules', 'resources', 'settings'].includes(where)) throw new Error(`Unknown BOAI page: ${where}`)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      if (where === 'settings') {
        await page.getByRole('button', { name: '我的菜单', exact: true }).click()
        await page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
        await page.getByRole('menuitem', { name: '模型连接', exact: true }).click()
      } else {
        const name = { chat: '会话', contacts: '通讯录', schedules: '定时任务', resources: '资源库' }[where]!
        await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name, exact: true }).click()
      }
    },
    async dispose() {
      try { await runtime.close() } finally {
        for (const server of servers) {
          server.closeAllConnections()
          if (server.listening) await new Promise<void>(done => server.close(() => done()))
        }
        await rm(root, { recursive: true, force: true })
      }
    },
  }
  try {
    console.log("[ui-preview] seeding demo conversations")
    await prepareGroupChat(runtime as unknown as Desktop, {
      seedBeforeLaunch: true, emulateViewport: false,
      seedAdditional: async (store, setup) => {
        await seedScheduleUi(store, setup.direct.id)
        const messages = (await store.load<Message>('messages')).filter(message => message.conversationId === setup.direct.id).sort((a, b) => a.sequence - b.sequence)
        const history: AgentRun[] = messages.filter(message => message.senderType === 'agent').slice(-3).map(message => ({
          id: `ui-preview-${message.id}`, conversationId: setup.direct.id, agentId: message.senderId, agentName: message.senderName,
          triggerMessageId: messages.filter(item => item.senderType === 'user' && item.sequence < message.sequence).at(-1)!.id,
          messageId: message.id, status: 'completed', phase: 'execution', createdAt: message.createdAt, finishedAt: message.createdAt, toolEvents: [],
        }))
        await store.write(history.map(value => ({ collection: 'runs', id: value.id, value })))
        // This preview deliberately demonstrates the supported ox preset. Shared
        // behavior fixtures and real employee defaults remain unchanged.
        const researcher = (await store.load<DigitalAgent>('agents')).find(agent => agent.id === 'researcher')
        if (!researcher) throw new Error('预览员工夹具缺失')
        await store.write([{ collection: 'agents', id: researcher.id, value: { ...researcher, avatar: { kind: 'preset', id: 'fox' } } }])
      },
    })
    console.log("[ui-preview] demo data ready")
    return runtime
  } catch (error) { await runtime.dispose(); throw error }
}
