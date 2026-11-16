// @vitest-environment jsdom
/*
 * [INPUT]: Real ConversationAvatar, browser visibility/media events and an isolated player double.
 * [OUTPUT]: Host input forwarding, pause/resume, subscription cleanup and unsupported preset coverage.
 * [POS]: React integration regression; WebGL rendering belongs to the independent package browser checks.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DigitalAgent } from '../packages/shared/src/domain'
import { ConversationAvatar } from '../apps/electron/src/renderer/pages/conversations/-components/conversation-avatar'

const players = vi.hoisted(() => [] as Array<{ setInput: ReturnType<typeof vi.fn>; setActive: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>)
vi.mock('@6owen/avatar-motion', () => ({
  characters: { ox: {}, tiger: {}, rabbit: {} },
  AvatarPlayer: class {
    setInput = vi.fn()
    setActive = vi.fn()
    resize = vi.fn()
    dispose = vi.fn()
    constructor() { players.push(this) }
  },
}))
let host: HTMLDivElement, root: Root
let reduced: EventTarget & { matches: boolean }
let hidden = false
const disconnect = vi.fn()
const employee = { id: 'avatar-test', name: '小牛', avatar: { kind: 'preset', id: 'fox' } } as DigitalAgent

beforeEach(() => {
  players.length = 0; hidden = false; disconnect.mockClear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  reduced = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', vi.fn(() => reduced))
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks()
})

it('forwards conversation inputs, pauses hidden/reduced-motion players and releases subscriptions on unmount', async () => {
  const removeMedia = vi.spyOn(reduced, 'removeEventListener')
  const removeDocument = vi.spyOn(document, 'removeEventListener')
  await act(async () => root.render(h(ConversationAvatar, { employee, active: true, input: { state: 'thinking', activity: 'working' } })))
  await vi.waitFor(() => expect(players).toHaveLength(1))
  const player = players[0]!
  expect(player.setInput).toHaveBeenLastCalledWith({ state: 'thinking', activity: 'working' })
  expect(player.setActive).toHaveBeenLastCalledWith(true)
  hidden = true; document.dispatchEvent(new Event('visibilitychange'))
  expect(player.setActive).toHaveBeenLastCalledWith(false)
  hidden = false; document.dispatchEvent(new Event('visibilitychange'))
  expect(player.setActive).toHaveBeenLastCalledWith(true)
  reduced.matches = true; reduced.dispatchEvent(new Event('change'))
  expect(player.setActive).toHaveBeenLastCalledWith(false)
  reduced.matches = false; reduced.dispatchEvent(new Event('change'))
  expect(player.setActive).toHaveBeenLastCalledWith(true)
  await act(async () => root.render(h(ConversationAvatar, { employee, active: false, input: { state: 'speaking', voice: 0.6 } })))
  expect(player.dispose).toHaveBeenCalledTimes(1)
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(removeMedia).toHaveBeenCalledWith('change', expect.any(Function))
  expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  document.dispatchEvent(new Event('visibilitychange')); reduced.dispatchEvent(new Event('change'))
  expect(player.dispose).toHaveBeenCalledTimes(1)
})

it('updates a mounted player without creating another renderer', async () => {
  await act(async () => root.render(h(ConversationAvatar, { employee, active: true, input: { state: 'idle' } })))
  await vi.waitFor(() => expect(players).toHaveLength(1))
  await act(async () => root.render(h(ConversationAvatar, { employee, active: true, input: { state: 'speaking', voice: 0.6 } })))
  expect(players).toHaveLength(1)
  expect(players[0]!.setInput).toHaveBeenLastCalledWith({ state: 'speaking', voice: 0.6 })
})

it('keeps unsupported presets outside the animation host', async () => {
  await act(async () => root.render(h(ConversationAvatar, { employee: { ...employee, avatar: { kind: 'preset', id: 'owl' } }, active: true, input: { state: 'idle' } })))
  expect(host.querySelector('canvas')).toBeNull()
  expect(players).toHaveLength(0)
})
