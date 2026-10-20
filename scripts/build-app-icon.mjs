/*
 * [INPUT]: app-icon-helper.swift.
 * [OUTPUT]: Bundled macOS helper for setting current BOAI .app Finder icon.
 * [POS]: Build-time native helper compilation; no app icon operation during build.
 * [PROTOCOL]: Update this Header and scripts/.folder.md when this file changes.
 */
import { mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

export default async function buildAppIcon() {
  if (process.platform !== 'darwin') return
  await mkdir('dist/native', { recursive: true })
  await promisify(execFile)('/usr/bin/swiftc', [
    '-O', '-framework', 'AppKit', 'src/main/app-icon-helper.swift',
    '-o', 'dist/native/app-icon-helper',
  ], { timeout: 120_000, maxBuffer: 1_000_000 })
}
