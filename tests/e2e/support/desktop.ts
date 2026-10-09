/*
 * [OUTPUT]: BOAI_TEST_DEV_SERVER=1 显式沿 pnpm dev 启动 Vite/宿主及原 BDD 调试连接，重启同一路径，不生成安装包。
 * [OUTPUT]: 原生关闭场景显式核对实际已关闭窗口，只保存无可用结束画面的事实；普通场景仍要求结束截图，trace及实际退出保持。
 * [OUTPUT]: reviewFile可要求必需原件和已登记hash，归档失败向调用者显式拒绝，场景结束前继续保留其余证据。
 * [OUTPUT]: 可显式为本场额外窗口原样留证；省略目标仍沿原主窗口，不改变启动、关闭或业务权限。
 * [INPUT]: Playwright Electron、场景独立数据目录、可选打包入口与组件测试服务、显式 BOAI_REVIEW_RUN_DIR。
 * [OUTPUT]: 可重启的真实桌面生命周期与资源回收；可选关键画面/明确原件/白名单数据归档、每次关闭前画面和逐次 trace 索引；独立原生窗口capturePage整幅截取及窗口/zoom/renderer/NativeImage代表元数据，零viewport/图像修改。
 * [POS]: Electron BDD 场景共享宿主；启动由 Given 控制，允许先准备旧数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { _electron as electron, type ElectronApplication, type JSHandle, type Page, type TestInfo } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Server } from 'node:http'
import { FeatureReview } from './feature-review'

export class Desktop {
  readonly errors: string[] = []
  private application?: ElectronApplication
  private window?: Page
  private options: { dataDir?: string; rendererURL?: string; mainEntry?: string } = {}
  private readonly cleanup: (() => Promise<unknown>)[] = []
  private launchCount = 0

  private constructor(
    readonly root: string,
    private readonly info: TestInfo,
    private readonly review?: FeatureReview,
  ) {}

  static async create(info: TestInfo) {
    const root = await mkdtemp(join(tmpdir(), 'boai-bdd-'))
    return new Desktop(root, info, await FeatureReview.create(root, info))
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

  async reviewCheckpoint(label: string, targetPage?: Page): Promise<void> {
    await this.review?.checkpoint(label, targetPage ?? this.window)
  }

  async reviewNativeCheckpoint(label: string, targetPage?: Page): Promise<void> {
    await this.review?.nativeCheckpoint(label, async () => {
      const app = this.application, page = targetPage ?? this.window
      if (!app || !page || page.isClosed()) throw new Error('原生窗口未启动或已关闭，未获取画面')
      const renderer = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, outerWidth, outerHeight, devicePixelRatio, visualViewport: visualViewport && { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } }))
      const window = await app.browserWindow(page) as JSHandle<import('electron').BrowserWindow>
      try {
        const captured = await app.evaluate(async ({ screen }, window) => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) throw new Error('原生目标窗口已销毁')
          const before = { contentSize: window.getContentSize(), bounds: window.getBounds(), contentBounds: window.getContentBounds(), zoomFactor: window.webContents.getZoomFactor() }
          // Omit both rect and options: capture the whole actual visible webContents, independent of CSS zoom.
          const image = await window.webContents.capturePage()
          if (image.isEmpty()) throw new Error('原生capturePage返回空画面')
          const scaleFactors = image.getScaleFactors(), pngScaleFactor = Math.max(...scaleFactors)
          if (!Number.isFinite(pngScaleFactor) || pngScaleFactor <= 0) throw new Error('原生画面缺少有效像素代表')
          const png = image.toPNG({ scaleFactor: pngScaleFactor })
          const after = { contentSize: window.getContentSize(), bounds: window.getBounds(), contentBounds: window.getContentBounds(), zoomFactor: window.webContents.getZoomFactor() }
          if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('原生截取期间窗口尺寸或缩放变化，未登记不确定画面')
          const display = screen.getDisplayMatching(after.bounds)
          return { png: png.toString('base64'), native: { windowId: window.id, webContentsId: window.webContents.id, before, after, display: { bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor } }, image: { scaleFactors, representations: scaleFactors.map(scaleFactor => ({ scaleFactor, size: image.getSize(scaleFactor) })), pngScaleFactor } }
        }, window)
        return { png: Buffer.from(captured.png, 'base64'), metadata: { method: 'Electron.webContents.capturePage()', rect: null, pixelTransform: 'none', native: captured.native, renderer, image: captured.image } }
      } finally { await window.dispose() }
    })
  }

  async reviewFile(label: string, path: string, options: { required?: boolean; expectedSha256?: string } = {}): Promise<void> {
    await this.review?.file(label, path, options)
  }

  async reviewData(label: string, value: unknown): Promise<void> {
    await this.review?.data(label, value)
  }

  trackServer(server: Server) {
    this.defer(async () => {
      server.closeAllConnections()
      if (server.listening) await new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())))
    })
  }

  async start(options: { dataDir?: string; rendererURL?: string; mainEntry?: string } = this.options) {
    if (this.application) throw new Error('桌面已启动；使用 restart 保留数据后重启')
    this.options = options
    const env = { ...process.env, BOAI_DATA_DIR: options.dataDir ?? this.root, NODE_ENV: 'test' }
    // Never inherit a developer's renderer URL into a production-build scenario.
    delete (env as NodeJS.ProcessEnv).BOAI_RENDERER_URL
    if (options.rendererURL) (env as NodeJS.ProcessEnv).BOAI_RENDERER_URL = options.rendererURL
    const packaged = process.env.BOAI_TEST_PACKAGED_PATH
    const dev = process.env.BOAI_TEST_DEV_SERVER === '1'
    if (dev && (packaged || options.rendererURL)) throw new Error('pnpm dev 场景不能混用安装包或另一个渲染入口')
    const devLauncher = join(this.root, 'launch-dev.sh')
    if (dev) await writeFile(devLauncher, '#!/bin/sh\nexec pnpm dev "$@"\n', { mode: 0o700 })
    this.application = await electron.launch({
      ...(packaged ? { executablePath: packaged, args: [] } : { ...(dev ? { executablePath: devLauncher, timeout: 60_000 } : {}), args: [options.mainEntry ?? resolve('.')] }),
      env,
    })
    this.launchCount++
    this.review?.launched(this.launchCount)
    await this.application.context().tracing.start({ screenshots: true, snapshots: true, sources: true })
    this.window = await this.application.firstWindow()
    this.window.on('pageerror', (error) => this.errors.push(error.message))
    await this.window.waitForFunction(() => Boolean(window.boai))
    if (dev) {
      await this.window.locator('.app-shell').waitFor({ timeout: 60_000 })
      await this.reviewData(`第 ${this.launchCount} 次 pnpm dev 启动`, { command: 'pnpm dev', rendererURL: this.window.url(), packaged: false, dataDirectoryIsolated: true })
    }
    return this.application
  }

  async restart(options?: { expectedWindowClosed: true }) {
    await this.close(options)
    await this.start()
  }

  async close(options?: { expectedWindowClosed: true }) {
    const app = this.application,
      page = this.window
    if (!app) return
    if (options?.expectedWindowClosed) {
      if (!page?.isClosed()) throw new Error('原生关闭场景的实际窗口尚未关闭')
      await this.reviewData(`第 ${this.launchCount} 次启动窗口已实际关闭`, { windowClosed: page.isClosed(), screenshotAvailable: false })
    } else if (this.review) await this.reviewCheckpoint(`第 ${this.launchCount} 次启动结束画面`)
    const path = this.info.outputPath(`desktop-${this.launchCount}.zip`)
    try {
      await app.context().tracing.stop({ path })
      await this.review?.trace(path, this.launchCount)
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
    await this.review?.finish(failures)
    if (failures.length) throw new AggregateError(failures, '桌面测试资源清理失败')
  }
}
