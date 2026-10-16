/*
 * [INPUT]: 内置注册表、当前已核源内容和宿主标题插槽；来源身份由上层key固定。
 * [OUTPUT]: 每次打开固定provider；通用标题位于正文加载/错误边界外，保留菜单与操作状态；隐藏卸载且不缓存正文。
 * [OUTPUT]: 查看器异步失败共用插件故障回报；关闭后的迟到回报忽略。
 * [POS]: common/file-preview插件视图宿主；权限/交付切版仍归原业务宿主。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PreviewRegistry } from './plugins/registry'
import type { PreviewRendererProps } from './plugins/types'

export function PreviewFrame({ name, kind, header, children }: {
  name: string; kind: string; header: ReactNode; children: ReactNode
}) {
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-label={`文件预览 ${name}`} data-file-preview-kind={kind}>
    {header}{children}
  </section>
}

class PreviewErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError?.() }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function ActivePreviewPluginView({ registry, ...props }: PreviewRendererProps & { registry: PreviewRegistry }) {
  // Registry changes apply on reopening, never in the middle of reading this fixed source.
  const [provider] = useState(() => registry.select(props.name, props.content.kind))
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const release = provider?.onOpen?.()
    return () => { mounted.current = false; release?.() }
  }, [provider])
  const reportFailure = useCallback(() => { if (mounted.current) provider?.onError?.() }, [provider])
  const frame = (body: ReactNode) => <PreviewFrame name={props.name} kind={props.content.kind} header={props.header()}>{body}</PreviewFrame>
  const message = (text: string) => <p role="status" className="field-hint">{text}</p>
  if (!provider) return frame(message(props.content.kind === 'unsupported' ? props.content.reason ?? '此文件暂不支持预览。' : '此格式的预览暂不可用。'))
  const Viewer = provider.Component
  const error = <div className="flex min-h-0 flex-1 flex-col" data-preview-plugin-error>{message('文件预览暂不可用。')}</div>
  const body = <PreviewErrorBoundary fallback={provider.ownsHeader ? frame(error) : error} onError={reportFailure}>
    <Suspense fallback={message('正在载入文件预览…')}><Viewer {...props} onPreviewError={reportFailure} header={provider.ownsHeader ? props.header : () => null} /></Suspense>
  </PreviewErrorBoundary>
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-preview-plugin={provider.manifest.id} data-preview-plugin-version={provider.manifest.version}>
    {provider.ownsHeader ? body : frame(body)}
  </div>
}

export function PreviewPluginView({ active, ...props }: PreviewRendererProps & { registry: PreviewRegistry; active: boolean }) {
  return active ? <ActivePreviewPluginView key={`${props.name}:${props.content.kind}`} {...props} /> : null
}
