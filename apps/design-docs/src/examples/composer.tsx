/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { Button } from '@boai/ui/button'
import * as C from '@boai/ui/chat-composer'
import * as A from '@boai/ui/attachment'
import { Popover, PopoverContent, PopoverTrigger } from '@boai/ui/popover'
import { SelectField } from '@boai/ui/select-field'
export default function Composer() {
 const [text,setText] = useState(''), [model,setModel] = useState('model-a'), [permission,setPermission] = useState('ask'), [attached,setAttached] = useState(false), [sent,setSent] = useState(''), [busy,setBusy] = useState(false)
 return <div className="example-stack"><form onSubmit={event => { event.preventDefault(); if (!text.trim() || busy) return; setSent(text); setText(''); setBusy(true) }}><C.ChatComposer>
 {attached && <A.Attachment size="sm"><A.AttachmentContent><A.AttachmentTitle>示例资料.md</A.AttachmentTitle><A.AttachmentDescription>本地展示占位附件</A.AttachmentDescription></A.AttachmentContent><A.AttachmentActions><A.AttachmentAction aria-label="移除附件" onClick={() => setAttached(false)}>×</A.AttachmentAction></A.AttachmentActions></A.Attachment>}
 <C.ChatComposerInput aria-label="消息内容" value={text} disabled={busy} onChange={event => setText(event.target.value)} placeholder="写点什么，或插入 @资料…" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
 <C.ChatComposerFooter><C.ChatComposerActions><Button type="button" variant="ghost" size="icon-sm" aria-label="添加示例附件" onClick={() => setAttached(true)} disabled={busy}>＋</Button><Popover><PopoverTrigger render={<Button type="button" variant="ghost" size="sm" disabled={busy} />}>@</PopoverTrigger><PopoverContent><Button type="button" variant="ghost" onClick={() => setText(value => value + '@设计说明 ')}>插入 @设计说明</Button></PopoverContent></Popover><Popover><PopoverTrigger render={<C.ChatComposerSelect type="button" kind="model" disabled={busy} />}>{model === 'model-a' ? '模型 A' : '模型 B'}</PopoverTrigger><PopoverContent><SelectField aria-label="示例模型" value={model} onValueChange={setModel} options={[{value:'model-a',label:'模型 A'},{value:'model-b',label:'模型 B'}]} /><C.ChatComposerOption label="模型选择" description="只改变预览标签，不调用真实服务。" /></PopoverContent></Popover><Popover><PopoverTrigger render={<C.ChatComposerSelect type="button" kind="permission" disabled={busy} />}>{permission === 'ask' ? '询问' : '只读'}</PopoverTrigger><PopoverContent><SelectField aria-label="示例权限" value={permission} onValueChange={setPermission} options={[{value:'ask',label:'询问'},{value:'read',label:'只读'}]} /></PopoverContent></Popover></C.ChatComposerActions><C.ChatComposerActions align="end">{busy ? <Button type="button" onClick={() => setBusy(false)}>停止演示</Button> : <Button type="submit" disabled={!text.trim()}>发送</Button>}</C.ChatComposerActions></C.ChatComposerFooter></C.ChatComposer></form><output aria-live="polite">{busy ? '演示运行中，可点击停止。' : sent ? `上次发送：${sent}` : 'Enter 发送，Shift + Enter 换行。'}</output></div>
}
