// @vitest-environment jsdom
/*
 * [INPUT]: 公共编辑守卫与受控宿主保存/放弃回执。
 * [OUTPUT]: 异步导航只执行最新意图、失败保持确认、未知放弃不离页及卸载后迟到回执隔离。
 * [POS]: 共享组件迁移与快捷键自动保存整合回归。
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useEditorGuard } from '../packages/ui/src/components/use-editor-guard'

let host: HTMLDivElement, root: Root, guard: ReturnType<typeof useEditorGuard>
type Options = Parameters<typeof useEditorGuard>[0]
function Harness(props: Options) { guard = useEditorGuard(props); return guard.confirmation }
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name)!
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('保存回执仅放行最新导航，保存通知和卸载都取消迟到导航', async () => {
  const pending = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()]
  let index = 0
  const first = vi.fn(), latest = vi.fn(), saved = vi.fn(), unmounted = vi.fn()
  await act(async () => root.render(h(Harness, { reset() {}, beforeNavigate: () => pending[index++]!.promise })))
  await act(async () => { guard.navigate(first); guard.navigate(latest) })
  expect(first).not.toHaveBeenCalled(); expect(latest).not.toHaveBeenCalled()
  await act(async () => pending[1]!.resolve()); await act(async () => pending[0]!.resolve())
  expect(first).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledTimes(1)
  await act(async () => { guard.navigate(saved); guard.saved() }); await act(async () => pending[2]!.resolve())
  expect(saved).not.toHaveBeenCalled()
  await act(async () => guard.navigate(unmounted)); await act(async () => root.render(h('div')))
  await act(async () => pending[3]!.resolve()); expect(unmounted).not.toHaveBeenCalled()
})

test('宿主保存失败保持原确认，取消不执行导航或重置', async () => {
  const reset = vi.fn(), navigate = vi.fn()
  await act(async () => root.render(h(Harness, { reset, beforeNavigate: async () => { throw new Error('保存失败') } })))
  await act(async () => guard.navigate(navigate))
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull(); expect(navigate).not.toHaveBeenCalled()
  await act(async () => button('取消').click())
  await vi.waitFor(async () => { await act(async () => {}); expect(document.querySelector('[role=alertdialog]')).toBeNull() })
  expect(navigate).not.toHaveBeenCalled(); expect(reset).not.toHaveBeenCalled()
})

test('宿主未决修改先核对放弃；否定回执保留确认，重复点击不重复核对', async () => {
  const reset = vi.fn(), navigate = vi.fn(), receipt = deferred<boolean>()
  const discard = vi.fn(() => receipt.promise)
  await act(async () => root.render(h(Harness, { reset, hasPendingChanges: () => true, beforeDiscard: discard })))
  await act(async () => guard.navigate(navigate)); await act(async () => { button('退出').click(); button('退出').click() })
  expect(discard).toHaveBeenCalledTimes(1); expect(navigate).not.toHaveBeenCalled()
  await act(async () => receipt.resolve(false))
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull(); expect(reset).not.toHaveBeenCalled()
  discard.mockImplementation(async () => true)
  await act(async () => button('退出').click())
  expect(navigate).toHaveBeenCalledTimes(1); expect(reset).toHaveBeenCalledTimes(1)
})

test('放弃核对期间卸载，迟到成功不再重置或导航', async () => {
  const reset = vi.fn(), navigate = vi.fn(), receipt = deferred<boolean>()
  await act(async () => root.render(h(Harness, { reset, hasPendingChanges: () => true, beforeDiscard: () => receipt.promise })))
  await act(async () => guard.navigate(navigate)); await act(async () => button('退出').click())
  await act(async () => root.render(h('div'))); await act(async () => receipt.resolve(true))
  expect(navigate).not.toHaveBeenCalled(); expect(reset).not.toHaveBeenCalled()
})
