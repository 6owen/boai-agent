/*
 * [INPUT]: 显式 BOAI_REVIEW_RUN_DIR、Playwright 场景身份、真实窗口与本场景隔离目录内的明确文件/白名单数据。
 * [OUTPUT]: 不覆盖旧尝试的原始截图、原件字节/hash、有限 JSON、trace 索引及显式证据缺口；Playwright与原生整幅capturePage画面分源保留，原生PNG仅读头部维度并记录原窗口/zoom/图像代表元数据，不处理像素；不扫描应用库或浏览器登录资料。
 * [POS]: Electron BDD 可选留证器；技术结果与人工待审阅分开，普通测试不启用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Page, TestInfo } from '@playwright/test'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, realpath, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_DATA_BYTES = 1024 * 1024
const PRIVATE_DIRECTORIES = new Set(['partitions', 'browser', 'session storage', 'local storage', 'indexeddb', 'service worker', 'cache', 'code cache', 'blob_storage'])

export interface NativeReviewScreenshot {
  png: Buffer
  metadata: { method: 'Electron.webContents.capturePage()'; rect: null; pixelTransform: 'none'; native: Record<string, unknown>; renderer: { width: number; height: number; [key: string]: unknown }; image: Record<string, unknown> }
}

interface ReviewEvidence {
  kind: 'screenshot' | 'file' | 'data'
  label: string
  path: string
  sha256: string
  bytes: number
  capturedAt: string
  launch: number
  source?: string
  viewport?: { width: number; height: number } | null
  nativeCapture?: NativeReviewScreenshot['metadata'] & { pngDimensions: { width: number; height: number } }
}

const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const within = (root: string, path: string) => {
  const remainder = relative(root, path)
  return remainder !== '' && remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder)
}
const safeName = (value: string) => value.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 70) || 'evidence'
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 2000)

/** Reads only the caller's explicit regular file; every descendant component must remain inside the scenario root. */
async function readScenarioFile(root: string, input: string) {
  const canonicalRoot = await realpath(root)
  const path = resolve(root, input)
  const lexicalRoot = resolve(root)
  const anchor = within(lexicalRoot, path) ? lexicalRoot : canonicalRoot
  if (!within(anchor, path)) throw new Error('仅可归档本场景隔离目录内的明确文件')
  const source = relative(anchor, path)
  const parts = source.split(sep)
  if (parts.slice(0, -1).some((part) => PRIVATE_DIRECTORIES.has(part.toLowerCase()))) throw new Error('浏览器登录资料和内部缓存不纳入审阅原件')
  const verify = async () => {
    let current = anchor
    for (const part of parts) {
      current = join(current, part)
      if ((await lstat(current)).isSymbolicLink()) throw new Error('不归档符号链接或经符号链接访问的文件')
    }
    if (!within(canonicalRoot, await realpath(path))) throw new Error('原件真实路径已离开本场景隔离目录')
  }
  await verify()
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    if (!before.isFile()) throw new Error('审阅原件必须是普通文件')
    if (before.size > MAX_FILE_BYTES) throw new Error('原件超过 20 MiB 留证上限')
    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!result.bytesRead) throw new Error('归档时原件长度发生变化')
      offset += result.bytesRead
    }
    const after = await handle.stat()
    const current = await lstat(path)
    await verify()
    if (before.dev !== current.dev || before.ino !== current.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('归档时原件被修改或替换，未保留不确定快照')
    return { bytes, source }
  } finally {
    await handle.close()
  }
}

export class FeatureReview {
  private directory?: string
  private readonly startedAt = new Date().toISOString()
  private readonly evidence: ReviewEvidence[] = []
  private readonly traces: { path: string; launch: number; bytes: number; sha256: string }[] = []
  private readonly gaps: { label: string; reason: string; recordedAt: string }[] = []
  private sequence = 0
  private queue = Promise.resolve()
  private launchCount = 0
  private completedAt?: string
  private cleanupErrors: string[] = []

  private constructor(private readonly root: string, private readonly info: TestInfo) {}

  static async create(root: string, info: TestInfo) {
    const runDirectory = process.env.BOAI_REVIEW_RUN_DIR
    if (!runDirectory) return undefined
    const review = new FeatureReview(root, info)
    try {
      const scenarios = resolve(runDirectory, 'scenarios')
      await mkdir(scenarios, { recursive: true })
      review.directory = await mkdtemp(join(scenarios, `${safeName(info.testId)}-retry${info.retry}-repeat${info.repeatEachIndex}-`))
    } catch (error) {
      review.gap('初始化留证目录', error)
    }
    await review.saveManifest()
    return review
  }

  launched(count: number) { this.launchCount = count }

  private gap(label: string, error: unknown) {
    const reason = errorText(error)
    this.gaps.push({ label, reason, recordedAt: new Date().toISOString() })
    this.info.annotations.push({ type: 'evidence-gap', description: `${label}：${reason}` })
  }

  private manifest() {
    return {
      schemaVersion: 1,
      testId: this.info.testId,
      title: this.info.title,
      titlePath: this.info.titlePath,
      location: { file: this.info.file, line: this.info.line, column: this.info.column },
      project: this.info.project.name,
      retry: this.info.retry,
      repeatEachIndex: this.info.repeatEachIndex,
      workerIndex: this.info.workerIndex,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      status: this.completedAt ? this.info.status : 'running',
      expectedStatus: this.info.expectedStatus,
      resultPhase: this.completedAt ? 'desktop-fixture-teardown' : 'running',
      humanReview: 'pending',
      modelMode: 'offline-protocol-or-fixture',
      launchCount: this.launchCount,
      evidence: this.evidence,
      traces: this.traces,
      gaps: this.gaps,
      cleanupErrors: this.cleanupErrors,
      testErrors: this.info.errors.map((error) => ({ message: error.message, stack: error.stack })),
      notes: ['截图保留各采集方式的原始字节；Playwright与Electron原生capturePage分源标注，缩放画面完整性以原生尺寸/zoom/PNG元数据和实际审阅核对；trace 是事件回放，不是连续录屏。', '原生capturePage无rect，仅采集当前webContents整幅可见页面，不包括系统窗口边框或其他webContents。', '本文件在桌面 fixture 清理阶段记录状态；最终测试结果以本批 Playwright 报告为准。', '只归档显式指定的原件/白名单 JSON；未自动导出完整聊天、数据库或浏览器登录资料。'],
    }
  }

  private async saveManifest() {
    if (!this.directory) return
    try {
      await writeFile(join(this.directory, 'manifest.json'), JSON.stringify(this.manifest(), null, 2))
    } catch (error) { this.gap('保存场景清单', error) }
  }

  private capture(label: string, action: () => Promise<void>) {
    this.queue = this.queue.then(async () => {
      try {
        if (!this.directory) throw new Error('场景留证目录不可用')
        await action()
      } catch (error) { this.gap(label, error) }
      await this.saveManifest()
    })
    return this.queue
  }

  private async store(kind: ReviewEvidence['kind'], label: string, bytes: Buffer, filename: string, contentType: string, extra: Partial<ReviewEvidence> = {}) {
    const path = `${String(++this.sequence).padStart(3, '0')}-${safeName(filename)}`
    const absolute = join(this.directory!, path)
    await writeFile(absolute, bytes, { flag: 'wx' })
    this.evidence.push({ kind, label, path, sha256: digest(bytes), bytes: bytes.length, capturedAt: new Date().toISOString(), launch: this.launchCount, ...extra })
    await this.info.attach(label, { path: absolute, contentType })
  }

  checkpoint(label: string, page?: Page) {
    return this.capture(label, async () => {
      if (!page || page.isClosed()) throw new Error('窗口未启动或已经关闭，未获取画面')
      await this.store('screenshot', label, await page.screenshot({ timeout: 5000 }), `${safeName(label)}.png`, 'image/png', { source: 'Playwright.page.screenshot()', viewport: page.viewportSize() })
    })
  }

  nativeCheckpoint(label: string, read: () => Promise<NativeReviewScreenshot>) {
    return this.capture(label, async () => {
      const { png, metadata } = await read()
      // Inspect PNG's IHDR only; the captured bytes are never decoded, cropped or resized.
      if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('原生截取未返回带尺寸的PNG原件')
      const pngDimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
      if (!pngDimensions.width || !pngDimensions.height) throw new Error('原生截取画面为空')
      const nativeCapture = { ...metadata, pngDimensions }
      await this.store('screenshot', label, png, `${safeName(label)}.native.png`, 'image/png', { source: metadata.method, viewport: { width: metadata.renderer.width, height: metadata.renderer.height }, nativeCapture })
      const recorded = Buffer.from(JSON.stringify({ ...nativeCapture, pngBytes: png.length, pngSha256: digest(png) }, null, 2))
      await this.store('data', `${label} · 原生截取元数据`, recorded, `${safeName(label)}.capture.json`, 'application/json', { source: metadata.method })
    })
  }

  file(label: string, path: string) {
    return this.capture(label, async () => {
      const { bytes, source } = await readScenarioFile(this.root, path)
      await this.store('file', label, bytes, basename(path), 'application/octet-stream', { source })
    })
  }

  data(label: string, value: unknown) {
    return this.capture(label, async () => {
      const serialized = JSON.stringify(value, null, 2)
      if (serialized === undefined) throw new Error('数据必须可以序列化为 JSON')
      const bytes = Buffer.from(serialized)
      if (bytes.length > MAX_DATA_BYTES) throw new Error('白名单数据超过 1 MiB 留证上限')
      await this.store('data', label, bytes, `${safeName(label)}.json`, 'application/json')
    })
  }

  trace(path: string, launch: number) {
    return this.capture(`桌面启动 ${launch} trace`, async () => {
      const handle = await open(path, 'r')
      try {
        const hash = createHash('sha256')
        for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk)
        this.traces.push({ path: resolve(path), launch, bytes: (await handle.stat()).size, sha256: hash.digest('hex') })
      } finally { await handle.close() }
    })
  }

  async finish(cleanupErrors: unknown[]) {
    await this.queue
    this.cleanupErrors = cleanupErrors.map(errorText)
    this.completedAt = new Date().toISOString()
    if (!this.evidence.some((item) => item.kind === 'screenshot')) this.gap('场景画面', new Error('没有保留任何真实窗口截图'))
    if (this.traces.length !== this.launchCount) this.gap('运行回放', new Error(`启动 ${this.launchCount} 次，留存 ${this.traces.length} 份 trace`))
    await this.saveManifest()
    try {
      await this.info.attach('场景审阅清单', { body: Buffer.from(JSON.stringify(this.manifest(), null, 2)), contentType: 'application/json' })
    } catch (error) { this.gap('附加场景审阅清单', error); await this.saveManifest() }
  }
}
