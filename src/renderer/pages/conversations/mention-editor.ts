/*
 * [OUTPUT]: 原子节点区分@员工与$资源/提示词，提示词正文快照保留于编辑/撤销/草稿往返，复制标签不伪造引用。
 * [OUTPUT]: 原子标签保存成员或资源身份，复制纯文字不伪造引用。
 * [INPUT]: Tiptap/ProseMirror 原子节点与 DOM NodeView、共享草稿及主题按钮 class。
 * [OUTPUT]: 文字/换行/成员标签编辑模型；标签外层提供字体高度的 DOM 光标边界，内层复用按钮皮肤；辅助字符不进入草稿或复制序列化，保留原子删除和编辑历史。
 * [POS]: 单聊/群聊及核心首发共用的编辑模型，不改变消息/点名 IPC。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Extension, Node, type JSONContent } from '@tiptap/core'
import type { Node as DocumentNode } from '@tiptap/pm/model'
import type { Command } from '@tiptap/pm/state'
import { history, undo, redo } from '@tiptap/pm/history'
import type { ChatDraft, DraftMention } from './presentation'
import { draftMentions } from './inline-mentions'

export const deleteMention = (direction: 'backward' | 'forward'): Command => (state, dispatch) => {
  const { empty, $from } = state.selection
  if (!empty) return false
  const node = direction === 'backward' ? $from.nodeBefore : $from.nodeAfter
  if (node?.type.name !== 'mention') return false
  const from = direction === 'backward' ? $from.pos - node.nodeSize : $from.pos
  dispatch?.(state.tr.delete(from, from + node.nodeSize).scrollIntoView())
  return true
}

export function mentionExtensions(tagClass: string) {
  return [
    Node.create({ name: 'doc', topNode: true, content: 'paragraph' }),
    Node.create({ name: 'paragraph', content: 'inline*', group: 'block', parseHTML: () => [{ tag: 'p' }], renderHTML: () => ['p', 0] }),
    Node.create({ name: 'text', group: 'inline' }),
    Node.create({ name: 'hardBreak', inline: true, group: 'inline', selectable: false, parseHTML: () => [{ tag: 'br' }], renderHTML: () => ['br'] }),
    Node.create({
      name: 'mention', inline: true, group: 'inline', atom: true, selectable: true,
      addAttributes: () => ({ id: { default: '' }, label: { default: '' }, trigger: { default: '@', rendered: false }, resource: { default: null, rendered: false }, prompt: { default: null, rendered: false } }),
      renderHTML: ({ node }) => ['span', { class: tagClass, 'data-mention-id': node.attrs.id, contenteditable: 'false' }, `${node.attrs.trigger}${node.attrs.label}`],
      renderText: ({ node }) => `${node.attrs.trigger}${node.attrs.label}`,
      addNodeView: () => ({ node }) => {
        const dom = document.createElement('span'), label = document.createElement('span')
        dom.className = 'composer-mention-node'
        dom.dataset.mentionId = node.attrs.id
        dom.contentEditable = 'false'
        label.className = tagClass
        label.textContent = `${node.attrs.trigger}${node.attrs.label}`
        // View-only text boundaries give Chromium a font-sized caret outside the padding.
        // renderHTML/renderText above keep them out of both clipboard formats and the model.
        const boundary = () => {
          const span = document.createElement('span')
          span.className = 'composer-mention-boundary'
          span.setAttribute('aria-hidden', 'true')
          span.textContent = '\u200B'
          return span
        }
        dom.append(boundary(), label, boundary())
        return { dom }
      },
    }),
    Extension.create({
      name: 'mentionEditing', priority: 1000,
      addProseMirrorPlugins: () => [history()],
      addKeyboardShortcuts() {
        return {
          Backspace: () => deleteMention('backward')(this.editor.state, this.editor.view.dispatch),
          Delete: () => deleteMention('forward')(this.editor.state, this.editor.view.dispatch),
          'Shift-Enter': () => this.editor.commands.insertContent({ type: 'hardBreak' }),
          'Mod-z': () => undo(this.editor.state, this.editor.view.dispatch),
          'Mod-Shift-z': () => redo(this.editor.state, this.editor.view.dispatch),
          'Mod-y': () => redo(this.editor.state, this.editor.view.dispatch),
        }
      },
    }),
  ]
}

export function textNodes(text: string): JSONContent[] {
  return text.split('\n').flatMap((line, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : [])])
}

export function mentionDocument(draft: ChatDraft): JSONContent {
  const content: JSONContent[] = []
  let offset = 0
  for (const mention of draftMentions(draft)) {
    content.push(...textNodes(draft.text.slice(offset, mention.start)), { type: 'mention', attrs: { id: mention.id, label: mention.label, trigger: draft.text[mention.start], resource: mention.resource ?? null, prompt: mention.prompt ?? null } })
    offset = mention.end
  }
  content.push(...textNodes(draft.text.slice(offset)))
  return { type: 'doc', content: [{ type: 'paragraph', content }] }
}

const nodeText = (node: DocumentNode) => node.type.name === 'mention' ? `${node.attrs.trigger}${node.attrs.label}` : node.type.name === 'hardBreak' ? '\n' : node.text ?? ''

export function documentDraft(doc: DocumentNode, draft: ChatDraft): ChatDraft {
  let text = ''
  const mentions: DraftMention[] = []
  doc.firstChild?.forEach(node => {
    const value = nodeText(node)
    if (node.type.name === 'mention') mentions.push({ id: node.attrs.id, label: node.attrs.label, ...(node.attrs.resource ? { resource: node.attrs.resource } : {}), ...(node.attrs.prompt ? { prompt: node.attrs.prompt } : {}), start: text.length, end: text.length + value.length })
    text += value
  })
  return { ...draft, text, mentions, mentionIds: [...new Set(mentions.filter(mention => !mention.resource && !mention.prompt).map(mention => mention.id))] }
}

/** Document atoms occupy one position; draft offsets retain the full visible label. */
export function draftOffset(doc: DocumentNode, position: number): number {
  let result = 0
  doc.firstChild?.forEach((node, offset) => {
    if (position <= offset + 1) return
    result += position >= offset + 1 + node.nodeSize ? nodeText(node).length : node.isText ? position - offset - 1 : 0
  })
  return result
}

export function documentPosition(doc: DocumentNode, offset: number): number {
  let textOffset = 0, result = 1
  doc.firstChild?.forEach((node, position) => {
    const length = nodeText(node).length
    if (offset >= textOffset + length) result = position + 1 + node.nodeSize
    else if (offset > textOffset) result = position + 1 + (node.isText ? offset - textOffset : offset - textOffset < length / 2 ? 0 : node.nodeSize)
    textOffset += length
  })
  return result
}
