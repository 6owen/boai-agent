/*
 * [INPUT]: Local library category visibility and explicit display choices.
 * [OUTPUT]: Shared category metadata, validated optional preferences and a single-line checkbox display menu.
 * [POS]: Library presentation only; resources, bindings and permissions remain with their existing owners.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Zap, Database, FileText, Plug, Contact, Sliders } from '@/components/icons'

export const libraryCategories = [
  { id: 'skills', label: '技能', icon: Zap },
  { id: 'sources', label: '数据源', icon: Database },
  { id: 'prompts', label: '提示词', icon: FileText },
  { id: 'applications', label: '应用', icon: Plug },
  { id: 'assistants', label: '助手', icon: Contact },
] as const
export type LibraryCategory = typeof libraryCategories[number]['id']
export const libraryVisibilityKey = 'boai.library.hiddenCategories'

export function readHiddenLibraryCategories(): LibraryCategory[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(libraryVisibilityKey) ?? '[]')
    const hidden = Array.isArray(saved) ? libraryCategories.filter(item => saved.includes(item.id)).map(item => item.id) : []
    return hidden.length === libraryCategories.length ? [] : hidden
  } catch { return [] }
}

export function LibraryDisplayMenu({ hidden, onChange }: { hidden: readonly LibraryCategory[]; onChange(category: LibraryCategory, visible: boolean): void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="显示资源库分类" title="显示分类" />}><Sliders /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44"><DropdownMenuGroup><DropdownMenuLabel>显示分类</DropdownMenuLabel>
      {libraryCategories.map(item => <DropdownMenuCheckboxItem key={item.id} className="whitespace-nowrap" checked={!hidden.includes(item.id)} disabled={!hidden.includes(item.id) && hidden.length === libraryCategories.length - 1} closeOnClick={false} onCheckedChange={visible => onChange(item.id, visible)}><item.icon />{item.label}</DropdownMenuCheckboxItem>)}
    </DropdownMenuGroup></DropdownMenuContent>
  </DropdownMenu>
}
