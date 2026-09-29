/*
 * [INPUT]: 受控会话草稿、真实成员、发送与已有会话操作、共享 Soft composer/Popover。
 * [OUTPUT]: 真实行内成员节点与系统按钮皮肤、@ / 筛选和光标处插入；编辑器管理选区/删除/IME/历史，单聊保留原生 textarea，不显示额外提及栏。
 * [POS]: 会话私有 composer 增强；参考 https://www.beautifului.dev/r/prompt-bar.json，复用本项目组件，不接入演示数据或全局皮肤。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import type { DigitalAgent } from '@shared/domain'
import type { ChatDraft } from '../presentation'
import { draftMentions, insertDraftMention } from '../inline-mentions'
import { Avatar } from '@/components/common'
import { Check, FileText, FolderOpen } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ChatComposer, ChatComposerInput } from '@/components/ui/chat-composer'
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover'
import { MentionInput, type MentionInputHandle } from './mention-input'

type Menu = 'at' | 'slash'
interface Token { kind: Menu; query: string; start: number; end: number }
// A trigger is a separate word at the caret, never an email, URL or selected text.
function tokenAt(text: string, start: number, end: number): Token | null {
  if (start !== end) return null
  const match = /(^|\s)([@/])([^\s@/]*)$/u.exec(text.slice(0, start))
  return match ? { kind: match[2] === '@' ? 'at' : 'slash', query: match[3].toLocaleLowerCase(), start: match.index + match[1].length, end } : null
}
const commands = [
  { id: 'summarize', name: '/summarize', description: '总结会话 · 填入草稿，编辑后发送', icon: FileText, prompt: '请总结当前会话的关键结论、分歧和下一步建议。' },
  { id: 'todo', name: '/todo', description: '整理待办 · 填入草稿，编辑后发送', icon: Check, prompt: '请根据当前会话整理待办事项，列出负责人、交付内容和待确认问题。' },
  { id: 'files', name: '/files', description: '打开任务与产物', icon: FileText },
  { id: 'workspace', name: '/workspace', description: '打开会话工作目录', icon: FolderOpen },
]
export interface PromptBarHandle { mention(id: string): void }
interface Props {
  ref?: Ref<PromptBarHandle>
  draft: ChatDraft; setDraft(value: ChatDraft): void; members: DigitalAgent[]; group: boolean; external: boolean; placeholder: string
  onSend(): void; onActivity(): void; onOpenWorkspace(): void
  children(openMenu: (kind: Menu) => void, menu: Menu | null): ReactNode
}

export function PromptBar({ ref, draft, setDraft, members, group, external, placeholder, onSend, onActivity, onOpenWorkspace, children }: Props) {
  const anchor = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), list = useRef<HTMLDivElement>(null)
  const richInput = useRef<MentionInputHandle>(null)
  const mentions = draftMentions(draft)
  const listId = useId()
  const [selection, setSelection] = useState({ start: draft.text.length, end: draft.text.length })
  const [manual, setManual] = useState<Menu | null>(null), [dismissed, setDismissed] = useState(false), [composing, setComposing] = useState(false)
  const [active, setActive] = useState(0)
  let searchable = draft.text
  for (const mention of [...mentions].reverse()) searchable = searchable.slice(0, mention.start) + ' '.repeat(mention.end - mention.start) + searchable.slice(mention.end)
  const token = !dismissed && !composing ? tokenAt(searchable, selection.start, selection.end) : null
  const menu = manual ?? (token?.kind === 'at' && !group ? null : token?.kind ?? null)
  const query = manual ? '' : token?.query ?? ''
  const rows = menu === 'at'
    ? members.filter(member => member.active && `${member.name} ${member.role}`.toLocaleLowerCase().includes(query)).map(member => ({ id: member.id, name: `@${member.name}`, description: member.role || '群聊成员', member }))
    : commands.filter(command => command.name.slice(1).startsWith(query) || command.description.includes(query)).map(command => ({ ...command, member: undefined }))
  const selected = Math.min(active, Math.max(0, rows.length - 1))
  useLayoutEffect(() => { setActive(0) }, [menu, query])
  useLayoutEffect(() => { list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }) }, [menu, selected])
  useLayoutEffect(() => {
    // Migrate an already-open draft's old mention row into the editor once.
    if (group && !draft.mentions && draft.mentionIds.length) {
      let next = { ...draft, mentions: [], mentionIds: [] } as ChatDraft
      for (const member of members.filter(member => member.active && draft.mentionIds.includes(member.id)).reverse()) next = insertDraftMention(next, { start: 0, end: 0 }, member).draft
      setDraft(next)
    }
  }, [draft.text, draft.mentions, draft.mentionIds, group, members, setDraft])
  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(240, Math.max(44, element.scrollHeight))}px`
  }, [draft.text])
  const close = () => { setManual(null); setDismissed(true) }
  const focus = () => group ? richInput.current?.focus() : input.current?.focus({ preventScroll: true })
  useImperativeHandle(ref, () => ({ mention: id => {
    const member = members.find(member => member.id === id && member.active)
    if (member && group && richInput.current) { richInput.current.replace(richInput.current.selection(), '', member); close() }
  } }))
  const pick = (id: string) => {
    const range = token?.kind === menu ? token : selection
    if (menu === 'at') {
      const member = members.find(item => item.id === id && item.active)
      if (!member) return
      richInput.current?.replace(range, '', member)
      close()
      return
    }
    const command = commands.find(item => item.id === id)
    if (!command) return
    const insertion = command.prompt ?? ''
    if (group) richInput.current?.replace(range, insertion)
    else {
      setDraft({ ...draft, text: draft.text.slice(0, range.start) + insertion + draft.text.slice(range.end) })
      const caret = range.start + insertion.length
      setSelection({ start: caret, end: caret })
      requestAnimationFrame(() => { input.current?.focus({ preventScroll: true }); input.current?.setSelectionRange(caret, caret) })
    }
    close()
    if (command.id === 'files') onActivity()
    else if (command.id === 'workspace') onOpenWorkspace()
  }
  const openMenu = (kind: Menu) => {
    if (menu === kind) { close(); focus(); return }
    setManual(kind); setDismissed(false); setActive(0); focus()
  }
  const keyDown = (event: KeyboardEvent) => {
    if (composing || event.isComposing || event.keyCode === 229) return
    if (menu) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (rows.length) setActive((selected + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length)
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        // Enter in an empty menu must not accidentally send the unfinished trigger.
        if (event.key === 'Enter' || rows.length) event.preventDefault()
        if (rows[selected]) pick(rows[selected].id)
        else if (event.key === 'Tab') close()
        return
      }
    }
    if (!external && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend() }
  }
  return <Popover open={Boolean(menu)} modal={false} onOpenChange={value => { if (!value) close() }}>
    <ChatComposer ref={anchor}>
      {group ? <MentionInput ref={richInput} draft={draft} placeholder={placeholder} listId={menu ? listId : undefined} activeId={menu && rows.length ? `${listId}-${selected}` : undefined}
        onChange={value => { setDraft(value); setManual(null); setDismissed(false) }} onSelection={setSelection} onKeyDown={keyDown} onComposing={setComposing} /> :
      <ChatComposerInput ref={input} aria-label="消息内容" aria-autocomplete="list" aria-controls={menu ? listId : undefined} aria-activedescendant={menu && rows.length ? `${listId}-${selected}` : undefined} placeholder={placeholder} value={draft.text}
        onChange={event => { setDraft({ ...draft, text: event.target.value }); setSelection({ start: event.target.selectionStart, end: event.target.selectionEnd }); setManual(null); setDismissed(false) }}
        onSelect={event => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={event => keyDown(event.nativeEvent)} />}
      {children(openMenu, menu)}
    </ChatComposer>
    <PopoverContent anchor={anchor} side="top" align="start" sideOffset={8} initialFocus={false} finalFocus={false} className="prompt-bar-menu w-(--anchor-width) max-w-[calc(100vw-24px)] gap-1.5 p-2">
      <PopoverTitle>{menu === 'at' ? '提及成员' : '快捷命令'}</PopoverTitle>
      <div ref={list} role="listbox" id={listId} aria-label={menu === 'at' ? '群聊成员' : '快捷命令'} className="prompt-bar-options">
        {rows.map((row, index) => <Button key={row.id} id={`${listId}-${index}`} role="option" aria-selected={index === selected} aria-label={row.name} variant="ghost" size="content" className="flex items-center" tabIndex={-1} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(row.id)}>
          {row.member ? <Avatar name={row.member.name} seed={row.id} avatar={row.member.avatar} color={row.member.color} /> : (() => { const Icon = commands.find(command => command.id === row.id)!.icon; return <Icon /> })()}
          <span className="prompt-bar-option-copy"><strong>{row.name}</strong><small>{row.description}</small></span>
          {row.member && draft.mentionIds.includes(row.id) && <Check />}
        </Button>)}
        {!rows.length && <p role="status">{menu === 'at' ? '没有匹配的成员' : '没有匹配的命令'}</p>}
      </div>
      <p className="prompt-bar-hint">↑ ↓ 选择 · Enter / Tab 确认 · Esc 收起</p>
    </PopoverContent>
  </Popover>
}
