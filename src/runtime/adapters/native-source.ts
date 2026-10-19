/*
 * [INPUT]: Adapter-selected configuration paths and the actual inherited native environment.
 * [OUTPUT]: Bounded read-only provider identities excluding transient CLI transport leases; projections share the same guarded bytes.
 * [POS]: Native session compatibility fence, not a configuration parser or execution authority.
 * [PROTOCOL]: Update Header and adapters/.folder.md when changing snapshot semantics.
 */
import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function configurationAncestors(cwd: string): string[] {
  const result: string[] = []; let path = resolve(cwd)
  for (let depth = 0; depth < 64; depth++) { result.push(path); const parent = dirname(path); if (parent === path) return result; path = parent }
  throw new Error('原生配置目录层级过深，未提交消息')
}
export async function nativeConfigurationIdentity(files: string[], environment: NodeJS.ProcessEnv): Promise<string> {
  return (await nativeConfigurationIdentities(files, environment))[0]
}
/** Additional identities use the same reads/environment, never a second unchecked snapshot. */
export async function nativeConfigurationIdentities(files: string[], environment: NodeJS.ProcessEnv, projections: ((path: string, bytes: Buffer) => Buffer | undefined)[] = []): Promise<string[]> {
  if (files.length > 256) throw new Error('原生配置来源过多，未提交消息')
  const hashes = Array.from({ length: projections.length + 1 }, () => createHash('sha256').update('native-source-v1'))
  // These are process transport details, not native configuration. Everything
  // else stays opaque so custom provider env references remain covered.
  const transport = new Set(['NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'ELECTRON_RUN_AS_NODE', 'BOAI_SERVER_URL', 'BOAI_SERVER_TOKEN', 'BOAI_CLI_EMPLOYEE_RUN'])
  const encodedEnvironment = JSON.stringify(Object.entries(environment).filter(([key]) => !transport.has(key)).sort(([a], [b]) => a.localeCompare(b)))
  for (const hash of hashes) hash.update(encodedEnvironment)
  for (const path of [...new Set(files.map(path => resolve(path)))].sort()) {
    for (const hash of hashes) hash.update(path)
    let file: Awaited<ReturnType<typeof open>> | undefined
    try {
      file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK); const before = await file.stat()
      if (!before.isFile() || before.size > 2 * 1024 * 1024) throw new Error('unreadable')
      const buffer = Buffer.alloc(before.size + 1); let length = 0
      while (length < buffer.length) { const read = await file.read(buffer, length, buffer.length - length); if (!read.bytesRead) break; length += read.bytesRead }
      try {
        const after = await file.stat()
        if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error('changed')
        const bytes = buffer.subarray(0, length)
        for (const [index, hash] of hashes.entries()) {
          const projected = index ? projections[index - 1](path, bytes) : bytes
          if (projected) hash.update('present').update(projected)
          else hash.update('absent')
        }
      } finally { buffer.fill(0) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') for (const hash of hashes) hash.update('absent')
      else throw new Error('原生配置当前无法稳定核对，未提交消息')
    } finally { await file?.close() }
  }
  return hashes.map(hash => hash.digest('hex'))
}
