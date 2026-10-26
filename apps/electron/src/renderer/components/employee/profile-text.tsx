/*
 * [INPUT]: 员工身份文本、原资料页标题/描述标签、长度限制与失焦保存回调。
 * [OUTPUT]: 保持原文字排版的纯文本直接编辑，正常输入不重置光标，兼容中文组合输入、单行内容及长度限制。
 * [POS]: 员工资料页的可编辑姓名/描述，不引入表单输入框皮肤或自行持久化。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useLayoutEffect, useRef } from 'react'

export function ProfileText({ as: Tag, label, value, placeholder, maxLength, disabled, onChange, onBlur }: {
  as: 'h1' | 'p'; label: string; value: string; placeholder: string; maxLength: number; disabled: boolean
  onChange(value: string): void; onBlur?(): void
}) {
  const ref = useRef<HTMLHeadingElement & HTMLParagraphElement>(null)
  const composing = useRef(false)
  useLayoutEffect(() => {
    if (ref.current && !composing.current && ref.current.textContent !== value) ref.current.textContent = value
  }, [value])
  const update = (element: HTMLElement) => {
    if (disabled || composing.current) return
    const text = (element.textContent ?? '').replace(/[\r\n]+/g, ' ').slice(0, maxLength)
    if (element.textContent !== text) {
      element.textContent = text
      const range = document.createRange()
      range.selectNodeContents(element); range.collapse(false)
      const selection = window.getSelection()
      selection?.removeAllRanges(); selection?.addRange(range)
    }
    onChange(text)
  }
  return <Tag ref={ref} className="contact-profile-text" role="textbox" aria-label={label} aria-multiline="false" aria-disabled={disabled} tabIndex={disabled ? -1 : 0} contentEditable={disabled ? false : 'plaintext-only'} suppressContentEditableWarning data-placeholder={placeholder}
    onInput={event => update(event.currentTarget)} onBlur={onBlur}
    onCompositionStart={() => { composing.current = true }}
    onCompositionEnd={event => { composing.current = false; update(event.currentTarget) }}
    onKeyDown={event => { if (event.key === 'Enter' && !composing.current && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur() } }}
  />
}
