/*
 * [INPUT]: Fixed local Magpie discovery, temporary settings and isolated identity probes.
 * [OUTPUT]: Default-first/custom-port discovery, missing/wrong services and settings privacy boundaries.
 * [POS]: Local discovery regression; no supplier inference or personal settings access.
 * [PROTOCOL]: Update Header and tests/.folder.md when changing coverage.
 */
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { probeMagpie } from '../src/runtime/adapters/mastra/model-catalog'
import { discoverLocalMagpie } from '../src/main/local-configs/magpie-discovery'
import type { GatewayIdentity } from '../src/shared/domain/model-gateway'
const cleanup: string[] = []
afterEach(async () => { for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true }) })
async function fixture() { const home = await mkdtemp(join(tmpdir(), 'magpie-discovery-')); cleanup.push(home); await mkdir(join(home, '.config/magpie'), { recursive: true }); return { home, configHome: '', file: join(home, '.config/magpie/settings.json') } }
const identity = (baseUrl: string): GatewayIdentity => ({ name: 'magpie', version: 'fixture', baseUrl })
test('default hello succeeds without depending on unreadable settings', async () => {
  const f = await fixture(); await writeFile(f.file, 'not valid settings')
  const calls: string[] = []
  expect(await discoverLocalMagpie(async url => { calls.push(url); return identity(url) }, f)).toEqual(identity('http://127.0.0.1:3425'))
  expect(calls).toEqual(['http://127.0.0.1:3425'])
})
test('only a verified custom local port is exposed; provider credentials stay out of the result', async () => {
  const f = await fixture(); await writeFile(f.file, JSON.stringify({ port: 4567, secret: 'fixture-private-secret', providers: [{ key: 'fixture-key' }] }))
  const calls: string[] = []
  const result = await discoverLocalMagpie(async url => { calls.push(url); if (calls.length === 1) throw new Error('not magpie'); return identity(url) }, f)
  expect(result).toEqual(identity('http://127.0.0.1:4567')); expect(calls).toEqual(['http://127.0.0.1:3425', 'http://127.0.0.1:4567'])
  expect(JSON.stringify(result)).not.toContain('fixture-private-secret')
})
test('absolute XDG location is honored and relative XDG falls back to the user config directory', async () => {
  const f = await fixture(), xdg = join(f.home, 'xdg'); await mkdir(join(xdg, 'magpie'), { recursive: true }); await writeFile(join(xdg, 'magpie/settings.json'), '{"port":5678}'); await writeFile(f.file, '{"port":6789}')
  const probe = async (url: string) => { if (url.endsWith(':3425')) throw new Error('off'); return identity(url) }
  expect((await discoverLocalMagpie(probe, { ...f, configHome: xdg })).baseUrl).toBe('http://127.0.0.1:5678')
  expect((await discoverLocalMagpie(probe, { ...f, configHome: 'relative' })).baseUrl).toBe('http://127.0.0.1:6789')
})
test.each(['{"port":"4567"}', '{"port":70000}', '{"port":0}', '{"port":3425}', 'broken'])('invalid settings never become a guessed network target: %s', async content => {
  const f = await fixture(); await writeFile(f.file, content); const calls: string[] = []
  await expect(discoverLocalMagpie(async url => { calls.push(url); throw new Error('private-upstream-detail') }, f)).rejects.toThrow('未发现')
  expect(calls).toEqual(['http://127.0.0.1:3425'])
})
test('missing, oversized and symlinked settings fail without disclosing source text or following a target', async () => {
  const f = await fixture(), calls: string[] = []
  const probe = async (url: string): Promise<GatewayIdentity> => { calls.push(url); throw new Error('private-upstream-detail') }
  await expect(discoverLocalMagpie(probe, f)).rejects.toThrow('未发现')
  await writeFile(f.file, 'x'.repeat(1024 * 1024 + 1)); await expect(discoverLocalMagpie(probe, f)).rejects.toThrow('未发现')
  await rm(f.file); const target = join(f.home, 'private.json'); await writeFile(target, '{"port":4567}'); await symlink(target, f.file)
  await expect(discoverLocalMagpie(probe, f)).rejects.toThrow('未发现'); expect(calls).toEqual(Array(3).fill('http://127.0.0.1:3425'))
})

test.skipIf(!process.env.BOAI_MAGPIE_READONLY)('installed local discovery verifies the running service without inference', async () => {
  const result = await discoverLocalMagpie(probeMagpie)
  expect(result.name).toBe('magpie'); expect(result.version).toBeTruthy(); expect(result.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
})
