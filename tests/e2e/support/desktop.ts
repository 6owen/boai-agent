/*
 * [INPUT]: Playwright Electron、场景独立数据目录、可选打包入口与组件测试服务。
 * [OUTPUT]: 可重启的桌面生命周期、资源回收和逐次启动的失败证据。
 * [POS]: Electron BDD 场景共享宿主；启动由 Given 控制，允许先准备旧数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { _electron as electron, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Server } from 'node:http'

export class Desktop {
  readonly errors: string[] = []
  private application?: ElectronApplication
  private window?: Page
  private options: { dataDir?: string; rendererURL?: string } = {}
  private readonly cleanup: (() => Promise<unknown>)[] = []
  private launchCount = 0

  private constructor(
    readonly root: string,
    private readonly info: TestInfo,
  ) {}

  static async create(info: TestInfo) {
    return new Desktop(await mkdtemp(join(tmpdir(), 'boai-bdd-')), info)
  }

  get app() {
    if (!this.application) throw new Error('请先在场景前提中启动桌面应用')
    return this.application
  }

  get page() {
    if (!this.window) throw new Error('桌面窗口尚未启动或已关闭')
    return this.window
  }

  defer(cleanup: () => Promise<unknown>) {
    this.cleanup.push(cleanup)
  }

  trackServer(server: Server) {
    this.defer(async () => {
      server.closeAllConnections()
      if (server.listening) await new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())))
    })
  }

  async start(options: { dataDir?: string; rendererURL?: string } = this.options) {
    if (this.application) throw new Error('桌面已启动；使用 restart 保留数据后重启')
    this.options = options
    const env = { ...process.env, BOAI_DATA_DIR: options.dataDir ?? this.root, NODE_ENV: 'test' }
    // Never inherit a developer's renderer URL into a production-build scenario.
    delete (env as NodeJS.ProcessEnv).BOAI_RENDERER_URL
    if (options.rendererURL) (env as NodeJS.ProcessEnv).BOAI_RENDERER_URL = options.rendererURL
    const packaged = process.env.BOAI_TEST_PACKAGED_PATH
    this.application = await electron.launch({
      ...(packaged ? { executablePath: packaged, args: [] } : { args: [resolve('.')] }),
      env,
    })
    this.launchCount++
    await this.application.context().tracing.start({ screenshots: true, snapshots: true, sources: true })
    this.window = await this.application.firstWindow()
    this.window.on('pageerror', (error) => this.errors.push(error.message))
    await this.window.waitForFunction(() => Boolean(window.boai))
    return this.application
  }

  async restart() {
    await this.close()
    await this.start()
  }

  async close() {
    const app = this.application,
      page = this.window
    if (!app) return
    const path = this.info.outputPath(`desktop-${this.launchCount}.zip`)
    try {
      await app.context().tracing.stop({ path })
      await this.info.attach(`桌面启动 ${this.launchCount}`, { path, contentType: 'application/zip' })
    } finally {
      try {
        if (page && !page.isClosed()) await page.evaluate(() => window.boai.request('setUnsavedChanges', { dirty: false })).catch(() => {})
        await app.close()
      } finally {
        this.application = undefined
        this.window = undefined
      }
    }
  }

  async dispose() {
    const failures: unknown[] = []
    if (this.info.status !== this.info.expectedStatus && this.window && !this.window.isClosed()) {
      try {
        await this.info.attach('失败窗口', { body: await this.window.screenshot(), contentType: 'image/png' })
      } catch (error) {
        failures.push(error)
      }
    }
    try {
      await this.close()
    } catch (error) {
      failures.push(error)
    }
    for (const cleanup of this.cleanup.reverse()) {
      try {
        await cleanup()
      } catch (error) {
        failures.push(error)
      }
    }
    try {
      await rm(this.root, { recursive: true, force: true })
    } catch (error) {
      failures.push(error)
    }
    if (failures.length) throw new AggregateError(failures, '桌面测试资源清理失败')
  }
}
