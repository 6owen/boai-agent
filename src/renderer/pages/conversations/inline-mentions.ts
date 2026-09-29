/*
 * [INPUT]: 会话草稿、已确认成员身份与原生输入的文本/选区。
 * [OUTPUT]: 正文内标签插入、原子选区、编辑范围迁移和发送正文；字面 @ 不推断成员，删除标签同步取消点名。
 * [POS]: composer 的纯文本/标签投影；不修改消息持久化或调度协议。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ChatDraft, DraftMention } from './presentation'

export interface TextRange { start: number; end: number }

export function draftMentions(draft: ChatDraft): DraftMention[] {
  let end = 0
  return [...(draft.mentions ?? [])].sort((a, b) => a.start - b.start).filter(mention => {
    if (mention.start < end || mention.end <= mention.start || draft.text.slice(mention.start, mention.end) !== `@${mention.label}` || !draft.mentionIds.includes(mention.id)) return false
    end = mention.end
    return true
  })
}

/** Expand intersecting selections so ordinary typing/cut/delete cannot leave half a tag. */
export function mentionRange(mentions: DraftMention[], range: TextRange, deletion?: 'backward' | 'forward'): TextRange {
  let { start, end } = range
  for (const mention of mentions) {
    if (start === end) {
      if (deletion === 'backward' && start > mention.start && start <= mention.end || deletion === 'forward' && start >= mention.start && start < mention.end) return { start: mention.start, end: mention.end }
      if (start > mention.start && start < mention.end) {
        const edge = start - mention.start < mention.end - start ? mention.start : mention.end
        return { start: edge, end: edge }
      }
    } else if (start < mention.end && end > mention.start) {
      start = Math.min(start, mention.start); end = Math.max(end, mention.end)
    }
  }
  return { start, end }
}

export function replaceDraftRange(draft: ChatDraft, range: TextRange, insertion: string): ChatDraft {
  const mentions = draftMentions(draft), { start, end } = mentionRange(mentions, range)
  const delta = insertion.length - (end - start)
  const next = mentions.flatMap(mention => mention.end <= start ? [mention] : mention.start >= end ? [{ ...mention, start: mention.start + delta, end: mention.end + delta }] : [])
  next.sort((a, b) => a.start - b.start)
  return { ...draft, text: draft.text.slice(0, start) + insertion + draft.text.slice(end), mentions: next, mentionIds: [...new Set(next.map(mention => mention.id))] }
}

export function insertDraftMention(draft: ChatDraft, selection: TextRange, member: { id: string; name: string }) {
  const range = mentionRange(draftMentions(draft), selection)
  const prefix = range.start && !/\s/.test(draft.text[range.start - 1]) ? ' ' : ''
  const suffix = /^\s/.test(draft.text.slice(range.end)) ? '' : ' '
  const insertion = `${prefix}@${member.name}${suffix}`
  const next = replaceDraftRange(draft, range, insertion)
  const start = range.start + prefix.length
  const mentions = [...(next.mentions ?? []), { id: member.id, label: member.name, start, end: start + member.name.length + 1 }].sort((a, b) => a.start - b.start)
  return { draft: { ...next, mentions, mentionIds: [...new Set(mentions.map(mention => mention.id))] }, caret: range.start + insertion.length }
}

/** Browser edits preserve text/IME/undo; only confirmed tag ranges carry member identity. */
export function updateDraftText(draft: ChatDraft, text: string, selection?: TextRange): ChatDraft {
  if (text === draft.text && (!selection || selection.start === selection.end)) return draft
  let start = 0, end = draft.text.length, nextEnd = text.length
  while (start < Math.min(end, nextEnd, selection?.start ?? Infinity) && draft.text[start] === text[start]) start++
  while (end > Math.max(start, selection?.end ?? 0) && nextEnd > start && draft.text[end - 1] === text[nextEnd - 1]) { end--; nextEnd-- }
  const delta = text.length - draft.text.length
  const mentions = draftMentions(draft).flatMap(mention => mention.end <= start ? [mention] : mention.start >= end ? [{ ...mention, start: mention.start + delta, end: mention.end + delta }] : [])
  return { ...draft, text, mentions, mentionIds: [...new Set(mentions.map(mention => mention.id))] }
}

/** Existing IPC carries mentions separately; don't duplicate visual labels in the sent body. */
export function draftContent(draft: ChatDraft): string {
  let text = draft.text
  for (const mention of draftMentions(draft).reverse()) text = text.slice(0, mention.start) + text.slice(mention.end)
  return text.trim()
}
