/*
 * [INPUT]: React、图标、语义外观 token 与共享领域类型、统一 UI 基础组件。
 * [OUTPUT]: 组合统一 UI 的字段标签/说明、复选框与按钮，以及格式化和未保存守卫。
 * [POS]: src/renderer/components/common/index.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field as UiField, FieldLabel, FieldDescription } from '@/components/ui/field'
import { createContext, cloneElement, isValidElement, useId, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { LoaderCircle, X } from '@/components/icons/index'
import type { Connection, Resource } from '@shared/domain'

export const colors = ['#6675a4', '#438b80', '#ad8054', '#638ac5', '#a76c90', '#777b8d']
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:)?\s*/, '').replace(/^Error:\s*/, '')
export const connectionReady = (connection: Connection) => Boolean(connection.defaultModel.trim() && (connection.provider === 'openai-compatible' ? connection.baseUrl.trim() : connection.hasApiKey))
export const timeText = (date: string) => new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
export const sizeText = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
export interface Guard { dirty: boolean; setDirty(value: boolean): void; navigate(action: () => void): void; saved(fallback?: () => void): void }
export const GuardContext = createContext<Guard>({ dirty: false, setDirty() {}, navigate(fn) { fn() }, saved(fn) { fn?.() } })
export function useDirty(value: unknown) {
  const guard = useContext(GuardContext)
  const initial = useRef(JSON.stringify(value))
  const serialized = JSON.stringify(value)
  useEffect(() => { guard.setDirty(serialized !== initial.current) }, [serialized, guard.setDirty])
  useEffect(() => () => guard.setDirty(false), [guard.setDirty])
  return () => { initial.current = serialized; guard.setDirty(false) }
}
export function Avatar({ name, color = colors[0], small = false }: { name: string; color?: string; small?: boolean }) {
  return <span className={`avatar${small ? ' small' : ''}`} style={{ background: `${color}18`, '--avatar-color': color } as CSSProperties} aria-hidden="true">{name.slice(0, 1)}</span>
}
export function Banner({ children, kind = 'error', onClose }: { children: ReactNode; kind?: 'error' | 'notice'; onClose?: () => void }) {
  return <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><span>{children}</span>{onClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭提示"><X size={15} /></Button>}</div>
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
export function EditorFrame({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return <section className="editor-frame"><div className="editor-intro"><h3>{title}</h3>{description && <p>{description}</p>}</div><div className="editor-body">{children}</div>{footer && <footer className="editor-footer">{footer}</footer>}</section>
}
export function ResourcePicker({ resources, selected, onChange, empty }: { resources: Resource[]; selected: string[]; onChange: (ids: string[]) => void; empty: string }) {
  if (!resources.length) return <p className="empty-note">{empty}</p>
  return <div className="resource-picker">{resources.map(resource => <label className="resource-option" key={resource.id}><Checkbox checked={selected.includes(resource.id)} onCheckedChange={checked => onChange(checked ? [...selected, resource.id] : selected.filter(id => id !== resource.id))} /><span><strong>{resource.name}</strong><small>{resource.description || resource.path}</small></span></label>)}</div>
}
export function useMutation() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const inFlight = useRef(false)
  const run = async (fn: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { await fn() } catch (e) { setError(errorText(e)) } finally { inFlight.current = false; setBusy(false) }
  }
  return { busy, error, run, setError }
}
export function Loading({ children = '正在读取…' }: { children?: ReactNode }) { return <div className="inline-loading" role="status"><LoaderCircle size={16} className="spinner" />{children}</div> }
