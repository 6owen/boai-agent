/*
 * [INPUT]: Artifact URL, pinned SHA256, persistent cache and optional cancellation signal.
 * [OUTPUT]: Verified download with bounded retries and partial bytes preserved across invocations.
 * [POS]: Release download transport; no whole-transfer deadline or installer execution.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'

const execute = promisify(execFile)
async function matches(path, expected, signal) {
  const hash = createHash('sha256')
  try { for await (const bytes of createReadStream(path, { signal })) hash.update(bytes) }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
  return hash.digest('hex') === expected
}

export async function downloadReleaseArtifact(url, target, { cacheRoot, sha256, signal, attempts = 3, retryDelayMs = 1500, log = console.log } = {}) {
  if (!/^[a-f0-9]{64}$/.test(sha256 ?? '')) throw Error('下载资产缺少固定SHA256')
  signal?.throwIfAborted()
  const partialRoot = join(cacheRoot, 'partial'), partial = join(partialRoot, `${sha256}.part`)
  await mkdir(partialRoot, { recursive: true })
  for (let attempt = 1; attempt <= attempts; attempt++) {
    signal?.throwIfAborted()
    try {
      if (!await matches(partial, sha256, signal)) {
        const bytes = (await stat(partial).catch(error => { if (error.code === 'ENOENT') return null; throw error }))?.size ?? 0
        log(`${bytes ? '续传' : '下载'} ${basename(target)}${bytes ? `（已下载${(bytes / 1024 / 1024).toFixed(1)} MB）` : ''}，第${attempt}/${attempts}次`)
        // Separate curl invocations recalculate the resume offset after each failure.
        // curl's own --retry truncates bytes written by the failed attempt.
        await execute('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error', '--connect-timeout', '20', '--speed-limit', '1024', '--speed-time', '60', '--continue-at', '-', '--output', partial, url], { signal })
        if (!await matches(partial, sha256, signal)) {
          await rm(partial, { force: true })
          throw Error('下载资产SHA256校验失败')
        }
      }
      signal?.throwIfAborted()
      await copyFile(partial, target)
      await rm(partial, { force: true })
      return
    } catch (error) {
      if (signal?.aborted) throw error
      // Servers without byte ranges require a fresh request; never append their full response.
      if (error.code === 33 || error.code === 22 && /\b416\b/.test(error.stderr ?? '')) await rm(partial, { force: true })
      if (attempt === attempts) throw error
      log(`下载暂未完成，保留断点后重试（${attempt}/${attempts}）`)
      await setTimeout(retryDelayMs, undefined, { signal })
    }
  }
}
