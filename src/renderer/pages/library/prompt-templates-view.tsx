/*
 * [INPUT]: 全局提示词目录、稳定所见版本及资源库选择。
 * [OUTPUT]: 技能同款目录行、查看/创建/编辑Dialog与确认删除；草稿守卫、忙时锁定、冲突/错误沿Sonner。
 * [POS]: 资源库提示词管理，不执行提示词或修改员工人格。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { PromptTemplate } from '@shared/domain/prompt-templates'
import { Banner, Field, GuardContext, useDirty, useMutation } from '@/components/common'
import { useEditorGuard } from '@/components/common/use-editor-guard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { CatalogSearch } from '@/components/common/catalog-search'
import { IllustratedEmpty } from '@/components/common/illustrated-empty'
import { FileText, Pencil, Plus, Trash2 } from '@/components/icons'

export function PromptTemplatesView({ api, prompts, focus, onChanged, onRemoved }: {
  api: DesktopApi; prompts: PromptTemplate[]; focus?: { id: string; requestId: string }
  onChanged(value: PromptTemplate): void; onRemoved(id: string): void
}) {
  const [query, setQuery] = useState(''), [target, setTarget] = useState<{ value?: PromptTemplate; edit: boolean; key: string }>()
  const focusedRequest = useRef('')
  useEffect(() => {
    if (!focus || focusedRequest.current === focus.requestId) return
    const value = prompts.find(item => item.id === focus.id)
    if (value) { focusedRequest.current = focus.requestId; setTarget({ value, edit: false, key: focus.requestId }) }
  }, [focus, prompts])
  const visible = prompts.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <section className="sources-view" aria-label="提示词管理">
    <header className="custom-content-heading"><h1>提示词</h1><Button variant="secondary" size="sm" onClick={() => setTarget({ edit: true, key: crypto.randomUUID() })}><Plus />新建提示词</Button></header>
    <div className="custom-catalog-toolbar source-catalog-toolbar"><p className="field-hint">在输入框中使用 $ 引用，发送时展开为正文。</p><div className="custom-catalog-search"><CatalogSearch label="搜索提示词" value={query} onChange={setQuery} placeholder="搜索提示词" /></div></div>
    {visible.length ? <div className="conversation-list skills-list-scroll skills-browser-list source-catalog" aria-label="提示词列表"><div className="skill-list-content">{visible.map(value => <PromptRow key={value.id} api={api} value={value} onRemoved={onRemoved} onOpen={edit => setTarget({ value, edit, key: crypto.randomUUID() })} />)}</div></div> : <IllustratedEmpty kind="skills" title={query ? '没有匹配的提示词' : undefined} />}
    {target && <PromptDialog key={target.key} api={api} value={target.value} edit={target.edit} onClose={() => setTarget(undefined)} onSaved={value => { onChanged(value); setTarget(undefined) }} />}
  </section>
}

function PromptRow({ api, value, onOpen, onRemoved }: { api: DesktopApi; value: PromptTemplate; onOpen(edit: boolean): void; onRemoved(id: string): void }) {
  const [removing, setRemoving] = useState(false), { busy, error, run } = useMutation()
  return <div className="skill-list-row source-catalog-row">
    {error && <Banner>{error}</Banner>}
    <Button variant="ghost" size="content" disabled={busy} className="conversation-item skill-list-select" onClick={() => onOpen(false)}><span className="skill-list-icon"><FileText /></span><span className="conversation-copy"><strong className="conversation-title" title={value.name}>{value.name}</strong><small className="conversation-preview">{value.description || value.content}</small></span></Button>
    <div className="source-row-actions">
      <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`编辑提示词 ${value.name}`} onClick={() => onOpen(true)}><Pencil /></Button>
      <Popover open={removing} onOpenChange={open => { if (!busy) setRemoving(open) }}>
        <PopoverTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`删除提示词 ${value.name}`} />}><Trash2 /></PopoverTrigger>
        <PopoverContent align="end"><PopoverTitle>删除“{value.name}”？</PopoverTitle><div className="button-row justify-end"><Button variant="secondary" size="sm" disabled={busy} onClick={() => setRemoving(false)}>取消</Button><Button variant="destructive" size="sm" disabled={busy} onClick={() => void run(async () => { await api.request('removePromptTemplate', { id: value.id, expectedRevision: value.revision }); setRemoving(false); onRemoved(value.id) })}>确认删除</Button></div></PopoverContent>
      </Popover>
    </div>
  </div>
}

function PromptDialog({ api, value, edit, onClose, onSaved }: { api: DesktopApi; value?: PromptTemplate; edit: boolean; onClose(): void; onSaved(value: PromptTemplate): void }) {
  const [editing, setEditing] = useState(edit), [busy, setBusy] = useState(false)
  const { guard, navigate, confirmation } = useEditorGuard({ reset() {} })
  const close = () => { if (!busy) navigate(onClose, { resetOnDiscard: false }) }
  return <GuardContext.Provider value={guard}><Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent showCloseButton={!busy} className="flex max-h-[calc(100dvh-48px)] min-w-0 flex-col overflow-y-auto sm:max-w-[680px]">
      <DialogHeader><DialogTitle>{editing ? value ? '编辑提示词' : '新建提示词' : value?.name}</DialogTitle></DialogHeader>
      {editing ? <PromptForm api={api} value={value} onBusyChange={setBusy} onCancel={close} onSaved={onSaved} /> : <>
        {value?.description && <p className="text-sm text-muted-foreground">{value.description}</p>}
        <div className="whitespace-pre-wrap break-words text-sm leading-7">{value?.content}</div>
        <DialogFooter variant="plain"><Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil />编辑</Button></DialogFooter>
      </>}
    </DialogContent>
  </Dialog>{confirmation}</GuardContext.Provider>
}

function PromptForm({ api, value, onBusyChange, onCancel, onSaved }: { api: DesktopApi; value?: PromptTemplate; onBusyChange(busy: boolean): void; onCancel(): void; onSaved(value: PromptTemplate): void }) {
  const [form, setForm] = useState({ name: value?.name ?? '', description: value?.description ?? '', content: value?.content ?? '' })
  const identity = useRef({ id: value?.id ?? crypto.randomUUID(), expectedRevision: value?.revision ?? 0 })
  const { busy, error, run } = useMutation()
  useDirty(form)
  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  return <form data-edit-form className="flex min-w-0 flex-col gap-4" onSubmit={event => { event.preventDefault(); void run(async () => onSaved(await api.request('savePromptTemplate', { ...identity.current, ...form }))) }}>
    {error && <Banner>{error}</Banner>}
    <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
      <Field label="名称"><Input required maxLength={100} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></Field>
      <Field label="描述（可选）"><Input maxLength={1000} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></Field>
      <Field label="提示词内容"><Textarea required rows={12} maxLength={40000} value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} /></Field>
    </fieldset>
    <DialogFooter variant="plain"><Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>取消</Button><Button type="submit" size="sm" disabled={busy || !form.name.trim() || !form.content.trim()}>{busy ? '正在保存…' : '保存'}</Button></DialogFooter>
  </form>
}
