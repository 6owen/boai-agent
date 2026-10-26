/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: Local macOS SDK and fixed ScreenCaptureKit/Vision helper source.
 * [OUTPUT]: Native local-OCR helper; building never requests permission or captures a screen.
 * [POS]: Shared host build step.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { readFile, mkdir, writeFile, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
export default async function buildDesktopActivity() {
  if (process.platform !== 'darwin') return
  const source = join(root, 'apps/electron/src/main/desktop-activity.swift'), output = join(root, 'dist/native/boai-desktop-activity')
  const hash = createHash('sha256').update(await readFile(source)).update(process.arch).digest('hex')
  try { await access(output); if ((await readFile(`${output}.sha256`, 'utf8')) === hash) return } catch {}
  await mkdir(join(root, 'dist/native'), { recursive: true })
  await promisify(execFile)('/usr/bin/swiftc', ['-parse-as-library', '-O', '-framework', 'Cocoa', '-framework', 'ScreenCaptureKit', '-framework', 'Vision', '-framework', 'Carbon', source, '-o', output], { timeout: 120000, maxBuffer: 1000000 })
  await writeFile(`${output}.sha256`, hash)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildDesktopActivity()
