/*
 * [OUTPUT]: 提供当前编辑器焦点查询，语音快捷键不能定位到其他输入框。
 * [OUTPUT]: 2026-10-27 默认关闭语音插件接线、可信主窗口与原草稿/生命周期边界。
 * [OUTPUT]: aria-disabled与实际编辑锁同步，使加载/待核对输入向辅助技术和真实UI操作报告同一禁用状态。
 * [OUTPUT]: scope变化保留编辑器DOM并重建ProseMirror文档/插件状态，撤销不跨会话；同scope草稿仍保留原历史。
 * [OUTPUT]: @员工与$资源/提示词共用原子插入，提示词正文快照随撤销/草稿保留。
 * [OUTPUT]: 单聊/群聊统一原子编辑器，资源标签保持来源和整体删除；外部选择标签独立成撤销步骤，快速删除后撤销不连带清除原草稿。
 * [INPUT]: 受控草稿、候选键盘回调与共享 Button 皮肤/class 合并、Tiptap 编辑模型。
 * [OUTPUT]: 原补充请求待核对时冻结编辑，锁定变化不触发正文更新；实际行内原子标签、文字高度光标/选区/整体删除和撤销，标签以 inline 留白替代固定高度 flex；外部提及恢复编辑器实际选区，恢复草稿时光标置末，纯文本粘贴不冒认点名身份。
 * [OUTPUT]: 文件/图片粘贴先交附件入口，不被旧纯文本handlePaste吞掉；普通文本保持当前选区替换与IME边界。
 * [POS]: 单聊/群聊及核心首发共用的原子输入控件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { VoiceAnchor } from '@boai/voice-input-plugin/controller'
import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
import { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { EditorState } from '@tiptap/pm/state'
import { cn } from 'cn'
import { buttonVariants } from '@/components/ui/button'
import type { ComposerReference } from '@boai/shared/domain/composer-references'
import type { PromptTemplateReference } from '@boai/shared/domain/prompt-templates'
import type { ChatDraft } from '../presentation'
import type { TextRange } from '../inline-mentions'
import { documentDraft, documentPosition, draftOffset, mentionDocument, mentionExtensions, textNodes, voiceTextTransaction } from '../mention-editor'

export interface MentionInputHandle {
  hasFocus(): boolean
  voiceSnapshot(): VoiceAnchor | undefined
  insertVoice(anchor: VoiceAnchor, text: string): VoiceAnchor | undefined
  replaceVoice(anchor: VoiceAnchor, original: string, text: string): VoiceAnchor | undefined
  focus(): void
  selection(): TextRange
  replace(range: TextRange, text: string, member?: { id: string; name: string; resource?: ComposerReference; prompt?: PromptTemplateReference }): void
}
interface Props {
  scope?: string
  ref?: Ref<MentionInputHandle>; draft: ChatDraft; onChange(draft: ChatDraft): void; placeholder: string
  onSelection(range: TextRange): void; onKeyDown(event: KeyboardEvent): void; onComposing(value: boolean): void
  onPaste?(event: ClipboardEvent): boolean
  listId?: string; activeId?: string; disabled?: boolean
}

export function MentionInput(props: Props) {
  const host = useRef<HTMLDivElement>(null), editor = useRef<Editor | null>(null), latest = useRef(props)
  const scope = useRef(props.scope), revision = useRef(0)
  latest.current = props
  const selection = (): TextRange => {
    const instance = editor.current
    return instance ? { start: draftOffset(instance.state.doc, instance.state.selection.from), end: draftOffset(instance.state.doc, instance.state.selection.to) } : { start: 0, end: 0 }
  }
  const replace = (range: TextRange, text: string, member?: { id: string; name: string; resource?: ComposerReference; prompt?: PromptTemplateReference }, isolated = false) => {
    const instance = editor.current
    if (!instance || latest.current.disabled) return
    const content = member ? [{ type: 'mention', attrs: { id: member.id, label: member.name, trigger: member.resource || member.prompt ? '$' : '@', resource: member.resource ?? null, prompt: member.prompt ?? null } }] : textNodes(text)
    const positions = { from: documentPosition(instance.state.doc, range.start), to: documentPosition(instance.state.doc, range.end) }
    if (member || isolated) instance.view.dispatch(closeHistory(instance.state.tr))
    if (content.length) instance.commands.insertContentAt(positions, content)
    else instance.commands.deleteRange(positions)
    if (member || isolated) instance.view.dispatch(closeHistory(instance.state.tr))
    instance.view.focus()
  }
  const voiceEdit = (anchor: VoiceAnchor, text: string, original?: string): VoiceAnchor | undefined => {
    const instance = editor.current
    if (!instance || latest.current.disabled || anchor.scope !== (scope.current ?? '') || anchor.revision !== revision.current) return
    const current = documentDraft(instance.state.doc, latest.current.draft)
    if (original !== undefined && current.text.slice(anchor.start, anchor.end) !== original) return
    instance.view.dispatch(voiceTextTransaction(instance.state, anchor, text))
    instance.view.dispatch(closeHistory(instance.state.tr))
    instance.view.focus()
    return { ...anchor, end: anchor.start + text.length, revision: revision.current }
  }
  useImperativeHandle(props.ref, () => ({
    hasFocus: () => editor.current?.view.hasFocus() ?? false,
    focus: () => editor.current?.view.focus(), selection, replace,
    voiceSnapshot: () => !editor.current || latest.current.disabled ? undefined : { scope: scope.current ?? '', revision: revision.current, start: selection().end, end: selection().end },
    insertVoice: (anchor, text) => voiceEdit(anchor, text),
    replaceVoice: (anchor, original, text) => voiceEdit(anchor, text, original),
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
          if (latest.current.onPaste?.(event)) return true
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
      onTransaction: ({ transaction }) => { if (transaction.docChanged || transaction.selectionSet) revision.current++ },
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
    if (scope.current !== props.scope) {
      scope.current = props.scope; revision.current++
      instance.view.updateState(EditorState.create({ schema: instance.schema, doc: instance.schema.nodeFromJSON(mentionDocument(props.draft)), plugins: instance.state.plugins }))
      instance.commands.setTextSelection(instance.state.doc.content.size - 1)
    }
    if (instance.isEditable !== !props.disabled) instance.setEditable(!props.disabled, false)
    const current = documentDraft(instance.state.doc, props.draft)
    if (current.text !== props.draft.text || JSON.stringify(current.mentions) !== JSON.stringify(props.draft.mentions ?? [])) instance.commands.setContent(mentionDocument(props.draft), { emitUpdate: false })
    const dom = instance.view.dom
    dom.setAttribute('aria-disabled', String(Boolean(props.disabled)))
    dom.dataset.placeholder = props.placeholder
    dom.dataset.empty = String(!props.draft.text)
    for (const [key, value] of [['aria-controls', props.listId], ['aria-activedescendant', props.activeId]]) {
      if (value) dom.setAttribute(key!, value)
      else dom.removeAttribute(key!)
    }
  }, [props.scope, props.draft, props.placeholder, props.listId, props.activeId, props.disabled])
  return <div ref={host} className="mention-editor" />
}
