/*
 * [OUTPUT]: 搜索位于目录栏最右，外层仅负责32→240宽度过渡，内层沿原InputGroup方圆角皮肤，无胶囊裁切。
 * [INPUT]: 受控检索值与名称；已有transitions-dev Card resize。
 * [OUTPUT]: 默认图标按钮，点击展开并聚焦，空值失焦/Escape收起；保留键盘与减少动态效果。
 * [POS]: 目录工具栏共用检索控件，不持有目录数据。
 * [PROTOCOL]: 变化同步Header与.folder.md。
 */
import { useRef, useState } from 'react'
import { Button } from './button'
import { InputGroup, InputGroupInput } from './input-group'
import { Search } from '../icons'

export function CatalogSearch({ label, value, onChange, placeholder = '搜索' }: { label: string; value: string; onChange(value: string): void; placeholder?: string }) {
  const [open, setOpen] = useState(false), input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null)
  return <div className="catalog-search t-resize" data-open={open} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !value) setOpen(false) }}><InputGroup>
    <Button ref={trigger} className={open ? 'bg-transparent hover:bg-transparent' : undefined} variant="ghost" size="icon-sm" aria-label={label} aria-expanded={open} onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()) }}><Search /></Button>
    <InputGroupInput ref={input} aria-label={label} aria-hidden={!open} tabIndex={open ? 0 : -1} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() } }} />
  </InputGroup></div>
}
