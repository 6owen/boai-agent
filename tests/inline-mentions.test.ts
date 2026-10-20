/*
 * [OUTPUT]: $资源/提示词与@员工身份隔离，提示词正文快照发送展开，混排/原子删除/撤销及旧@资源草稿保持。
 * [OUTPUT]: 资源标签保留固定身份及可见名称，原子删除/撤销不产生群成员路由。
 * [INPUT]: composer 草稿/发送投影及实际 ProseMirror 编辑模型。
 * [OUTPUT]: 标签身份隔离、真实节点的光标前后位置/原子删除/替换/撤销/重做，Unicode 和正文保护回归。
 * [POS]: Vitest 前端输入不变量；不启动 Electron。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { draftContent, draftMentions, draftResourceReferences, insertDraftMention, mentionRange, replaceDraftRange, updateDraftText } from '../src/renderer/pages/conversations/inline-mentions'
import type { ChatDraft } from '../src/renderer/pages/conversations/presentation'
import { getSchema } from '@tiptap/core'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { deleteSelection } from '@tiptap/pm/commands'
import { history, redo, undo } from '@tiptap/pm/history'
import { deleteMention, documentDraft, documentPosition, draftOffset, mentionDocument, mentionExtensions } from '../src/renderer/pages/conversations/mention-editor'

const draft = (text = ''): ChatDraft => ({ text, mentionIds: [] })
const writer = { id: 'writer', name: '写手' }

it('expands a selected prompt snapshot while routing only employee mentions and retaining fixed resource references', () => {
  const prompt = { id: 'saved-prompt', revision: 3, name: '总结', content: '先给结论。\n再列证据。' }
  const resource = { kind: 'skill' as const, id: 'skill-a', name: 'research', agentId: 'writer', configVersion: 3 }
  const value: ChatDraft = { text: '@写手 $总结 $research 请开始', mentionIds: ['writer'], mentions: [
    { id: 'writer', label: '写手', start: 0, end: 3 },
    { id: 'prompt:saved-prompt', label: '总结', start: 4, end: 7, prompt },
    { id: 'skill:skill-a', label: 'research', start: 8, end: 17, resource },
  ] }
  const schema = getSchema(mentionExtensions('tag'))
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(mentionDocument(value)), plugins: [history()] })
  expect(documentDraft(state.doc, value)).toEqual(value)
  expect(draftContent(value)).toBe('先给结论。\n再列证据。 $research 请开始')
  expect(draftResourceReferences(value)).toEqual([resource])
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, documentPosition(state.doc, 7))))
  deleteMention('backward')(state, transaction => { state = state.apply(transaction) })
  expect(draftContent(documentDraft(state.doc, value))).not.toContain(prompt.content)
  undo(state, transaction => { state = state.apply(transaction) })
  expect(draftContent(documentDraft(state.doc, value))).toContain(prompt.content)
  expect(documentDraft(state.doc, value).mentionIds).toEqual(['writer'])
  expect(draftContent({ text: '$总结', mentionIds: [] })).toBe('$总结')
})

describe('inline composer mentions', () => {
  it('replaces only the selected trigger, preserving surrounding text and member identity', () => {
    const next = insertDraftMention(draft('前文 @写 后文'), { start: 3, end: 5 }, writer)
    expect(next.draft.text).toBe('前文 @写手 后文')
    expect(next.draft.mentionIds).toEqual(['writer'])
    expect(draftContent(next.draft)).toBe('前文  后文')
    expect(next.caret).toBe(6)
  })

  it('backspace, delete and partial selections remove a whole tag and its binding', () => {
    const tagged = insertDraftMention(draft('正文'), { start: 0, end: 0 }, writer).draft
    for (const range of [mentionRange(draftMentions(tagged), { start: 3, end: 3 }, 'backward'), mentionRange(draftMentions(tagged), { start: 0, end: 0 }, 'forward'), mentionRange(draftMentions(tagged), { start: 1, end: 2 })]) {
      expect(range).toEqual({ start: 0, end: 3 })
      const next = replaceDraftRange(tagged, range, '')
      expect(next.text).toBe(' 正文')
      expect(next.mentionIds).toEqual([])
      expect(draftContent(next)).toBe('正文')
    }
  })

  it('ordinary edits move later tags without reinterpreting literal @ names', () => {
    const tagged = insertDraftMention(draft('看 '), { start: 2, end: 2 }, writer).draft
    const next = updateDraftText(tagged, '请看 @写手 ', { start: 0, end: 0 })
    expect(next.mentions).toEqual([{ id: 'writer', label: '写手', start: 3, end: 6 }])
    expect(draftContent(next)).toBe('请看')
    expect(updateDraftText(draft(), '@写手').mentionIds).toEqual([])
    expect(draftContent(draft('user@example.com @写手'))).toBe('user@example.com @写手')
  })

  it('does not confuse different members with identical names when one tag is deleted', () => {
    const first = insertDraftMention(draft(), { start: 0, end: 0 }, writer).draft
    const second = insertDraftMention(first, { start: first.text.length, end: first.text.length }, { id: 'another-writer', name: '写手' }).draft
    const next = updateDraftText(second, ' @写手 ', { start: 0, end: 3 })
    expect(next.mentionIds).toEqual(['another-writer'])
    expect(next.mentions?.[0].start).toBe(1)
  })

  it('keeps an identity until its final tag is deleted; select-all clears everything', () => {
    const first = insertDraftMention(draft(), { start: 0, end: 0 }, writer).draft
    const second = insertDraftMention(first, { start: first.text.length, end: first.text.length }, writer).draft
    expect(second.mentionIds).toEqual(['writer'])
    const next = replaceDraftRange(second, { start: 0, end: 3 }, '')
    expect(next.mentionIds).toEqual(['writer'])
    expect(updateDraftText(next, '', { start: 0, end: next.text.length }).mentionIds).toEqual([])
  })

  it('uses textarea UTF-16 offsets around emoji and preserves following commands', () => {
    const next = insertDraftMention(draft('🙂 @写 /todo'), { start: 3, end: 5 }, writer).draft
    const changed = replaceDraftRange(next, { start: 7, end: 12 }, '请整理待办')
    expect(changed.mentionIds).toEqual(['writer'])
    expect(changed.text).toBe('🙂 @写手 请整理待办')
    expect(draftContent(changed)).toBe('🙂  请整理待办')
  })

  it('invalidated labels never retain hidden routing, and mention-only drafts stay empty for sending', () => {
    const tagged = insertDraftMention(draft(), { start: 0, end: 0 }, writer).draft
    expect(draftContent(tagged)).toBe('')
    const next = updateDraftText(tagged, '@写 ')
    expect(next.mentionIds).toEqual([])
    expect(draftContent(next)).toBe('@写')
  })

  it('pasting plain text over a selected tag does not inherit its member identity', () => {
    const tagged = insertDraftMention(draft(), { start: 0, end: 0 }, writer).draft
    const next = updateDraftText(tagged, tagged.text, { start: 0, end: 3 })
    expect(next.text).toBe('@写手 ')
    expect(next.mentionIds).toEqual([])
    expect(draftContent(next)).toBe('@写手')
  })
})

describe('actual inline mention editor', () => {
  const schema = getSchema(mentionExtensions('soft-button soft-button-secondary'))
  const tagged: ChatDraft = { text: '@写手正文', mentionIds: ['writer'], mentions: [{ id: 'writer', label: '写手', start: 0, end: 3 }] }
  const stateFor = (value = tagged) => EditorState.create({ schema, doc: schema.nodeFromJSON(mentionDocument(value)), plugins: [history()] })

  it('has separate caret positions before and after a single atomic label', () => {
    const { doc } = stateFor()
    expect(doc.firstChild!.firstChild!.isAtom).toBe(true)
    expect(doc.firstChild!.firstChild!.nodeSize).toBe(1)
    expect(documentPosition(doc, 0)).toBe(1)
    expect(documentPosition(doc, 3)).toBe(2)
    expect(draftOffset(doc, 1)).toBe(0)
    expect(draftOffset(doc, 2)).toBe(3)
    expect(TextSelection.create(doc, 1).$from.nodeAfter!.type.name).toBe('mention')
    expect(TextSelection.create(doc, 2).$from.nodeBefore!.type.name).toBe('mention')
  })

  for (const direction of ['backward', 'forward'] as const) it(`deletes the whole tag with one ${direction} operation`, () => {
    let state = stateFor()
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, direction === 'backward' ? 2 : 1)))
    expect(deleteMention(direction)(state, transaction => { state = state.apply(transaction) })).toBe(true)
    expect(documentDraft(state.doc, tagged)).toMatchObject({ text: '正文', mentionIds: [], mentions: [] })
  })

  it('typing before a tag stays before it and shifts its draft range', () => {
    let state = stateFor()
    state = state.apply(state.tr.insertText('你好', 1))
    expect(documentDraft(state.doc, tagged)).toMatchObject({ text: '你好@写手正文', mentions: [{ id: 'writer', label: '写手', start: 2, end: 5 }] })
  })

  it('selected-tag deletion and replacement remove the old member binding', () => {
    let state = stateFor()
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 1)))
    expect(deleteSelection(state, transaction => { state = state.apply(transaction) })).toBe(true)
    expect(documentDraft(state.doc, tagged).mentionIds).toEqual([])
    state = stateFor()
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 1)).insertText('同事'))
    expect(documentDraft(state.doc, tagged)).toMatchObject({ text: '同事正文', mentionIds: [] })
  })

  it('undo and redo restore both the visible tag and its identity together', () => {
    let state = stateFor()
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))
    deleteMention('backward')(state, transaction => { state = state.apply(transaction) })
    expect(undo(state, transaction => { state = state.apply(transaction) })).toBe(true)
    expect(documentDraft(state.doc, tagged)).toEqual(tagged)
    expect(redo(state, transaction => { state = state.apply(transaction) })).toBe(true)
    expect(documentDraft(state.doc, tagged).mentionIds).toEqual([])
  })

  it('round-trips emoji, newlines and same-name members without mixing identities', () => {
    const value: ChatDraft = { text: '🙂@写手\n@写手 完成', mentionIds: ['a', 'b'], mentions: [{ id: 'a', label: '写手', start: 2, end: 5 }, { id: 'b', label: '写手', start: 6, end: 9 }] }
    const { doc } = stateFor(value)
    expect(documentDraft(doc, value)).toEqual(value)
    for (const offset of [0, 2, 5, 6, 9, 10, 12]) expect(draftOffset(doc, documentPosition(doc, offset))).toBe(offset)
  })
})


it('round-trips resource tags independently of group mentions and removes references on deletion', () => {
  const resource = { kind: 'skill' as const, id: 'skill-a', name: 'research', agentId: 'researcher', configVersion: 3 }
  const value: ChatDraft = { text: '@research 请分析', mentionIds: [], mentions: [{ id: 'skill:skill-a', label: 'research', start: 0, end: 9, resource }] }
  const schema = getSchema(mentionExtensions('tag'))
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(mentionDocument(value)), plugins: [history()] })
  expect(documentDraft(state.doc, value)).toEqual(value)
  expect(draftContent(value)).toBe('@research 请分析')
  expect(draftResourceReferences(value)).toEqual([resource])
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))
  deleteMention('backward')(state, transaction => { state = state.apply(transaction) })
  expect(draftResourceReferences(documentDraft(state.doc, value))).toEqual([])
  undo(state, transaction => { state = state.apply(transaction) })
  expect(draftResourceReferences(documentDraft(state.doc, value))).toEqual([resource])
  expect(documentDraft(state.doc, value).mentionIds).toEqual([])
})
