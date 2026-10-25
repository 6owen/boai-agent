// @vitest-environment jsdom
/*
 * [INPUT]: Real Markdown/reference Popover and controlled desktop read receipts.
 * [OUTPUT]: Canonical links use scoped reads on click, never arbitrary schemes; changes discard displayed content.
 * [POS]: Local component contract, no Electron/browser E2E.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MaterialMarkdown } from '../apps/electron/src/renderer/pages/conversations/-components/material-citations'
import type { ConversationDetail, Message } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); Reflect.deleteProperty(window, 'boai'); vi.restoreAllMocks() })
it('opens a scoped original body only on click and drops it when the source changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let changed!: Parameters<DesktopApi['subscribe']>[0]
  const request = vi.fn().mockResolvedValue({ status: 'succeeded', data: { card: { title: '原句', kind: 'message', revision: 'r1', summary: '片段' }, body: '实际原文' } })
  window.boai = { request, subscribe: (callback: Parameters<DesktopApi['subscribe']>[0]) => { changed = callback; return () => {} } } as unknown as DesktopApi
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  cleanup.push(async () => { await act(async () => root.unmount()); host.remove() })
  const message = { id: 'reply', senderType: 'agent', senderId: 'bobo', status: 'completed', content: '[原句](boai://ref/message/m1) [非法](boai://provider/import) [路径](file:///etc/passwd)' } as Message
  await act(async () => root.render(h(MaterialMarkdown, { message, detail: { conversation: { id: 'room', agentIds: ['bobo'] }, materials: [] } as unknown as ConversationDetail, onPreview: vi.fn() })))
  expect(request).not.toHaveBeenCalled(); expect(host.querySelectorAll('button')).toHaveLength(1); expect(host.querySelectorAll('a')).toHaveLength(0)
  await act(async () => host.querySelector('button')!.click())
  expect(request).toHaveBeenCalledWith('executeApplicationOperation', { operation: 'refs.resolve', input: { agentId: 'bobo', conversationId: 'room', uri: 'boai://ref/message/m1', full: true, limit: 6000, offset: 0 } })
  expect(document.body.textContent).toContain('实际原文')
  await act(async () => changed({ type: 'changed' }))
  expect(document.body.textContent).not.toContain('实际原文')
})
