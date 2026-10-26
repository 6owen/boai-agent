// @vitest-environment jsdom
/*
 * [INPUT]: 生产MaterialMarkdown、固定资源引用和共用快捷命令目录。
 * [OUTPUT]: 用户消息还原技能/数据源/文件及命令行内标签，中文相邻/旧@引用/名称匹配与Markdown保持；字面未绑定资源、代码/链接/路径不误标，标签不触发操作。
 * [POS]: 消息展示组件回归，不运行Electron或E2E。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ConversationDetail, Message } from '../packages/shared/src/domain'
import type { ComposerReference } from '../packages/shared/src/domain/composer-references'
import { MaterialMarkdown } from '../apps/electron/src/renderer/pages/conversations/-components/material-citations'

let root: Root, host: HTMLDivElement
const skill: ComposerReference = { kind: 'skill', id: 'travel-id', agentId: 'bobo', name: 'boai-travel', configVersion: 1 }
const source: ComposerReference = { kind: 'source', id: 'source-id', agentId: 'bobo', name: '业务资料库', revision: 2 }
const file: ComposerReference = { kind: 'material', id: 'file-id', agentId: 'bobo', name: 'notes(1).md', conversationId: 'room', revision: 1, contentHash: 'a'.repeat(64) }
const detail = { conversation: { id: 'room', agentIds: ['bobo'] }, materials: [] } as unknown as ConversationDetail
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function render(content: string, composerReferences: ComposerReference[] = [skill], senderType: Message['senderType'] = 'user') {
  const message: Message = { id: 'message', conversationId: 'room', senderType, senderId: 'user', senderName: '我', sequence: 1, status: 'completed', createdAt: '', content, composerReferences }
  await act(async () => root.render(h(MaterialMarkdown, { message, detail, onPreview: vi.fn() })))
  return message
}
const tags = () => [...host.querySelectorAll<HTMLElement>('.message-reference-tag')]

it('restores a selected skill in place beside Chinese text without changing the message body', async () => {
  const message = await render('$boai-travel这个是什么技能？')
  expect(tags().map(tag => tag.textContent)).toEqual(['$boai-travel'])
  expect(tags()[0].dataset.referenceKind).toBe('skill')
  expect(tags()[0].dataset.referenceId).toBe('travel-id')
  expect(tags()[0].classList.contains('soft-button-secondary')).toBe(true)
  expect(host.textContent).toBe(message.content)
  expect(host.querySelector('button')).toBeNull()
})

it('shows sources and both kinds of files with their original identities and supports old @ resource labels', async () => {
  const artifact: ComposerReference = { kind: 'artifact', id: 'artifact-id', agentId: 'bobo', name: 'report.txt', conversationId: 'room', contentHash: 'b'.repeat(64) }
  const message = await render('请对照$业务资料库，读取$notes(1).md与@report.txt。', [source, file, artifact])
  expect(tags().map(tag => [tag.textContent, tag.dataset.referenceKind, tag.dataset.referenceId])).toEqual([
    ['$业务资料库', 'source', 'source-id'], ['$notes(1).md', 'material', 'file-id'], ['@report.txt', 'artifact', 'artifact-id'],
  ])
  expect(host.textContent).toBe(message.content)
})

it('matches complete resource names and shared commands without marking ordinary paths, URLs or unknown resources', async () => {
  const shorter: ComposerReference = { ...skill, id: 'short', name: 'boai' }
  await render('$boai-travel $boai $boai-traveler $unknown /summarize /todo /files /workspace /tmp /todo-list /todo.json /todo/child https://example.com/todo', [shorter, skill])
  expect(tags().map(tag => tag.textContent)).toEqual(['$boai-travel', '$boai', '/summarize', '/todo', '/files', '/workspace'])
})

it('keeps Markdown formatting, code and link labels intact and leaves employee replies as ordinary text', async () => {
  await render('**$boai-travel**与`$boai-travel /todo`，[$boai-travel /todo](https://example.com)。')
  expect(host.querySelector('strong .message-reference-tag')?.textContent).toBe('$boai-travel')
  expect(host.querySelector('code')?.textContent).toBe('$boai-travel /todo')
  expect(host.querySelector('code .message-reference-tag')).toBeNull()
  expect(host.querySelector('a .message-reference-tag')).toBeNull()
  expect(host.querySelector('a')?.textContent).toBe('$boai-travel /todo')
  await render('$boai-travel /todo', [skill], 'agent')
  expect(tags()).toHaveLength(0)
})
