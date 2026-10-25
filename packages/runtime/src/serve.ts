/*
 * [OUTPUT]: 2026-10-20原生Node加载的package.json导入标注JSON类型，独立服务入口语义保持。
 * Copyright 2026 Craft Docs Ltd. Licensed under Apache-2.0; see ../shared/cli/LICENSE.txt and NOTICE.txt.
 * Modified for BOAI: Node foreground entry, private token discovery and reference-only credentials.
 * [INPUT]: Craft packages/server/src/index.ts @ 22c9f0414ab63e0a22814c9a2ada740206e09091 and explicit serve flags/environment.
 * [OUTPUT]: Standalone ready/stopped JSON and private parent IPC; detached service keeps registered identity.
 * [POS]: Built separate runtime entry loaded by the lightweight CLI.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { startHeadlessServer } from './headless'
import { CliError } from '@boai/shared/cli/protocol'
import appPackage from '../../../package.json' with { type: 'json' }

const { version } = appPackage

export async function serve(options: { dataPath: string; host?: string; port?: string }) {
  const host = options.host ?? process.env.BOAI_RPC_HOST ?? '127.0.0.1', rawPort = options.port ?? process.env.BOAI_RPC_PORT ?? '0'
  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535) throw new CliError('INVALID_REQUEST', '服务端口必须为0–65535')
  const cert = process.env.BOAI_RPC_TLS_CERT, key = process.env.BOAI_RPC_TLS_KEY, ca = process.env.BOAI_RPC_TLS_CA
  if (!!cert !== !!key || ca && !cert) throw new CliError('INVALID_REQUEST', 'TLS证书和私钥必须成对提供，CA须与TLS一起配置')
  const tls = cert && key ? { cert: await readFile(cert), key: await readFile(key), ...(ca ? { ca: await readFile(ca) } : {}) } : undefined
  const token = process.env.BOAI_SERVER_TOKEN
  const secretEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^BOAI_SECRET_[A-Z0-9_]+$/.test(key)))
  // Employee subprocesses must not inherit owner tokens or service model credentials.
  for (const key of Object.keys(process.env)) if (!/^(PATH|HOME|USER|SHELL|LANG|LC_.*|TMPDIR|TEMP|TMP|SystemRoot|APPDATA|LOCALAPPDATA|USERPROFILE|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)) delete process.env[key]
  process.env.BOAI_RUNTIME_PLUGIN_BUNDLE = fileURLToPath(new URL('./plugins/', import.meta.url)).replace(/app\.asar(?=[/\\])/, 'app.asar.unpacked')
  process.env.BOAI_NATIVE_PROCESS_GUARD = fileURLToPath(new URL('../native/boai-process-guard', import.meta.url)).replace(/app\.asar(?=[/\\])/, 'app.asar.unpacked')
  let stopping = false
  const starting = startHeadlessServer({ dataPath: resolve(options.dataPath), host, port: Number(rawPort), token, tls, secretEnvironment, version })
  const stop = () => { stopping = true; void starting.then(server => server.close()).catch(() => { process.stderr.write('服务尚未确认退出\n'); process.exitCode = 1 }) }
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  try {
    const server = await starting
    if (!stopping) {
      const ready = { type: 'ready', url: server.url, ...server.status() }
      process.stdout.write(`${JSON.stringify(ready)}\n`)
      if (process.connected) process.send?.(ready, () => {})
    }
    await server.finished
    process.stdout.write(`${JSON.stringify({ type: 'stopped', serverId: server.serverId })}\n`)
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop) }
}
