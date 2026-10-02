/*
 * [INPUT]: 当前真实成员配置与不同会话/员工/关闭状态的浏览器只读窗口。
 * [OUTPUT]: 固定员工身份与当前窗口范围；Mastra新员工/旧false/缺值/bobo默认可开空白，停用和ACP不支持，不以旧开关决定入口。
 * [POS]: HeaderBrowser 归属与配置意图验证；真实点击/原生空白窗口/零模型与 Work 由 Electron BDD 验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, test } from 'vitest'
import type { Conversation, DigitalAgent } from '../src/shared/domain'
import type { BrowserWindowState } from '../src/shared/ipc/browser'
import { browserMembers, browserUnavailable, scopedBrowserWindows } from '../src/renderer/components/app-shell/header-browser'

const agent = (id: string, patch: Partial<DigitalAgent> = {}) => ({ id, name: '同名员工', active: true, allowBrowser: true, ...patch } as DigitalAgent)
const conversation = (patch: Partial<Conversation> = {}) => ({ id: 'current', agentIds: ['original', 'bobo'], ...patch } as Conversation)
const state = (patch: Partial<BrowserWindowState> = {}) => ({ agentId: 'original', conversationId: 'current', control: 'user-controlled', ...patch } as BrowserWindowState)

test('membership uses stable employee IDs and includes the existing core identity without creating substitutes', () => {
  expect(browserMembers(conversation(), [agent('same-name-replacement'), agent('bobo')]).map(value => value.id)).toEqual(['bobo'])
  expect(browserMembers(conversation(), [agent('original'), agent('unrelated'), agent('bobo')]).map(value => value.id)).toEqual(['original', 'bobo'])
})
test('no saved conversation or hidden configuration cannot expose a browser entry for contacts', () => {
  expect(browserMembers(undefined, [agent('original')])).toEqual([])
  expect(browserMembers(conversation({ list: { hidden: true } }), [agent('original')])).toEqual([])
})
test('foreign conversation windows, removed members and fully closed windows cannot be shown as current windows', () => {
  const members = browserMembers(conversation(), [agent('original')]), current = state()
  expect(scopedBrowserWindows(conversation(), members, [state({ conversationId: 'other' }), state({ agentId: 'removed' }), state({ control: 'closed' }), current])).toEqual([current])
  expect(scopedBrowserWindows(undefined, [], [current])).toEqual([])
})
test('active Mastra employees and bobo are available with new, missing and legacy false browser fields', () => {
  for (const value of [agent('new', { allowBrowser: undefined, executionBackend: { kind: 'mastra-model' } }), agent('legacy', { allowBrowser: undefined }), agent('off', { allowBrowser: false }), agent('bobo', { allowBrowser: false, systemRole: 'core' })]) expect(browserUnavailable(value)).toBe('')
  expect(browserUnavailable(agent('stopped', { active: false }))).toContain('停用')
})
test('external ACP backend is not granted a browser merely because an old configuration carries allowBrowser', () => {
  expect(browserUnavailable(agent('external', { executionBackend: { kind: 'acp-local', profileId: 'external' } }))).toContain('ACP')
})
