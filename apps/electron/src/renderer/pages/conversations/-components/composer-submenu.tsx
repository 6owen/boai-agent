/*
 * [INPUT]: Composer 的二级菜单选项。
 * [OUTPUT]: 统一面板宽高，内部滚动列表使用 shadcn Scroll Fade。
 * [POS]: 加号菜单共用的二级菜单内容。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import type { ReactNode } from 'react'
import { DropdownMenuSubContent } from '@/components/ui/dropdown-menu'

export function ComposerSubmenuContent({ children }: { children: ReactNode }) {
  return <DropdownMenuSubContent className="grid grid-rows-[minmax(0,1fr)] w-[240px] max-w-[calc(100vw-16px)] max-h-[min(280px,var(--available-height))] overflow-hidden">
    <div className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain scroll-py-4 scroll-fade-y scroll-fade-4 [--scroll-fade-reveal:24px]">
      {children}
    </div>
  </DropdownMenuSubContent>
}
