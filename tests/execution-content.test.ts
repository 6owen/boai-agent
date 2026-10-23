/*
 * [INPUT]: 真实正文分页读取函数与可控版本变化/清理/身份不匹配回执。
 * [OUTPUT]: 新版本完整读取、跨页变化重读、不混拼、有限快重试及真实错误保留。
 * [POS]: 执行正文读取回归，不调用模型。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { expect, it, vi } from 'vitest'
import type { DesktopApi } from '../src/shared/ipc'
import type { AgentRun } from '../src/shared/domain'
import type { ExecutionEvidence } from '../src/shared/domain/execution'
import { ExecutionContentUpdating, readExecutionEvidence } from '../src/renderer/components/detail-panel/execution-content'
const run = { id: 'run', conversationId: 'chat' } as AgentRun
const full = (revision: number, text = '完整的思考正文') => ({ id: 'body', runId: run.id, conversationId: run.conversationId, revision, payload: { text }, deferred: false } as ExecutionEvidence)
const deferred = { ...full(1), deferred: true, payload: { deferred: true } }
const api = (request: ReturnType<typeof vi.fn>) => ({ request } as unknown as DesktopApi)
const page = (value: ExecutionEvidence, offset = 0, size = Infinity) => {
  const body = JSON.stringify(value), end = Math.min(body.length, offset + size)
  return { content: body.slice(offset, end), length: body.length, revision: value.revision, ...(end < body.length ? { next: end } : {}) }
}
it.each([1, undefined, null])('reads a newer complete snapshot when list revision %s is behind the stream', async revision => {
  const value = full(9), request = vi.fn(async () => page(value))
  expect(await readExecutionEvidence(api(request), run, { ...deferred, revision }, true)).toEqual(value)
  expect(request).toHaveBeenCalledTimes(1)
})
it('restarts at zero after a page changes and never mixes versions into JSON', async () => {
  const first = full(2, '旧文本'), latest = full(3, '新的完整正文'), offsets: number[] = []
  const request = vi.fn(async (_method, query) => {
    offsets.push(query.offset)
    return page(offsets.length === 1 ? first : latest, query.offset, 100)
  })
  expect(await readExecutionEvidence(api(request), run, deferred, true)).toEqual(latest)
  expect(offsets).toEqual([0, 100, 0, 100])
})
it('classifies continuous updates separately and yields after three snapshot attempts', async () => {
  let revision = 1
  const request = vi.fn(async (_method, query) => page(full(++revision), query.offset, 100))
  await expect(readExecutionEvidence(api(request), run, deferred, true)).rejects.toBeInstanceOf(ExecutionContentUpdating)
  expect(request).toHaveBeenCalledTimes(6)
})
it('keeps exact revision reads for tool details unless following updates is requested', async () => {
  const request = vi.fn(async () => page(full(2)))
  await expect(readExecutionEvidence(api(request), run, deferred)).rejects.toBeInstanceOf(ExecutionContentUpdating)
  expect(request).toHaveBeenCalledTimes(1)
})
it('preserves real cleanup failures instead of treating them as streaming', async () => {
  const request = vi.fn(async () => { throw new Error('执行内容已清理') })
  await expect(readExecutionEvidence(api(request), run, deferred, true)).rejects.toThrow('执行内容已清理')
  expect(request).toHaveBeenCalledTimes(1)
})
it('rejects foreign evidence instead of displaying another run body', async () => {
  const request = vi.fn(async () => page({ ...full(1), runId: 'other-run' }))
  await expect(readExecutionEvidence(api(request), run, deferred, true)).rejects.toThrow('原记录不匹配')
})
it('rejects a nonadvancing page cursor instead of looping forever', async () => {
  const request = vi.fn(async () => ({ ...page(full(1), 0, 100), next: 0 }))
  await expect(readExecutionEvidence(api(request), run, deferred, true)).rejects.toThrow('分页位置无效')
})
it('does not fetch bodies already included in the execution record', async () => {
  const request = vi.fn(), value = full(1)
  expect(await readExecutionEvidence(api(request), run, value, true)).toBe(value)
  expect(request).not.toHaveBeenCalled()
})
