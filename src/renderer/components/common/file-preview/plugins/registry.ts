/*
 * [INPUT]: 构建期内置插件清单、查看组件/加载器与宿主禁用名单。
 * [OUTPUT]: 不可变注册快照、兼容诊断和确定选择；仅匹配的活跃视图触发import，并回报宿主使用/故障。
 * [POS]: 预览注册表；缓存组件定义，不保存文件正文或业务身份。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { lazy, type ComponentType } from 'react'
import { PREVIEW_API_VERSION, type PreviewContent, type PreviewManifest, type PreviewPlugin, type PreviewRendererProps } from './types'

export interface RegisteredPreview {
  readonly manifest: PreviewManifest
  readonly Component: ComponentType<PreviewRendererProps>
  readonly ownsHeader: boolean
  readonly onOpen?: () => () => void
  readonly onError?: () => void
}
export interface PreviewRegistry {
  readonly diagnostics: readonly { readonly id: string; readonly reason: 'disabled' | 'incompatible' }[]
  select(name: string, kind: PreviewContent['kind']): RegisteredPreview | undefined
}

export function createPreviewRegistry(plugins: readonly PreviewPlugin[], disabledIds: ReadonlySet<string> = new Set(), observer?: { open(id: string): () => void; error(id: string): void }): PreviewRegistry {
  const ids = new Set<string>()
  const entries: RegisteredPreview[] = []
  const diagnostics: { id: string; reason: 'disabled' | 'incompatible' }[] = []
  for (const plugin of plugins) {
    const { id } = plugin.manifest
    if (!id.trim() || ids.has(id)) throw new Error(`Invalid or duplicate preview plugin id: ${id}`)
    ids.add(id)
    if (disabledIds.has(id) || plugin.manifest.apiVersion !== PREVIEW_API_VERSION) {
      diagnostics.push({ id, reason: disabledIds.has(id) ? 'disabled' : 'incompatible' })
      continue
    }
    const manifest = Object.freeze({ ...plugin.manifest,
      kinds: Object.freeze([...plugin.manifest.kinds]),
      extensions: plugin.manifest.extensions && Object.freeze(plugin.manifest.extensions.map(value => value.toLowerCase())),
    })
    // React.lazy caches code, never document data. Construct once so progress events cannot remount a viewer.
    if (plugin.load && plugin.ownsHeader) throw new Error(`Lazy preview must use the host header: ${id}`)
    entries.push(Object.freeze({ manifest, Component: plugin.component ?? lazy(plugin.load), ownsHeader: plugin.ownsHeader === true,
      ...(observer ? { onOpen: () => observer.open(id), onError: () => observer.error(id) } : {}),
    }))
  }
  // Exact suffix contributions precede general kind viewers; ties use stable ids, never registration timing.
  entries.sort((a, b) => Number(Boolean(b.manifest.extensions)) - Number(Boolean(a.manifest.extensions))
    || (a.manifest.id < b.manifest.id ? -1 : a.manifest.id > b.manifest.id ? 1 : 0))
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics.map(value => Object.freeze(value))),
    select(name: string, kind: PreviewContent['kind']) {
      if (kind === 'unsupported') return undefined
      const dot = name.lastIndexOf('.')
      const extension = dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
      return entries.find(({ manifest }) => manifest.kinds.includes(kind)
        && (!manifest.extensions || manifest.extensions.includes(extension)))
    },
  })
}
