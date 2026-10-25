/*
 * [INPUT]: 分享图片首次就绪、弹窗可见状态、真实 DOM 与原版 transitions.dev 运行时。
 * [OUTPUT]: 内容首帧隐藏，原版动画接管后解除准备态；全屏弹窗始终可见，点阵层移入弹窗并仅渐显内容；取消恢复内容且不改变 Canvas 原件。
 * [POS]: 个人资料分享局部动效生命周期，不参与业务读取或保存。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { generate } from './generation/ui-generation.js'

export function useShareGeneration(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null), played = useRef(false)
  const [pending, setPending] = useState(true)
  useLayoutEffect(() => {
    const element = ref.current
    const dialog = element?.closest<HTMLElement>('.profile-share-dialog')
    if (!ready || played.current || !element || !dialog) return
    let disposed = false, frame = 0, run: ReturnType<typeof generate> | undefined
    const opacity = element.style.opacity
    element.style.opacity = '0'
    const cancel = () => {
      disposed = true
      cancelAnimationFrame(frame)
      run?.cancel()
      element.style.opacity = opacity
      setPending(false)
    }
    const onScroll = (event: Event) => {
      // Scrolling a nested child does not move the share content container.
      if (event.target instanceof Node && event.target !== element && element.contains(event.target)) return
      cancel()
    }
    // Keep the upstream drawing inside the modal's stacking/focus boundary.
    // Move it before paint, without changing the upstream animation or its timings.
    const layerObserver = new MutationObserver(() => {
      const layer = (element as HTMLElement & { __tGenLayer?: HTMLElement }).__tGenLayer
      if (!layer?.isConnected) return
      const target = element.getBoundingClientRect(), shell = dialog.getBoundingClientRect()
      layer.style.left = `${target.left - shell.left - dialog.clientLeft + dialog.scrollLeft}px`
      layer.style.top = `${target.top - shell.top - dialog.clientTop + dialog.scrollTop}px`
      dialog.append(layer)
      layerObserver.disconnect()
    })
    // Finish the drawing if its target moves or is used.
    const observer = new ResizeObserver(() => {
      if (!run) return
      const rect = element.getBoundingClientRect()
      if (rect.width !== width || rect.height !== height) cancel()
    })
    let width = 0, height = 0
    const detach = () => {
      observer.disconnect()
      layerObserver.disconnect()
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', cancel)
      window.removeEventListener('pointerdown', cancel, true)
      element.removeEventListener('focusin', cancel)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', cancel)
    window.addEventListener('pointerdown', cancel, true)
    element.addEventListener('focusin', cancel)
    void document.fonts.ready.then(async () => {
      // Measure only after the fullscreen shell has finished entering.
      await Promise.all(dialog.getAnimations().map(animation => animation.finished.catch(() => {})))
      if (disposed) return
      frame = requestAnimationFrame(() => {
        if (disposed) return
        element.style.opacity = opacity
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height) { cancel(); return }
        width = rect.width; height = rect.height
        layerObserver.observe(document.body, { childList: true })
        run = generate(element, { mode: 'skeleton', keys: 0 })
        // generate() synchronously owns inline opacity before preparation CSS is removed.
        setPending(false)
        played.current = true
        observer.observe(element)
        void run.finished.then(detach)
      })
    }).catch(cancel)
    return () => { cancel(); detach() }
  }, [ready])
  return { ref, pending }
}
