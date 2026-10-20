/*
 * [INPUT]: 保留挂载页面/详情的可见状态，以及Base UI浮层关闭和卸载接口。
 * [OUTPUT]: 隐藏作用域立即移除Portal并关闭原浮层；再次显示不恢复旧展开状态，嵌套作用域继承隐藏状态。
 * [POS]: UI浮层生命周期边界，不卸载页面正文或重置业务草稿。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属目录.folder.md。
 */
import { createContext, useContext, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'

const FloatingLayerActive = createContext(true)
type FloatingLayerActions = { close(): void; unmount(): void }

export function FloatingLayerScope({ active, children }: { active: boolean; children?: ReactNode }) {
  const parentActive = useContext(FloatingLayerActive)
  return <FloatingLayerActive.Provider value={active && parentActive}>{children}</FloatingLayerActive.Provider>
}

export const useFloatingLayerActive = () => useContext(FloatingLayerActive)

export function useFloatingLayerActions<T extends FloatingLayerActions>(external?: RefObject<T | null>) {
  const active = useFloatingLayerActive(), local = useRef<T | null>(null)
  const actions = external ?? local
  useLayoutEffect(() => {
    if (active) return
    const layer = actions.current
    layer?.close()
    // Let controlled open=false commit before forcing Base UI's exit cleanup.
    let current = true
    queueMicrotask(() => { if (current) layer?.unmount() })
    return () => { current = false }
  }, [active, actions])
  return actions
}
