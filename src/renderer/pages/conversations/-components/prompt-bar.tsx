/*
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: 草稿、已绑定技能、当前会话文件、成员和共享原子编辑器。
 * [OUTPUT]: /命令与@技能/文件/成员筛选，工具栏数据源选择共用原子标签插入；资源固定引用随消息发送，选择不执行工具；键盘/IME、附件粘贴与草稿保持。
 * [POS]: Composer输入增强；文件目录惰性有界读取，实际权限由宿主核验。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { ErrorToast } from '@/components/common/error-feedback'
import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import type { DigitalAgent, Resource, ConversationFileItem } from '@shared/domain'
import type { ComposerReference } from '@shared/domain/composer-references'
import { CLIPBOARD_MATERIAL_FILE_FORMATS, type DesktopApi } from '@shared/ipc'
import type { ChatDraft } from '../presentation'
import { draftMentions, insertDraftMention } from '../inline-mentions'
import { Avatar, errorText } from '@/components/common'
import { Check, FileText, FolderOpen, Zap, LoaderCircle } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ChatComposer } from '@/components/ui/chat-composer'
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover'
import { MentionInput, type MentionInputHandle } from './mention-input'

type Menu = 'at' | 'slash'
interface Token { kind: Menu; query: string; start: number; end: number }
function tokenAt(text: string, start: number, end: number): Token | null {
  if (start !== end) return null
  const match = /(^|\s)([@/])([^\s@/]*)$/u.exec(text.slice(0, start))
  return match ? { kind: match[2] === '@' ? 'at' : 'slash', query: match[3].toLocaleLowerCase(), start: match.index + match[1].length, end } : null
}
const commands = [
  { id: 'summarize', name: '总结会话', description: '/summarize · 填入草稿后发送', icon: FileText, prompt: '请总结当前会话的关键结论、分歧和下一步建议。' },
  { id: 'todo', name: '整理待办', description: '/todo · 填入草稿后发送', icon: Check, prompt: '请根据当前会话整理待办事项，列出负责人、交付内容和待确认问题。' },
  { id: 'files', name: '查看文件', description: '/files · 打开聊天文件', icon: FileText },
  { id: 'workspace', name: '打开工作目录', description: '/workspace', icon: FolderOpen },
]
type Row = { id: string; name: string; description: string; member?: DigitalAgent; resource?: ComposerReference; file?: ConversationFileItem; command?: typeof commands[number] }
export interface PromptBarHandle { mention(id: string): void; focus(): void }
interface Props {
  ref?: Ref<PromptBarHandle>; api?: DesktopApi; resources?: Resource[]; conversationId?: string
  draft: ChatDraft; setDraft(value: ChatDraft): void; members: DigitalAgent[]; group: boolean; external: boolean; placeholder: string
  conversationReady?: boolean; mentionsAllowed?: boolean; disabled?: boolean
  onSend(): void; onActivity(): void; onOpenWorkspace(): void; onPasteMaterials?(files?: File[]): void
  attachments?: ReactNode; children(openMenu: (kind: Menu) => void, menu: Menu | null, reference: (value: ComposerReference) => void): ReactNode
}
export function PromptBar({ ref, api, resources = [], conversationId, draft, setDraft, members, group, external, placeholder, conversationReady = true, mentionsAllowed = true, disabled = false, onSend, onActivity, onOpenWorkspace, onPasteMaterials, attachments, children }: Props) {
  const anchor = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null), richInput = useRef<MentionInputHandle>(null)
  const listId = useId(), primary = members.length === 1 ? members[0] : undefined
  const scope = `${conversationId ?? 'new'}:${primary?.id ?? 'group'}`
  const current = useRef({ scope, text: draft.text, disabled }); current.current = { scope, text: draft.text, disabled }
  const mentions = draftMentions(draft)
  const [selection, setSelection] = useState({ start: draft.text.length, end: draft.text.length })
  const [manual, setManual] = useState<Menu | null>(null), [dismissed, setDismissed] = useState(false), [composing, setComposing] = useState(false)
  const [active, setActive] = useState(0), [files, setFiles] = useState<ConversationFileItem[]>([]), [loading, setLoading] = useState(false), [picking, setPicking] = useState(false), [error, setError] = useState('')
  const [nextCursor, setNextCursor] = useState<string>(), [cursor, setCursor] = useState<string>()
  let searchable = draft.text
  for (const mention of [...mentions].reverse()) searchable = searchable.slice(0, mention.start) + ' '.repeat(mention.end - mention.start) + searchable.slice(mention.end)
  const token = !dismissed && !composing ? tokenAt(searchable, selection.start, selection.end) : null
  const requested = manual ?? token?.kind ?? null
  const menu = disabled || requested === 'at' && (!mentionsAllowed || external) ? null : requested
  const lastMenu = useRef<Menu>('slash')
  if (menu) lastMenu.current = menu
  const displayedMenu = menu ?? lastMenu.current
  const query = manual ? '' : token?.query ?? ''
  useEffect(() => { setCursor(undefined); setFiles([]); setNextCursor(undefined); setError('') }, [scope, query, menu])
  useEffect(() => {
    if (menu !== 'at' || !primary || !conversationId || !api) { setLoading(false); return }
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      void api.request('queryConversationFiles', { conversationId, name: query, limit: 20, cursor }).then(page => {
        if (!alive) return
        const available = page.items.filter(file => file.status === 'ready' && file.contentHash && file.sourceMessageId && (file.kind === 'material' || file.actorId === primary.id))
        setFiles(previous => cursor ? [...new Map([...previous, ...available].map(file => [file.id, file])).values()] : available)
        setNextCursor(page.nextCursor)
      }, failure => { if (alive) setError(errorText(failure)) }).finally(() => { if (alive) setLoading(false) })
    }, 120)
    return () => { alive = false; clearTimeout(timer) }
  }, [api, menu, scope, query, cursor, primary?.id])
  const skillRows: Row[] = primary ? resources.filter(resource => resource.kind === 'skill' && primary.skillIds.includes(resource.id) && (!resource.ownerAgentId || resource.ownerAgentId === primary.id) && `${resource.name} ${resource.description}`.toLocaleLowerCase().includes(query)).map(resource => ({ id: `skill:${resource.id}`, name: resource.name, description: '技能', resource: { kind: 'skill', id: resource.id, name: resource.name, agentId: primary.id, configVersion: primary.configVersion } })) : []
  const fileRows: Row[] = primary && conversationId ? files.map(file => ({ id: `${file.kind}:${file.id}`, name: file.name, description: '文件', file, resource: file.kind === 'material' ? { kind: 'material', id: file.id, agentId: primary.id, name: file.name, conversationId, contentHash: file.contentHash!, revision: file.revision! } : { kind: 'artifact', id: file.id, agentId: primary.id, name: file.name, conversationId, contentHash: file.contentHash! } })) : []
  const rows: Row[] = displayedMenu === 'at' ? [...(group ? members.filter(member => member.active && `${member.name} ${member.role}`.toLocaleLowerCase().includes(query)).map(member => ({ id: member.id, name: member.name, description: '成员', member })) : []), ...skillRows, ...fileRows] : commands.filter(command => (conversationReady || command.prompt) && `${command.id} ${command.name} ${command.description}`.toLocaleLowerCase().includes(query)).map(command => ({ ...command, command }))
  const selected = Math.min(active, Math.max(0, rows.length - 1))
  useLayoutEffect(() => { setActive(0) }, [menu, query])
  useLayoutEffect(() => { list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }) }, [menu, selected])
  useLayoutEffect(() => {
    if (group && !disabled && !draft.mentions && draft.mentionIds.length) {
      let next = { ...draft, mentions: [], mentionIds: [] } as ChatDraft
      for (const member of members.filter(member => member.active && draft.mentionIds.includes(member.id)).reverse()) next = insertDraftMention(next, { start: 0, end: 0 }, member).draft
      setDraft(next)
    }
  }, [draft, group, disabled, members, setDraft])
  const close = () => { setManual(null); setDismissed(true) }
  const focus = () => richInput.current?.focus()
  useImperativeHandle(ref, () => ({ focus, mention: id => {
    if (disabled || !mentionsAllowed) return
    const member = members.find(member => member.id === id && member.active)
    if (member && group) { richInput.current?.replace(richInput.current.selection(), '', member); close() }
  } }))
  const pick = async (id: string) => {
    if (disabled || picking) return
    const row = rows.find(item => item.id === id)
    if (!row) return
    const range = token?.kind === menu ? token : richInput.current?.selection() ?? selection
    if (row.file && api && row.resource && (row.resource.kind === 'artifact' || row.resource.kind === 'material')) {
      const expected = current.current
      setPicking(true); setError('')
      try { await api.request('resolveConversationFileTarget', { id: row.file.id, conversationId: row.resource.conversationId, kind: row.file.kind, contentHash: row.file.contentHash, revision: row.file.revision }) }
      catch (failure) { if (current.current.scope === expected.scope) setError(errorText(failure)); setPicking(false); return }
      setPicking(false)
      if (current.current.scope !== expected.scope || current.current.text !== expected.text || current.current.disabled) return
    }
    if (row.resource) richInput.current?.replace(range, '', { id: row.id, name: row.name, resource: row.resource })
    else if (row.member) richInput.current?.replace(range, '', row.member)
    else if (row.command) {
      richInput.current?.replace(range, row.command.prompt ?? '')
      if (row.command.id === 'files') onActivity()
      if (row.command.id === 'workspace') onOpenWorkspace()
    }
    close()
  }
  const openMenu = (kind: Menu) => {
    if (disabled || kind === 'at' && (!mentionsAllowed || external)) return
    if (menu === kind) { close(); focus(); return }
    setManual(kind); setDismissed(false); setActive(0); focus()
  }
  const keyDown = (event: KeyboardEvent) => {
    if (disabled || composing || event.isComposing || event.keyCode === 229) return
    if (menu) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (rows.length) setActive((selected + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length); return }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) { if (event.key === 'Enter' || rows.length) event.preventDefault(); if (rows[selected]) void pick(rows[selected].id); else if (event.key === 'Tab') close(); return }
    }
    if (!external && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend() }
  }
  const paste = (event: ClipboardEvent) => {
    const data = event.clipboardData
    if (!data || !onPasteMaterials) return false
    const files = Array.from(data.files)
    if (!files.length) for (const item of Array.from(data.items)) { const file = item.kind === 'file' ? item.getAsFile() : null; if (file) files.push(file) }
    const systemFiles = Array.from(data.types).some(type => CLIPBOARD_MATERIAL_FILE_FORMATS.some(format => format.toLowerCase() === type.toLowerCase()) && (type.toLowerCase() !== 'text/uri-list' || data.getData(type).split(/\r?\n/).some(line => /^file:/i.test(line.trim()))))
    if (!files.length && !systemFiles) return false
    event.preventDefault(); if (!disabled) onPasteMaterials(files.length ? files : undefined); return true
  }
  return <Popover open={Boolean(menu)} modal={false} onOpenChange={value => { if (!value) close() }}>
    <ChatComposer ref={anchor}>{attachments}
      <MentionInput ref={richInput} disabled={disabled} draft={draft} placeholder={placeholder} listId={menu ? listId : undefined} activeId={menu && rows.length ? `${listId}-${selected}` : undefined} onChange={value => { setDraft(value); setManual(null); setDismissed(false) }} onSelection={setSelection} onKeyDown={keyDown} onPaste={paste} onComposing={setComposing} />
      {children(openMenu, menu, reference => {
        if (disabled || !mentionsAllowed || external || !primary || reference.agentId !== primary.id) return
        richInput.current?.replace(richInput.current.selection(), '', { id: `${reference.kind}:${reference.id}`, name: reference.name, resource: reference })
        close()
      })}
    </ChatComposer>
    <PopoverContent anchor={anchor} side="top" align="start" sideOffset={8} initialFocus={false} finalFocus={false} className="prompt-bar-menu w-[320px] max-w-[calc(100vw-24px)] gap-1.5 p-2">
      <PopoverTitle>{displayedMenu === 'at' ? primary ? '提及技能和文件' : '提及成员' : '命令'}</PopoverTitle>
      <div ref={list} role="listbox" id={listId} aria-label={displayedMenu === 'at' ? primary ? '技能和文件' : '群聊成员' : '快捷命令'} className="prompt-bar-options">
        {rows.map((row, index) => <Button key={row.id} id={`${listId}-${index}`} role="option" aria-selected={index === selected} aria-label={row.member ? '@' + row.name : row.name} variant="ghost" size="content" className="flex items-center" tabIndex={-1} disabled={picking} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => void pick(row.id)}>
          {row.member ? <Avatar name={row.name} seed={row.id} avatar={row.member.avatar} color={row.member.color} /> : row.resource?.kind === 'skill' ? <Zap /> : row.command ? <row.command.icon /> : <FileText />}
          <span className="prompt-bar-option-copy min-w-0"><strong className="truncate" title={row.name}>{row.name}</strong>{row.command && <small>{row.description}</small>}</span>
          {!row.command && <small className="shrink-0 text-muted-foreground">{row.description}</small>}
          {row.member && draft.mentionIds.includes(row.id) && <Check />}
        </Button>)}
        {!rows.length && !loading && <p role="status">{displayedMenu === 'at' ? primary ? '没有匹配的已绑定技能或会话文件' : '没有匹配的成员' : '没有匹配的命令'}</p>}
      </div>
      {(loading || picking) && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3 spinner" />{picking ? '核对文件来源…' : '读取会话文件…'}</p>}
      {error && <ErrorToast>{error}</ErrorToast>}
      {menu === 'at' && nextCursor && <Button variant="ghost" size="xs" disabled={loading} onClick={() => setCursor(nextCursor)}>更多文件</Button>}
      <p className="prompt-bar-hint">{displayedMenu === 'slash' ? '使用 @ 提及技能和文件' : '↑ ↓ 选择 · Enter / Tab 确认 · Esc 收起'}</p>
    </PopoverContent>
  </Popover>
}
