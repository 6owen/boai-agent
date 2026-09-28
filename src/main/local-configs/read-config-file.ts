/*
 * [INPUT]: 本地配置文件路径。
 * [OUTPUT]: 限制大小、拒绝符号链接的 UTF-8 配置读取；缺失文件返回 undefined。
 * [POS]: main/local-configs 的共享文件读取边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs'

const MAX_BYTES = 1024 * 1024

export function readConfigFile(path: string): string | undefined {
  let descriptor: number | undefined
  try {
    const info = lstatSync(path)
    if (!info.isFile() || info.size > MAX_BYTES) throw new Error('配置文件不是普通文件或超过大小限制')
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const opened = fstatSync(descriptor)
    if (!opened.isFile() || opened.size > MAX_BYTES) throw new Error('配置文件超过读取限制')
    return readFileSync(descriptor, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error('无法读取配置文件，或文件超过大小限制')
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}
