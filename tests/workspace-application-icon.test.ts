/*
 * [INPUT]: Temporary bundle resources and controlled plutil/sips adapter.
 * [OUTPUT]: Declared icon selection, optional .icns suffix, conversion cleanup and path/failure rejection without Electron.
 * [POS]: macOS workspace application icon reader regression; actual installed icons checked separately.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { readMacApplicationIcon } from '../apps/electron/src/main/workspace-application-icon'

const runner = vi.hoisted(() => vi.fn())
vi.mock('node:util', () => ({ promisify: () => runner }))
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lEAAAAAASUVORK5CYII=', 'base64')
let root: string, output: string | undefined
beforeEach(async () => { runner.mockReset(); output = undefined; root = await mkdtemp(join(tmpdir(), 'boai-icon fixture-')); await mkdir(join(root, 'Contents', 'Resources'), { recursive: true }) })
afterEach(async () => { await rm(root, { recursive: true, force: true }); if (output) await rm(dirname(output), { recursive: true, force: true }) })

it.each(['Code.icns', 'Finder'])('converts the declared %s icon using literal argv and removes the temporary PNG', async declared => {
  const source = join(root, 'Contents', 'Resources', declared.endsWith('.icns') ? declared : `${declared}.icns`)
  await writeFile(source, 'icns fixture')
  runner.mockImplementation(async (command: string, args: string[]) => {
    if (command === '/usr/bin/plutil') return { stdout: `${declared}\n` }
    expect(args.slice(0, 5)).toEqual(['-s', 'format', 'png', '-Z', '64'])
    expect(args[5]).toBe(source)
    output = args.at(-1)!
    await writeFile(output, png)
    return { stdout: '' }
  })
  expect(await readMacApplicationIcon(root)).toBe(`data:image/png;base64,${png.toString('base64')}`)
  await expect(access(dirname(output!))).rejects.toThrow()
})

it('rejects an icon name escaping Resources before conversion', async () => {
  runner.mockResolvedValue({ stdout: '../../outside.icns' })
  expect(await readMacApplicationIcon(root)).toBeUndefined()
  expect(runner).toHaveBeenCalledOnce()
})

it('keeps icon failure optional and removes conversion files even when sips fails', async () => {
  await writeFile(join(root, 'Contents', 'Resources', 'AppIcon.icns'), 'icns fixture')
  runner.mockImplementation(async (command: string, args: string[]) => {
    if (command === '/usr/bin/plutil') return { stdout: 'AppIcon' }
    output = args.at(-1)!
    await writeFile(output, 'partial')
    throw new Error('conversion failed')
  })
  expect(await readMacApplicationIcon(root)).toBeUndefined()
  await expect(access(dirname(output!))).rejects.toThrow()
})
