/*
 * [INPUT]: React、BOAI共享组件及调用方传入的展示状态。
 * [OUTPUT]: 可在桌面与独立站点共用的展示组件。
 * [POS]: @boai/ui，无业务服务或桌面依赖。
 * [PROTOCOL]: 修改时同步Header和所属目录.folder.md。
 */
import type { ReactNode } from 'react'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from './empty'
export function IllustratedEmptyView({ src, alt, title, children }: { src: string; alt: string; title?: string; children?: ReactNode }) {
  return <Empty className="illustrated-empty h-full min-h-64"><EmptyHeader><EmptyMedia><img className="empty-illustration select-none" draggable={false} src={src} width={240} height={184} alt={alt} /></EmptyMedia>{title && <EmptyTitle>{title}</EmptyTitle>}</EmptyHeader>{children}</Empty>
}
