/*
 * [INPUT]: ACP 未知提交的原请求、跨重启快照与普通未发送草稿。
 * [OUTPUT]: 重启只保留原身份及原文并置unknown，不恢复普通草稿或未知字段，核对后移除记录。
 * [POS]: 外部任务发送持久边界模块回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { externalTaskRequests, restoreExternalTaskDrafts } from '../src/renderer/pages/conversations/external-task-state'
import type { ChatDraft } from '../src/renderer/pages/conversations/presentation'
describe('external task pending identity', () => {
  it('keeps the original accepted-but-unknown payload across restart, excluding later draft edits', () => {
    const drafts = new Map<string, ChatDraft>([['chat', { text: '后来的编辑', mentionIds: [], submission: { kind: 'external', requestId: 'original', status: 'pending', fingerprint: 'frozen', input: { content: '原外部任务', mentionIds: [] } } }], ['unsent', { text: '未发送普通草稿', mentionIds: [] }]])
    const restored = restoreExternalTaskDrafts(JSON.parse(JSON.stringify(externalTaskRequests(drafts))))
    expect([...restored.keys()]).toEqual(['chat'])
    expect(restored.get('chat')).toMatchObject({ text: '原外部任务', submission: { kind: 'external', requestId: 'original', status: 'unknown', input: { content: '原外部任务' } } })
    expect(externalTaskRequests(new Map())).toEqual({})
  })
  it('rejects corrupt entries and never imports arbitrary material or execution fields', () => {
    expect([...restoreExternalTaskDrafts({ broken: { requestId: 'r', content: '' }, good: { requestId: 'r', content: '确认任务', path: '/private', status: 'not_accepted' } }).values()]).toEqual([expect.objectContaining({ submission: expect.objectContaining({ status: 'unknown', input: { content: '确认任务', mentionIds: [] } }) })])
  })
})
