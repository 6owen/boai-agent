/*
 * [INPUT]: 受控草稿、候选键盘回调与共享 Button 皮肤/class 合并、Tiptap 编辑模型。
 * [OUTPUT]: 实际行内原子标签、文字高度光标/选区/整体删除和撤销，标签以 inline 留白替代固定高度 flex；外部提及恢复编辑器实际选区，恢复草稿时光标置末，纯文本粘贴不冒认点名身份。
 * [POS]: 群聊私有输入控件；单聊继续使用 ChatComposerInput。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
import { Editor } from '@tiptap/core'
import { cn } from 'cn'
import { buttonVariants } from '@/components/ui/button'
import type { ChatDraft } from '../presentation'
import type { TextRange } from '../inline-mentions'
import { documentDraft, documentPosition, draftOffset, mentionDocument, mentionExtensions, textNodes } from '../mention-editor'

export interface MentionInputHandle {
  focus(): void
  selection(): TextRange
  replace(range: TextRange, text: string, member?: { id: string; name: string }): void
}
interface Props {
  ref?: Ref<MentionInputHandle>; draft: ChatDraft; onChange(draft: ChatDraft): void; placeholder: string
  onSelection(range: TextRange): void; onKeyDown(event: KeyboardEvent): void; onComposing(value: boolean): void
  listId?: string; activeId?: string
}

export function MentionInput(props: Props) {
  const host = useRef<HTMLDivElement>(null), editor = useRef<Editor | null>(null), latest = useRef(props)
  latest.current = props
  const selection = (): TextRange => {
    const instance = editor.current
    return instance ? { start: draftOffset(instance.state.doc, instance.state.selection.from), end: draftOffset(instance.state.doc, instance.state.selection.to) } : { start: 0, end: 0 }
  }
  useImperativeHandle(props.ref, () => ({
    focus: () => editor.current?.view.focus(),
    selection,
    replace: (range, text, member) => {
      const instance = editor.current
      if (!instance) return
      const { doc } = instance.state
      const content = member ? [{ type: 'mention', attrs: { id: member.id, label: member.name } }] : textNodes(text)
      const positions = { from: documentPosition(doc, range.start), to: documentPosition(doc, range.end) }
      if (content.length) instance.commands.insertContentAt(positions, content)
      else instance.commands.deleteRange(positions)
      // EditorView restores its transaction's selection as well as focusing without scrolling.
      // Native DOM focus alone returns a blurred contenteditable's caret to the paragraph start.
      instance.view.focus()
    },
  }), [])
  useLayoutEffect(() => {
    const instance = new Editor({
      element: host.current!, injectCSS: false,
      extensions: mentionExtensions(cn(buttonVariants({ variant: 'secondary', size: 'xs', className: 'composer-mention-tag' }), 'inline h-auto py-1')),
      content: mentionDocument(latest.current.draft),
      editorProps: {
        attributes: { class: 'chat-composer-input mention-editor-input', role: 'textbox', 'aria-label': '消息内容', 'aria-multiline': 'true', 'aria-autocomplete': 'list' },
        handleKeyDown: (_view, event) => { latest.current.onKeyDown(event); return event.defaultPrevented },
        handlePaste: (view, event) => {
          const text = event.clipboardData?.getData('text/plain')
          if (text === undefined) return false
          event.preventDefault()
          if (text) instance.commands.insertContent(textNodes(text))
          else view.dispatch(view.state.tr.deleteSelection())
          return true
        },
        handleDOMEvents: {
          compositionstart: () => { latest.current.onComposing(true); return false },
          compositionend: () => { latest.current.onComposing(false); return false },
        },
      },
      onUpdate: ({ editor: value }) => latest.current.onChange(documentDraft(value.state.doc, latest.current.draft)),
      onSelectionUpdate: () => latest.current.onSelection(selection()),
    })
    editor.current = instance
    instance.commands.setTextSelection(instance.state.doc.content.size - 1)
    return () => { editor.current = null; instance.destroy() }
  }, [])
  useLayoutEffect(() => {
    const instance = editor.current
    if (!instance) return
    const current = documentDraft(instance.state.doc, props.draft)
    if (current.text !== props.draft.text || JSON.stringify(current.mentions) !== JSON.stringify(props.draft.mentions ?? [])) instance.commands.setContent(mentionDocument(props.draft), { emitUpdate: false })
    const dom = instance.view.dom
    dom.dataset.placeholder = props.placeholder
    dom.dataset.empty = String(!props.draft.text)
    for (const [key, value] of [['aria-controls', props.listId], ['aria-activedescendant', props.activeId]]) {
      if (value) dom.setAttribute(key!, value)
      else dom.removeAttribute(key!)
    }
  }, [props.draft, props.placeholder, props.listId, props.activeId])
  return <div ref={host} className="mention-editor" />
}
