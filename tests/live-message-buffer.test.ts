/*
 * [INPUT]: 生产聊天读取缓冲、连续消息与读取交错。
 * [OUTPUT]: 已结束读取和背景会话不保留正文；迟到旧读取不清除当前增量。
 * [POS]: 长时常驻聊天的内存所有权回归，不调用模型。
 * [PROTOCOL]: 修改时同步Header与tests/.folder.md。
 */
import { expect, test } from 'vitest'
import type { Message } from '../src/shared/domain'
import { LiveMessageBuffer } from '../src/renderer/pages/conversations/live-message-buffer'

const message = (id: string, conversationId = 'chat', content = 'current') => ({ id, conversationId, content }) as Message

test('many completed reads release full bodies and idle events never become future history', () => {
  const buffer = new LiveMessageBuffer()
  for (let round = 0; round < 200; round++) {
    buffer.add(message(`idle-${round}`))
    const capture = buffer.begin('chat')
    expect(capture.messages.size).toBe(0)
    for (let index = 0; index < 80; index++) buffer.add(message(`${round}-${index}`, 'chat', 'text'.repeat(3000)))
    expect(capture.messages.size).toBe(80)
    buffer.finish(capture)
    expect(capture.messages.size).toBe(0)
  }
})

test('only current-conversation updates survive until the page read completes', () => {
  const buffer = new LiveMessageBuffer(), capture = buffer.begin('chat')
  buffer.add(message('one', 'chat', 'streaming'))
  buffer.add(message('one', 'chat', 'completed'))
  buffer.add(message('other', 'background'))
  expect([...capture.messages.values()]).toEqual([message('one', 'chat', 'completed')])
  buffer.clear('background')
  expect(capture.messages.size).toBe(1)
  buffer.clear('chat')
  expect(capture.messages.size).toBe(0)
})

test('replacement releases the old read immediately and its late finally cannot clear the new read', () => {
  const buffer = new LiveMessageBuffer(), old = buffer.begin('chat')
  buffer.add(message('old'))
  const next = buffer.begin('next')
  expect(old.messages.size).toBe(0)
  buffer.add(message('new', 'next'))
  buffer.finish(old)
  expect([...next.messages.values()]).toEqual([message('new', 'next')])
  buffer.clear()
  expect(next.messages.size).toBe(0)
})
