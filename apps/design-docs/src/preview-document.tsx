/*
 * [INPUT]: 公共示例目录、BOAI组件及共享字体/主题。
 * [OUTPUT]: 按需加载的独立文档预览与真实源码。
 * [POS]: 设计站展示层，无业务API。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { typographyControls, typographyDefaults, typographyVariables, type TypographyGroup } from '@boai/tokens'
import { Toaster } from '@boai/ui/sonner'
import { ExampleContent } from './examples'
export function PreviewDocument() {
 const { search } = useLocation(), params = new URLSearchParams(search), root = useRef<HTMLDivElement>(null)
 const name = params.get('example') ?? '', mode = params.get('mode') === 'dark' ? 'dark' : 'light'
 useLayoutEffect(() => {
  const values = new URLSearchParams(search)
  const size = (key: TypographyGroup) => {
   const control = typographyControls[key], value = Number(values.get(key) ?? control.defaultSize)
   return Number.isFinite(value) ? Math.max(control.min,Math.min(control.max,value)) : control.defaultSize
  }
  const preferences = {
   ui: {...typographyDefaults.ui,sizePx:size('ui')},
   content: {...typographyDefaults.content,sizePx:size('content')},
   code: {...typographyDefaults.code,sizePx:size('code')},
  }
  const variables = typographyVariables(preferences)
  for (const [key,value] of Object.entries(variables)) document.documentElement.style.setProperty(key,value)
  return () => { for(const key of Object.keys(variables)) document.documentElement.style.removeProperty(key) }
 }, [search])
 useLayoutEffect(() => {
  const element = root.current
  if (!element) return
  const report = () => window.parent.postMessage({type:'boai:preview-size',height:Math.ceil(element.getBoundingClientRect().height)+48},location.origin)
  const observer = new ResizeObserver(report); observer.observe(element); report()
  return () => observer.disconnect()
 }, [])
 return <><title>{name} · BOAI 组件预览</title><div ref={root} className="preview-document" data-example={name}><ExampleContent name={name} /></div><Toaster theme={mode} /></>
}
