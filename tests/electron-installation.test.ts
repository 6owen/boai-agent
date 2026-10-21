/*
 * [INPUT]: 锁定Electron实际解压依赖、含大文件的真实ZIP及独立Node子进程。
 * [OUTPUT]: 解压必须完成、字节一致并保留后续文件；退出0但未完成仍失败。
 * [POS]: CI安装依赖的Node24真实回归，不依赖预装Electron二进制。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'

it('Electron安装的大文件ZIP完整解压，不能把提前退出0当就绪', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-electron-extract-'))
  try {
    const require = createRequire(import.meta.url)
    const electron = createRequire(require.resolve('electron/package.json'))
    const extract = electron.resolve('extract-zip')
    const payload = randomBytes(1024 * 1024)
    const zip = new JSZip()
    zip.file('large.bin', payload)
    zip.file('last.txt', 'complete')
    const archive = join(root, 'electron-fixture.zip')
    await writeFile(archive, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
    const output = join(root, 'output')
    const code = `const extract=require(${JSON.stringify(extract)});extract(${JSON.stringify(archive)},{dir:${JSON.stringify(output)}}).then(()=>console.log('extraction-complete')).catch(error=>{console.error(error);process.exitCode=1})`
    const result = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 20_000 })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('extraction-complete')
    expect(await readFile(join(output, 'large.bin'))).toEqual(payload)
    expect(await readFile(join(output, 'last.txt'), 'utf8')).toBe('complete')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
