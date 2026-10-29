/*
 * [INPUT]: Shell固定提示词标签、原公开IPC与bobo管理入口。
 * [OUTPUT]: 数据源同款标题栏，下方直接编辑名称/描述/正文；版本化保存、AI管理及草稿保护。
 * [POS]: 资源库右侧提示词编辑器；新建和编辑均不使用正文Dialog。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useContext, useEffect, useReducer, useState } from 'react'
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import type { PromptTemplate } from '@boai/shared/domain/prompt-templates'
import { Banner, Field, GuardContext, errorText, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageCircle } from '@/components/icons'
import { SkillDetailPanel } from './skill-detail-layout'
import { PromptActions } from './prompt-template-actions'
import { observePromptDetail, promptEditorDirty, promptEditorReducer, promptEditorState } from './prompt-detail-state'

export function PromptDetailPanel({ api, id, name, requestId, create = false, active, onManage, onSaved, onClose }: {
  api: DesktopApi; id: string; name: string; requestId: string; create?: boolean; active: boolean
  onManage(value?: { id: string; name: string }): void; onSaved(value: PromptTemplate): void; onClose(): void
}) {
  const [editor, dispatch] = useReducer(promptEditorReducer, create, promptEditorState)
  const [readError, setReadError] = useState(''), [refresh, setRefresh] = useState(0)
  const guard = useContext(GuardContext), mutation = useMutation(), dirty = promptEditorDirty(editor)
  const unsaved = create && !editor.base, missing = editor.latest === null
  useEffect(() => { guard.setDirty(dirty) }, [dirty, guard.setDirty])
  useEffect(() => () => guard.setDirty(false), [guard.setDirty])
  useEffect(() => {
    if (!active || unsaved) return
    return observePromptDetail(api, id, value => { dispatch({ type: 'receive', value }); setReadError('') }, error => setReadError(errorText(error)))
  }, [api, id, requestId, active, unsaved, refresh])
  const locked = !active || mutation.busy || missing
  return <SkillDetailPanel name={editor.base?.name ?? name} label="提示词详情" className="prompt-detail-panel" actions={<>
    <Button variant="secondary" size="sm" disabled={locked || !editor.ready} onClick={() => guard.navigate(() => onManage(editor.base))}><MessageCircle />AI 管理</Button>
    {editor.base && <PromptActions api={api} value={editor.base} disabled={locked} onRemoved={() => guard.saved(onClose)} />}
  </>}>
    {readError && <><Banner>{readError}</Banner><Button variant="ghost" size="sm" onClick={() => setRefresh(value => value + 1)}>重新读取</Button></>}
    {missing && <p className="empty-note">该提示词已被删除。</p>}
    {!editor.ready ? <div className="space-y-4 p-5" aria-busy="true" aria-label="读取提示词"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-48" /></div> : <form data-edit-form className="prompt-detail-form" onSubmit={event => {
      event.preventDefault()
      if (locked || !dirty || !editor.draft.name.trim() || !editor.draft.content.trim()) return
      const input = { id, expectedRevision: editor.base?.revision ?? 0, ...editor.draft }
      void mutation.run(async () => {
        const value = await api.request('savePromptTemplate', input)
        dispatch({ type: 'saved', value }); guard.saved(); onSaved(value); toast.success('提示词已保存')
      })
    }}>
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
        <Field label="名称"><Input required maxLength={100} value={editor.draft.name} onChange={event => dispatch({ type: 'edit', draft: { ...editor.draft, name: event.target.value } })} /></Field>
        <Field label="描述（可选）"><Input maxLength={1000} value={editor.draft.description} onChange={event => dispatch({ type: 'edit', draft: { ...editor.draft, description: event.target.value } })} /></Field>
        <Field label="提示词内容"><Textarea required rows={12} maxLength={40000} value={editor.draft.content} onChange={event => dispatch({ type: 'edit', draft: { ...editor.draft, content: event.target.value } })} /></Field>
      </fieldset>
      <footer className="button-row justify-end"><Button type="button" variant="secondary" size="sm" disabled={mutation.busy} onClick={() => guard.navigate(onClose)}>取消</Button><Button type="submit" size="sm" disabled={locked || !dirty || !editor.draft.name.trim() || !editor.draft.content.trim()}>保存</Button></footer>
    </form>}
  </SkillDetailPanel>
}
