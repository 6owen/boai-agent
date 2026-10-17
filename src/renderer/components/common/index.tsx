/*
 * [OUTPUT]: ResourcePicker可提供独立详情入口，查看不切换勾选；网关就绪沿公开标识/真实凭据核对。
 * [OUTPUT]: Magpie本机公开标识和远程密钥分别判断已配置状态。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: React、图标、语义外观 token 与共享领域类型、统一 UI 基础组件与 Sonner 操作提示。
 * [OUTPUT]: useMutation和旧Banner错误统一使用Sonner，不渲染内联报错；状态提示与恢复操作独立保留，共用字段/头像/编辑框架与未保存守卫。
 * [POS]: src/renderer/components/common/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { gatewayCredentialsReady } from '@shared/domain/model-gateway'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field as UiField, FieldLabel, FieldDescription } from '@/components/ui/field'
import { createContext, cloneElement, isValidElement, useCallback, useId, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, LoaderCircle, X } from '@/components/icons/index'
import type { Connection, Resource } from '@shared/domain'
import type { AgentAvatar } from '@shared/domain/avatars'
import { avatarSource } from '@/assets/avatars'
import { ErrorToast, showErrorToast } from './error-feedback'
export { ErrorToast, showErrorToast } from './error-feedback'

export const colors = ['#6675a4', '#438b80', '#ad8054', '#638ac5', '#a76c90', '#777b8d']
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:)?\s*/, '').replace(/^Error:\s*/, '')
export const connectionReady = (connection: Connection) => Boolean(connection.defaultModel.trim() && (connection.gateway ? gatewayCredentialsReady(connection) : connection.provider === 'openai-compatible' ? connection.baseUrl.trim() : connection.hasApiKey))
export const timeText = (date: string) => new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
export const sizeText = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
export interface Guard { dirty: boolean; setDirty(value: boolean): void; navigate(action: () => void, options?: { resetOnDiscard?: boolean }): void; saved(fallback?: () => void): void }
export const GuardContext = createContext<Guard>({ dirty: false, setDirty() {}, navigate(fn) { fn() }, saved(fn) { fn?.() } })
export function useDirty(value: unknown) {
  const guard = useContext(GuardContext)
  const initial = useRef(JSON.stringify(value))
  const serialized = JSON.stringify(value)
  useEffect(() => { guard.setDirty(serialized !== initial.current) }, [serialized, guard.setDirty])
  useEffect(() => () => guard.setDirty(false), [guard.setDirty])
  return () => { initial.current = serialized; guard.setDirty(false) }
}
export function Avatar({ name, color = colors[0], small = false, avatar, seed = name }: { name: string; color?: string; small?: boolean; avatar?: AgentAvatar; seed?: string }) {
  const source = avatarSource(avatar, seed), [failedSource, setFailedSource] = useState<string | null>(null)
  return <span className={`avatar${small ? ' small' : ''}`} style={{ background: avatar?.kind === 'image' && failedSource !== source ? `${color}18` : 'transparent', '--avatar-color': color } as CSSProperties} aria-hidden="true"><img src={failedSource === source ? avatarSource(undefined, seed) : source} alt="" draggable={false} onError={() => setFailedSource(source)} /></span>
}
export function Banner({ children, kind = 'error', onClose }: { children: ReactNode; kind?: 'error' | 'notice'; onClose?: () => void }) {
  if (kind === 'error') return <ErrorToast onClose={onClose}>{children}</ErrorToast>
  return <div className="banner notice" role="status"><span>{children}</span>{onClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭提示"><X size={15} /></Button>}</div>
}
export function Field({ label, hint, children, full = false }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  const id = useId(), hintId = `${id}-hint`
  const element = isValidElement<{ id?: string; 'aria-label'?: string; 'aria-describedby'?: string }>(children) ? children : null
  const controlId = element?.props.id ?? id
  const control = element ? cloneElement(element, {
    id: controlId,
    'aria-label': element.props['aria-label'] ?? label,
    'aria-describedby': [element.props['aria-describedby'], hint ? hintId : undefined].filter(Boolean).join(' ') || undefined,
  }) : children
  return <UiField className={full ? 'full' : undefined}><FieldLabel htmlFor={controlId}>{label}</FieldLabel>{control}{hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}</UiField>
}
export function EditorFrame({ title, description, children, footer, leading }: { leading?: ReactNode; title?: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return <section className="editor-frame"><div className="editor-scroll">{leading}{(title || description) && <div className="editor-intro">{title && <h3>{title}</h3>}{description && <p>{description}</p>}</div>}<div className="editor-body">{children}</div></div>{footer && <footer className="editor-footer">{footer}</footer>}</section>
}
export function ResourcePicker({ resources, selected, onChange, empty, onOpen }: { resources: Resource[]; selected: string[]; onChange: (ids: string[]) => void; empty: string; onOpen?(resource: Resource): void }) {
  if (!resources.length) return <p className="empty-note">{empty}</p>
  return <div className="resource-picker">{resources.map(resource => <div className="flex min-w-0 items-center gap-1" key={resource.id}><label className="resource-option min-w-0 flex-1"><Checkbox checked={selected.includes(resource.id)} onCheckedChange={checked => onChange(checked ? [...selected, resource.id] : selected.filter(id => id !== resource.id))} /><span><strong>{resource.name}</strong><small>{resource.description || resource.path}</small></span></label>{onOpen && <Button type="button" variant="ghost" size="icon-xs" aria-label={`查看${resource.kind === 'skill' ? '技能' : '知识资料'} ${resource.name}`} title="查看详情" onClick={() => onOpen(resource)}><ArrowRight /></Button>}</div>)}</div>
}
export function useMutation() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const inFlight = useRef(false)
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { await fn() } catch (e) { const message = errorText(e); setError(message); showErrorToast(message) } finally { inFlight.current = false; setBusy(false) }
  }, [])
  return { busy, error, run, setError }
}
export function Loading({ children = '正在读取…' }: { children?: ReactNode }) { return <div className="inline-loading" role="status"><LoaderCircle size={16} className="spinner" />{children}</div> }
