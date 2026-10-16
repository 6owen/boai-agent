// @vitest-environment jsdom
/*
 * [INPUT]: 持久目录回执、原聊天消息与生产结果组件。
 * [OUTPUT]: 创建/测试去重、不同轮次保持、历史回执合并、消息锚定与实际资源详情导航。
 * [POS]: 资源结果的协议/组件回归，不启动Electron。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { mergeCatalogResults, type CatalogResult } from '../src/shared/domain/catalog-management'
import type { ConversationDetail } from '../src/shared/domain'
import { CatalogResults, catalogResultsByMessage } from '../src/renderer/pages/conversations/-components/catalog-results'

const result = (overrides: Partial<CatalogResult> = {}): CatalogResult => ({ id: 'create', conversationId: 'chat', messageId: 'request-1', kind: 'source', targetId: 'source-1', action: 'create', createdAt: '2026-10-17T00:00:00.000Z', name: 'Notes', available: true, ...overrides })

it('merges creation and test for one resource and user turn, retaining separate turns and same-name resources', () => {
  const rows = mergeCatalogResults([result(), result({ id: 'test', action: 'test', createdAt: '2026-10-17T00:00:01.000Z' }), result({ id: 'different', targetId: 'source-2' }), result({ id: 'next-turn', messageId: 'request-2' })])
  expect(rows).toHaveLength(3)
  expect(rows[0].action).toBe('test')
  expect(mergeCatalogResults([result(), result({ id: 'delete', removed: true, available: false, action: 'delete' })])[0]).toMatchObject({ removed: true, available: false })
})

it('anchors results after their own reply, not after later unrelated chat', () => {
  const detail = { messages: [{ id: 'request-1', senderId: 'user', status: 'completed' }, { id: 'reply-1', senderId: 'bobo', status: 'completed', runId: 'run-1' }, { id: 'reply-2', senderId: 'bobo', status: 'completed', runId: 'run-2' }], runs: [{ id: 'run-1', triggerMessageId: 'request-1' }, { id: 'run-2', triggerMessageId: 'request-2' }] } as Pick<ConversationDetail, 'messages' | 'runs'>
  expect([...catalogResultsByMessage([result()], detail).keys()]).toEqual(['reply-1'])
  expect([...catalogResultsByMessage([result()], { messages: [], runs: [] }).keys()]).toEqual(['request-1'])
})

it('renders one compact employee message and opens the exact resource', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div'), root = createRoot(host), open = vi.fn()
  document.body.append(host)
  try {
    await act(async () => root.render(h(CatalogResults, { items: mergeCatalogResults([result(), result({ id: 'test', action: 'test' })]), onOpen: open })))
    expect(host.querySelectorAll('article.message-row.agent')).toHaveLength(1)
    expect(host.querySelector('.schedule-chat-plan')).toBeNull()
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(open).toHaveBeenCalledWith('source', 'source-1', 'Notes')
    await act(async () => root.render(h(CatalogResults, { items: [result({ removed: true, available: false })], onOpen: open })))
    expect(host.querySelector('button')?.disabled).toBe(true)
    expect(host.textContent).toContain('已删除')
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() }
})
