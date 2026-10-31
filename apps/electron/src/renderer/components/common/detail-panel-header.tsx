/*
 * [INPUT]: Detail title and shared controls.
 * [OUTPUT]: One header layout for resource details and employee tasks.
 * [POS]: Shared detail-panel presentation.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import type { ReactNode } from 'react'
export function DetailPanelHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return <header className="chat-header skill-detail-title"><h2 className="chat-title">{title}</h2><div className="chat-header-actions">{actions}</div></header>
}
