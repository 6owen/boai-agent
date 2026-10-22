/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useRef, useState } from 'react'
import { Button } from '@boai/ui/button'
import { SelectionActions } from '@boai/ui/selection-actions'
export default function Selection() {
 const target = useRef<HTMLParagraphElement>(null)
 const [anchor,setAnchor] = useState<DOMRect>(), [open,setOpen] = useState(false), [prompt,setPrompt] = useState(''), [result,setResult] = useState(''), [busy,setBusy] = useState(false)
 const show = () => { if (target.current) { setAnchor(target.current.getBoundingClientRect()); setOpen(true) } }
 return <div className="example-stack"><p ref={target} onMouseUp={() => { const selection = window.getSelection(); if (selection && !selection.isCollapsed && selection.rangeCount) { setAnchor(selection.getRangeAt(0).getBoundingClientRect()); setOpen(true) } }}>选择这段文字，展开选文工具条，或使用下面的按钮通过键盘打开。</p><Button onClick={show}>打开选文操作</Button><Button variant="secondary" disabled={!busy} onClick={() => { setBusy(false); setOpen(false) }}>结束演示</Button>{anchor && <SelectionActions anchor={anchor} open={open} onOpenChange={setOpen} prompt={prompt} onPromptChange={setPrompt} busy={busy} onAction={instruction => { setResult(instruction); setBusy(true) }} />}<output>{result ? `演示指令：${result}` : '此预览不会修改文件或调用员工。'}</output></div>
}
