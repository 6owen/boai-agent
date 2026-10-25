/*
 * [INPUT]: Renderer 真实个人历史/可见完成快照、独立阅读/锚点版本、搜索游标和原会话/消息/文件目标。
 * [OUTPUT]: 搜索索引代际不混页/最新覆盖回执与中文多词原样高亮；详情固定 ID/limit1/四项并行、隐藏停止后续批次与错误身份不泄露正文；旧页底部保持历史锚点而非切换最新跟随；页面内有符号小数位置与原非负整数持久合同分离且同持久格不重写；不以开始序号猜已读、失焦隐藏/流式拒绝、完成去重与缺口保留、独立 CAS 迟到合并、有界历史和固定搜索目标的意图测试；显式核对只解除后续真实交互的去重屏障，不重放失联写入。
 * [POS]: D6 Renderer 纯状态验收；不执行 Electron、模型或业务动作。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it, vi } from 'vitest'
import type { Message } from '../packages/shared/src/domain'
import { READING_LIMITS, type ConversationMessageItem, type ConversationMessagePage, type ConversationReadingState, type ConversationSearchPage, type ConversationSearchResult, type ConversationSearchTarget, type ConversationView } from '../packages/shared/src/domain/reading'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { mergeMessagePages, mergeReadingState, readConversationSearchPages, sameSearchTarget, searchExcerptParts, updateLiveMessage, visibleCompletions } from '../apps/electron/src/renderer/pages/conversations/reading-state'
import { useConversationReading } from '../apps/electron/src/renderer/pages/conversations/-components/use-conversation-reading'
import { readDetailMessages } from '../apps/electron/src/renderer/pages/conversations/detail-reading'

const readingEffects = vi.hoisted(() => [] as (() => (() => void) | undefined)[])
vi.mock('react', () => ({ useRef: (current: unknown) => ({ current }), useState: (value: unknown) => [value, () => {}], useCallback: (callback: unknown) => callback, useEffect: (effect: () => (() => void) | undefined) => readingEffects.push(effect) }))
vi.mock('../apps/electron/src/renderer/components/common', () => ({ errorText: (cause: unknown) => String(cause) }))

const message = (id: string, sequence: number, status: Message['status'] = 'completed'): Message => ({ id, sequence, status, conversationId: 'chat', senderType: 'agent', senderId: 'employee', senderName: '员工', content: '相同正文', createdAt: '2026-10-01T00:00:00Z' })
const item = (id: string, sequence: number, ordinal?: number): ConversationMessageItem => ({ messageId: id, sequence, status: 'available', message: message(id, sequence), ...(ordinal ? { completion: { messageId: id, epoch: 1, ordinal, contentHash: 'a'.repeat(64) } } : {}) })
const page = (...items: ConversationMessageItem[]): ConversationMessagePage => ({ conversationId: 'chat', items })
const state: ConversationReadingState = { id: 'chat', conversationId: 'chat', userId: 'user', epoch: 1, revision: 0, boundary: 0, sparseSeen: [], completionCount: 2, unreadCount: 2, legacyCompletedUnknown: true, firstUnreadMessageId: 'b', anchor: null }

describe('explicit reading reconciliation and later interaction', () => {
  it.each([[-0.9375, 0], [18.3125, 18], [READING_LIMITS.anchorOffset + 0.3125, READING_LIMITS.anchorOffset]])('preserves visual offset %s across page locations while persisting only bounded integer %s', async (offset, persisted) => {
    vi.useFakeTimers(); readingEffects.length = 0
    let rowTop = 100 - offset
    const root = Object.assign(new EventTarget(), { clientHeight: 100, scrollHeight: 300, scrollTop: 20, getBoundingClientRect: () => ({ top: 100, bottom: 200 }), querySelectorAll: () => [{ dataset: { readingMessageId: 'original' }, getBoundingClientRect: () => ({ top: rowTop, bottom: 160 }) }] })
    const view = { conversation: { id: 'chat' }, messagePage: page(item('original', 1)), reading: state } as ConversationView
    const onLocation = vi.fn(), request = vi.fn(async () => ({ ...state, anchor: { messageId: 'original', offset: persisted, revision: 1 } }))
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: () => true }))
    const cleanup: (() => void)[] = []
    try {
      useConversationReading({ api: { request } as unknown as DesktopApi, active: true, view, root: { current: root } as unknown as import('react').RefObject<HTMLDivElement>, following: { current: false }, onLocation, onReading: next => { view.reading = mergeReadingState(view.reading, next) } })
      for (const effect of readingEffects) { const done = effect(); if (done) cleanup.push(done) }
      root.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(600)
      expect(onLocation).toHaveBeenLastCalledWith('original', false, offset)
      expect(request).toHaveBeenCalledExactlyOnceWith('saveConversationAnchor', { conversationId: 'chat', epoch: 1, expectedAnchorRevision: 0, messageId: 'original', offset: persisted })
      // A layout shift within the same durable pixel keeps the precise page position without rewriting reading state.
      rowTop -= 0.0625
      root.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(600)
      expect(onLocation).toHaveBeenLastCalledWith('original', false, offset + 0.0625)
      expect(request).toHaveBeenCalledTimes(1)
      expect(view.reading.anchor).toEqual({ messageId: 'original', offset: persisted, revision: 1 })
    } finally { for (const done of cleanup) done(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() }
  })
  it('keeps a historical bottom anchored until the message window confirms latest following', async () => {
    vi.useFakeTimers(); readingEffects.length = 0
    const root = Object.assign(new EventTarget(), { clientHeight: 100, scrollHeight: 300, scrollTop: 200, getBoundingClientRect: () => ({ top: 100, bottom: 200 }), querySelectorAll: () => [{ dataset: { readingMessageId: 'old' }, getBoundingClientRect: () => ({ top: 80, bottom: 160 }) }] })
    const following = { current: false }, onLocation = vi.fn()
    const view = { conversation: { id: 'chat' }, messagePage: page(item('old', 1)), reading: { ...state, anchor: { messageId: 'old', offset: 20, revision: 1 } } } as ConversationView
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: () => true }))
    const cleanup: (() => void)[] = []
    try {
      useConversationReading({ api: { request: vi.fn() } as unknown as DesktopApi, active: true, view, root: { current: root } as unknown as import('react').RefObject<HTMLDivElement>, following, onLocation, onReading: () => {} })
      for (const effect of readingEffects) { const done = effect(); if (done) cleanup.push(done) }
      root.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(600)
      expect(onLocation).toHaveBeenLastCalledWith('old', false, 20)
      following.current = true
      root.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(600)
      expect(onLocation).toHaveBeenLastCalledWith('old', true, 20)
    } finally { for (const done of cleanup) done(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() }
  })
  it.each(['observeConversationReading', 'saveConversationAnchor'] as const)('does not replay a failed %s and permits a fresh capture only after check and scrolling', async method => {
    vi.useFakeTimers(); readingEffects.length = 0
    const root = Object.assign(new EventTarget(), { clientHeight: 100, scrollHeight: 300, scrollTop: 20, getBoundingClientRect: () => ({ top: 100, bottom: 200 }), querySelectorAll: () => [{ dataset: { readingMessageId: 'b' }, getBoundingClientRect: () => ({ top: 80, bottom: 160 }) }] })
    const observing = method === 'observeConversationReading'
    const initial = { ...state, anchor: observing ? { messageId: 'b', offset: 20, revision: 1 } : null }
    const confirmed = observing ? { ...initial, revision: 1, sparseSeen: [2], unreadCount: 1 } : { ...initial, anchor: { messageId: 'other', offset: 0, revision: 1 } }
    const view = { conversation: { id: 'chat' }, messagePage: page(item('b', 2, observing ? 1 : undefined)), reading: initial } as ConversationView
    let writes = 0
    const request = vi.fn(async (name: string, _input: unknown) => {
      if (name === 'getConversationReading') return confirmed
      if (name !== method) throw new Error(`意外写入 ${name}`)
      if (++writes === 1) throw new Error('原写入未确认')
      return observing ? { ...confirmed, revision: 2, boundary: 2, sparseSeen: [], unreadCount: 0 } : { ...confirmed, anchor: { messageId: 'b', offset: 20, revision: 2 } }
    })
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: () => true }))
    const cleanup: (() => void)[] = []
    try {
      const reading = useConversationReading({ api: { request } as unknown as DesktopApi, active: true, view, root: { current: root } as unknown as import('react').RefObject<HTMLDivElement>, onLocation: () => {}, onReading: next => { view.reading = mergeReadingState(view.reading, next) } })
      for (const effect of readingEffects) { const done = effect(); if (done) cleanup.push(done) }
      root.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(600)
      expect(writes).toBe(1); expect(view.reading).toMatchObject(confirmed)
      root.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(600)
      expect(writes).toBe(1)
      await reading.check(); await vi.advanceTimersByTimeAsync(600)
      expect(writes).toBe(1)
      root.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(600)
      expect(writes).toBe(2)
      expect(request.mock.calls.filter(([name]) => name === method).at(-1)?.[1]).toMatchObject(observing ? { expectedRevision: 1, completions: [{ messageId: 'b', ordinal: 1, epoch: 1 }] } : { expectedAnchorRevision: 1, messageId: 'b', offset: 20 })
    } finally { for (const done of cleanup) done(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() }
  })
})

describe('visible completed reading identity', () => {
  it('observes the actually visible completion without crossing the unseen earlier completion', () => {
    const result = visibleCompletions(page(item('a', 1, 2), item('b', 2, 1)), state, new Set(['a']), true, true, true)
    expect(result).toEqual([{ messageId: 'a', epoch: 1, ordinal: 2, contentHash: 'a'.repeat(64) }])
    expect(state.boundary).toBe(0); expect(state.firstUnreadMessageId).toBe('b')
  })
  it('does not use streaming status, sequence, legacy completion or unavailable rows as completion proof', () => {
    const streaming = item('stream', 1, 1); streaming.message = message('stream', 1, 'streaming')
    expect(visibleCompletions(page(streaming, item('legacy', 2), { messageId: 'removed', sequence: 3, status: 'unavailable', completion: { messageId: 'removed', ordinal: 2, epoch: 1, contentHash: 'a'.repeat(64) } }), state, new Set(['stream', 'legacy', 'removed']), true, true, true)).toEqual([])
  })
  it.each([[false, true, true], [true, false, true], [true, true, false]])('requires active page, visible document and focused window (%s/%s/%s)', (active, visible, focused) => {
    expect(visibleCompletions(page(item('b', 2, 1)), state, new Set(['b']), active, visible, focused)).toEqual([])
  })
  it('does not count repeated completed events again or accept another cleanup epoch', () => {
    expect(visibleCompletions(page(item('a', 1, 2), item('b', 2, 1)), { ...state, sparseSeen: [2] }, new Set(['a', 'b']), true, true, true).map(value => value.messageId)).toEqual(['b'])
    expect(visibleCompletions(page(item('b', 2, 1)), { ...state, boundary: 1 }, new Set(['b']), true, true, true)).toEqual([])
    expect(visibleCompletions(page(item('b', 2, 1)), { ...state, epoch: 2 }, new Set(['b']), true, true, true)).toEqual([])
  })
  it('a new stream/final event cannot inherit a completion hash captured for different content', () => {
    const original = page(item('b', 2, 1))
    expect(updateLiveMessage(original, message('b', 2), false).items[0].completion).toEqual(original.items[0].completion)
    for (const changed of [{ ...message('b', 2), content: '新正文' }, message('b', 2, 'streaming'), { ...message('b', 2), materialIds: ['new-private-source'] }]) expect(updateLiveMessage(original, changed, false).items[0].completion).toBeUndefined()
    expect(visibleCompletions(updateLiveMessage(original, { ...message('b', 2), content: '新正文' }, false), state, new Set(['b']), true, true, true)).toEqual([])
  })
  it('keeps a historical view fixed and does not expose unavailable content through live events', () => {
    const original = page(item('old', 1), { messageId: 'removed', sequence: 2, status: 'unavailable', reason: '来源已失效' })
    expect(updateLiveMessage(original, message('new', 100), false)).toBe(original)
    expect(updateLiveMessage(original, message('removed', 2), true)).toBe(original)
    expect(updateLiveMessage(original, message('new', 100), true).items.map(value => value.messageId)).toEqual(['old', 'removed', 'new'])
  })
})

describe('independent personal revisions and bounded history', () => {
  it('preserves a newer anchor when a reading response returns an older anchor', () => {
    const previous = { ...state, anchor: { messageId: 'old', offset: 12, revision: 4 } }
    const read = { ...state, revision: 1, sparseSeen: [2], unreadCount: 1, anchor: { messageId: 'other', offset: 0, revision: 3 } }
    expect(mergeReadingState(previous, read)).toMatchObject({ revision: 1, sparseSeen: [2], anchor: previous.anchor, unreadCount: 1, legacyCompletedUnknown: true })
  })
  it('preserves newer reading and new completion count when an anchor response has old read fields', () => {
    const previous = { ...state, revision: 2, boundary: 2, completionCount: 3, unreadCount: 1, firstUnreadMessageId: 'third' }
    expect(mergeReadingState(previous, { ...state, anchor: { messageId: 'b', offset: 20, revision: 1 } })).toMatchObject({ revision: 2, boundary: 2, completionCount: 3, unreadCount: 1, firstUnreadMessageId: 'third', anchor: { messageId: 'b', offset: 20, revision: 1 } })
    expect(mergeReadingState({ ...state, completionCount: 3, unreadCount: 3 }, state).completionCount).toBe(3)
    expect(mergeReadingState(previous, { ...state, epoch: 2, completionCount: 0, unreadCount: 0, legacyCompletedUnknown: false })).toMatchObject({ epoch: 2, boundary: 0, legacyCompletedUnknown: false })
    expect(mergeReadingState({ ...state, epoch: 2 }, state).epoch).toBe(2)
  })
  it('retains different IDs with identical content and bounds the page in the requested direction', () => {
    const previous = page(...Array.from({ length: 80 }, (_, index) => item(`m${index + 40}`, index + 40)))
    const older = mergeMessagePages(previous, page(...Array.from({ length: 40 }, (_, index) => item(`m${index}`, index))), 'before')
    expect(older.items).toHaveLength(80); expect(older.items[0].messageId).toBe('m0'); expect(older.items.at(-1)?.messageId).toBe('m79')
    const newer = mergeMessagePages(older, previous, 'after'); expect(newer.items).toHaveLength(80); expect(newer.items[0].messageId).toBe('m40')
    expect(() => mergeMessagePages(previous, { ...older, conversationId: 'other' }, 'before')).toThrow('不同会话')
  })
})

describe('search fixed query and source target', () => {
  it('opens only the original conversation and never aliases an equal ID in another result kind', () => {
    const target = { kind: 'conversation' as const, conversationId: 'chat' }
    expect(sameSearchTarget(target, { ...target })).toBe(true)
    expect(sameSearchTarget(target, { ...target, conversationId: 'other' })).toBe(false)
    expect(sameSearchTarget(target, { kind: 'message', conversationId: 'chat', messageId: 'chat' })).toBe(false)
  })
  const query = { keyword: '报告', scope: 'all' as const }, cursor = { time: '2026-10-01', id: 'one', kind: 'message' as const, queryKey: 'query' }
  const result = (id: string): ConversationSearchResult => ({ id, kind: 'message', conversationId: 'chat', conversationTitle: '原聊天', time: '2026-10-01', excerpt: '相同报告', status: 'available', target: { kind: 'message', conversationId: 'chat', messageId: id } })
  it('loads actual returned cursors without merging equal excerpts or losing source kinds', async () => {
    const seen: unknown[] = []
    const loaded = await readConversationSearchPages(query, 2, () => true, async input => { seen.push(input.before); return input.before ? { queryKey: 'query', results: [result('two'), { ...result('one'), kind: 'material', target: { kind: 'material', conversationId: 'chat', materialId: 'one', revision: 1 } }] } : { queryKey: 'query', results: [result('one')], nextCursor: cursor } })
    expect(seen).toEqual([undefined, cursor]); expect(loaded?.results.map(value => `${value.kind}:${value.id}`)).toEqual(['message:one', 'message:two', 'material:one'])
  })
  it('drops hidden/changed query responses, rejects stale cursors and enforces a bounded search', async () => {
    let active = true, calls = 0
    const load = async (): Promise<ConversationSearchPage> => { calls++; active = false; return { queryKey: 'query', results: [result('one')], nextCursor: cursor } }
    expect(await readConversationSearchPages(query, 3, () => active, load)).toBeUndefined(); expect(calls).toBe(1)
    await expect(readConversationSearchPages(query, 3, () => true, async () => ({ queryKey: 'query', results: [], nextCursor: cursor }))).rejects.toThrow('游标未前进')
    await expect(readConversationSearchPages(query, 11, () => true, load)).rejects.toThrow('上限')
    let pageIndex = 0
    await expect(readConversationSearchPages(query, 2, () => true, async () => ({ queryKey: pageIndex++ ? 'new-query' : 'query', results: [], nextCursor: cursor }))).rejects.toThrow('条件已变化')
  })
  it('preserves the latest bounded coverage receipt and refuses pages from a changed body index', async () => {
    const coverage = { total: 5, indexed: 2, pending: 1, failed: 1, skipped: 1, indexRevision: 3, batchProcessed: 2, hasMore: true, failures: [{ kind: 'artifact' as const, id: 'failed', name: '原件.md', reason: '原件已经改变' }] }
    const loaded = await readConversationSearchPages(query, 2, () => true, async input => ({ queryKey: 'query', results: [result(input.before ? 'two' : 'one')], coverage: { ...coverage, batchProcessed: input.before ? 0 : 2 }, nextCursor: input.before ? undefined : cursor }))
    expect(loaded?.coverage).toEqual({ ...coverage, batchProcessed: 0 })
    let calls = 0
    await expect(readConversationSearchPages(query, 2, () => true, async () => ({ queryKey: 'query', results: [], nextCursor: cursor, coverage: { ...coverage, indexRevision: calls++ ? 4 : 3 } }))).rejects.toThrow('索引已更新')
  })
  it('highlights Chinese and English literal words without hiding unmatched original source characters', () => {
    const text = '苹果浏览器支持 Browser，来源仍按原件核对。'
    const parts = searchExcerptParts(text, '  浏览器   browser 浏览器  ')
    expect(parts.filter(part => part.matched).map(part => part.text)).toEqual(['浏览器', 'Browser'])
    expect(parts.map(part => part.text).join('')).toBe(text)
    expect(searchExcerptParts('浏览器浏览器', '浏览器 浏览')).toEqual([{ text: '浏览器浏览器', matched: true }])
    expect(searchExcerptParts(text, '没有出现的词')).toEqual([{ text, matched: false }])
    expect(searchExcerptParts(text, '')).toEqual([{ text, matched: false }])
  })
  it('requires the original ID and exact file version/hash instead of a same-name latest file', () => {
    const target: ConversationSearchTarget = { kind: 'artifact', conversationId: 'chat', artifactId: 'v1', logicalArtifactId: 'report', contentVersion: 1, contentHash: 'a' }
    expect(sameSearchTarget(target, { ...target })).toBe(true)
    for (const changed of [{ ...target, artifactId: 'v2' }, { ...target, contentVersion: 2 }, { ...target, contentHash: 'b' }, { ...target, conversationId: 'other' }]) expect(sameSearchTarget(target, changed)).toBe(false)
    expect(sameSearchTarget({ kind: 'material', conversationId: 'chat', materialId: 'same', revision: 1, contentHash: 'a' }, { kind: 'material', conversationId: 'chat', materialId: 'same', revision: 2, contentHash: 'a' })).toBe(false)
    expect(sameSearchTarget({ kind: 'message', conversationId: 'chat', messageId: 'one' }, { kind: 'message', conversationId: 'chat', messageId: 'two' })).toBe(false)
  })
})

describe('personal details only read explicit source messages', () => {
  it('keeps same-body old result identities and limits each request and parallel batch', async () => {
    const requests: { method: string; input: { conversationId: string; aroundMessageId: string; limit: number } }[] = []
    let active = 0, peak = 0
    const api = { request: async (method: string, input: typeof requests[number]['input']) => {
      requests.push({ method, input }); active++; peak = Math.max(peak, active)
      await Promise.resolve(); active--
      return page(item(input.aroundMessageId, Number(input.aroundMessageId.slice(1))))
    } } as unknown as Pick<DesktopApi, 'request'>
    const ids = Array.from({ length: 9 }, (_, index) => `m${index}`)
    const result = await readDetailMessages(api, 'chat', [...ids, ids[0]], () => true)
    expect(result.map(value => value.messageId)).toEqual(ids)
    expect(peak).toBe(4); expect(requests).toHaveLength(9)
    expect(requests.every(value => value.method === 'listConversationMessages' && value.input.limit === 1 && value.input.conversationId === 'chat')).toBe(true)
  })
  it('does not start hidden requests or continue a batch after a tab becomes stale', async () => {
    let calls = 0, current = true
    const api = { request: async (_method: string, input: { aroundMessageId: string }) => { calls++; current = false; return page(item(input.aroundMessageId, 1)) } } as unknown as Pick<DesktopApi, 'request'>
    expect(await readDetailMessages(api, 'chat', ['hidden'], () => false)).toEqual([]); expect(calls).toBe(0)
    expect(await readDetailMessages(api, 'chat', ['a', 'b', 'c', 'd', 'e'], () => current)).toEqual([]); expect(calls).toBe(4)
  })
  it('drops foreign or missing identities and preserves source failure without cached body', async () => {
    const api = { request: async (_method: string, input: { aroundMessageId: string }) => input.aroundMessageId === 'revoked'
      ? page({ messageId: 'revoked', sequence: 1, status: 'unavailable', reason: '来源已撤权' })
      : page(item('FOREIGN_PRIVATE_CANARY', 1)) } as unknown as Pick<DesktopApi, 'request'>
    const result = await readDetailMessages(api, 'chat', ['old', 'revoked'], () => true)
    expect(result.every(value => value.status === 'unavailable' && !value.message)).toBe(true)
    expect(result[1].reason).toBe('来源已撤权'); expect(JSON.stringify(result)).not.toContain('FOREIGN_PRIVATE_CANARY')
  })
})
