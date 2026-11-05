/*
 * [INPUT]: Production execution body cache and delayed read completion.
 * [OUTPUT]: Shared history byte budget, bounded entries and cleared-source late response isolation.
 * [POS]: Memory ownership regression; full durable evidence is never deleted.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { ExecutionContentCache } from '../apps/electron/src/renderer/components/detail-panel/execution-content-cache'

it('bounds bodies across many runs in one cache', () => {
  const cache = new ExecutionContentCache()
  for (let run = 0; run < 12; run++) cache.set(`body:run-${run}`, 'x'.repeat(1024 * 1024))
  expect(cache.bytes).toBeLessThanOrEqual(8 * 1024 * 1024)
  expect(cache.get('body:run-0')).toBeUndefined()
  expect(cache.get('body:run-11')).toBeDefined()
})

it('clearing releases bodies and prevents a late response from repopulating them', async () => {
  const cache = new ExecutionContentCache()
  cache.set('old', 'retained history')
  let finish!: (value: string) => void
  const late = cache.load('body', () => new Promise<string>(resolve => { finish = resolve }))
  cache.clear()
  expect(cache.bytes).toBe(0)
  expect(cache.get('old')).toBeUndefined()
  await cache.load('body', async () => 'new authoritative content')
  finish('old content')
  await expect(late).resolves.toBe('old content')
  expect(cache.get('body')).toBe('new authoritative content')
})
