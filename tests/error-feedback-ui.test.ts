// @vitest-environment jsdom
/*
 * [INPUT]: 实际React StrictMode、共用错误组件/useMutation和Sonner状态。
 * [OUTPUT]: 错误无内联DOM、重复渲染不刷屏；操作失败保留草稿/解锁/可重试，显式重试重新通知。
 * [POS]: 全局错误反馈回归；实际桌面另验toast与保存恢复。
 * [PROTOCOL]: 变化同步Header及tests/.folder.md。
 */
import { act, createElement as h, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import { Banner, useMutation } from '../src/renderer/components/common'
import { ErrorToast } from '../src/renderer/components/common/error-feedback'
import { FieldError } from '../src/renderer/components/ui/field'
import { Alert, AlertDescription } from '../src/renderer/components/ui/alert'

let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  toast.dismiss(); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); toast.dismiss(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('legacy Banner, field and destructive alert errors only create one Sonner toast in StrictMode', async () => {
  const notify = vi.spyOn(toast, 'error')
  const render = () => root.render(h(StrictMode, null,
    h(Banner, null, '读取失败'), h(FieldError, { errors: [{ message: '读取失败' }] }),
    h(Alert, { variant: 'destructive' }, h(AlertDescription, null, '读取失败'))))
  await act(render); await act(render)
  expect(host.innerHTML).toBe('')
  expect(toast.getToasts().filter(t => 'title' in t && t.title === '读取失败')).toHaveLength(1)
  expect(notify).toHaveBeenCalledTimes(1)
})

test('failed mutations keep the draft, unlock retry and can succeed without an inline error', async () => {
  let calls = 0
  function Form() {
    const { busy, error, run } = useMutation(), [draft] = useState('天气预报'), [saved, setSaved] = useState(false)
    return h('form', { onSubmit: event => { event.preventDefault(); void run(async () => { if (++calls < 3) throw new Error('保存失败'); setSaved(true) }) } },
      h('input', { value: draft, readOnly: true }), error && h(Banner, null, error),
      h('button', { type: 'submit', disabled: busy }, saved ? '已保存' : '保存'))
  }
  const notify = vi.spyOn(toast, 'error')
  await act(async () => root.render(h(Form)))
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => host.querySelector('button')!.click())
    expect(host.querySelector('input')!.value).toBe('天气预报')
    expect(host.textContent).toBe('保存')
    expect(host.querySelector('button')!.disabled).toBe(false)
    expect(toast.getToasts().filter(t => 'title' in t && t.title === '保存失败')).toHaveLength(1)
  }
  expect(notify).toHaveBeenCalledTimes(2)
  await act(async () => host.querySelector('button')!.click())
  expect(calls).toBe(3); expect(host.textContent).toBe('已保存')
})

test('state errors update the toast without mounting error text or losing recovery actions', async () => {
  const retry = vi.fn()
  const render = (error: string) => root.render(h('section', null, h(ErrorToast, null, error), h('button', { onClick: retry }, '核对创建结果')))
  await act(async () => render('回执暂不可读'))
  await act(async () => host.querySelector('button')!.click())
  expect(retry).toHaveBeenCalledOnce(); expect(host.textContent).toBe('核对创建结果')
  await act(async () => render('回执核对失败'))
  expect(toast.getToasts().some(t => 'title' in t && t.title === '回执核对失败')).toBe(true)
  expect(host.querySelector('[role=alert]')).toBeNull()
})
