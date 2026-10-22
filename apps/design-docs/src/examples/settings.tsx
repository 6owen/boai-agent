/*
 * [INPUT]: BOAI共享组件与局部示例状态。
 * [OUTPUT]: settings真实示例；页面展示此文件的实际源码。
 * [POS]: 设计站公开示例，不连接BOAI业务服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useId, useState } from 'react'
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, FieldDescription, FieldGroup, FieldLabel, Input } from '@boai/ui'
import { toast } from 'sonner'
import { useEditorGuard } from '@boai/ui/use-editor-guard'

export default function SettingsExample() {
  const id = useId()
  const [saved, setSaved] = useState('我的工作空间')
  const [draft, setDraft] = useState(saved)
  const { guard, confirmation } = useEditorGuard({ reset: () => setDraft(saved) })
  const dirty = draft !== saved
  return <><form className="example-form" onSubmit={event => { event.preventDefault(); if (!draft.trim()) { toast.error('请输入项目名称。'); return }; setSaved(draft); guard.saved(); toast.success('已保存示例设置') }}>
    <Card><CardHeader><CardTitle>项目设置</CardTitle><CardDescription>为日常工作保留一个安静的地方。</CardDescription><CardAction><Badge variant="secondary">{dirty ? '未保存' : '已保存'}</Badge></CardAction></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor={id}>名称</FieldLabel><Input id={id} aria-describedby={`${id}-description`} value={draft} onChange={event => { setDraft(event.currentTarget.value); guard.setDirty(event.currentTarget.value !== saved) }} aria-invalid={!draft.trim()} /><FieldDescription id={`${id}-description`}>这是独立示例，修改只保留在当前预览中。</FieldDescription></Field></FieldGroup></CardContent><CardFooter className="example-settings-footer"><span className="example-hint">{dirty ? '有尚未保存的修改' : '修改已同步'}</span><div className="example-row"><Button type="button" variant="ghost" size="sm" disabled={!dirty} onClick={() => guard.navigate(() => setDraft(saved))}>还原</Button><Button type="submit" size="sm" disabled={!dirty}>保存更改</Button></div></CardFooter></Card>
  </form>{confirmation}</>
}
