/*
 * [INPUT]: 宿主已核源的有限预览DTO与内部React视图。
 * [OUTPUT]: 内置只读预览插件合同；不提供路径、业务API或员工执行权。
 * [POS]: file-preview内部扩展点；不是第三方跨进程SDK或安全沙箱。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import type { ComponentType, ReactNode } from 'react'
import type { BinaryFilePreview, FilePreview } from '@shared/domain/file-preview'

export const PREVIEW_API_VERSION = 1
export type PreviewContent = Readonly<FilePreview> | Readonly<BinaryFilePreview> | { readonly kind: 'image'; readonly url?: string }
export type PreviewKind = Exclude<PreviewContent['kind'], 'unsupported'>

export interface PreviewRendererProps {
  readonly name: string
  readonly content: PreviewContent
  readonly line?: number
  readonly markdown?: ReactNode
  header(toggle?: ReactNode): ReactNode
}

export interface PreviewManifest {
  readonly id: string
  readonly version: string
  readonly apiVersion: number
  readonly kinds: readonly PreviewKind[]
  /** Optional exact suffixes without a dot. The verified content kind must also match. */
  readonly extensions?: readonly string[]
}

export type PreviewPlugin = {
  readonly manifest: PreviewManifest
  /** Existing synchronous viewers may compose header(toggle) with their own view state. */
  readonly ownsHeader?: boolean
} & (
  | { readonly component: ComponentType<PreviewRendererProps>; readonly load?: never }
  | { readonly component?: never; readonly load: () => Promise<{ default: ComponentType<PreviewRendererProps> }> }
)
