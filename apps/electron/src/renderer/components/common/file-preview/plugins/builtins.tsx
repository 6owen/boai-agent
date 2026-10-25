/*
 * [INPUT]: 内置只读预览合同与现有文本/图片/Lody查看器。
 * [OUTPUT]: 从统一应用插件目录取得四个预览声明，装配原组件；大查看器按需加载，业务页面无需格式分支。
 * [OUTPUT]: 图片真实加载失败同样沿宿主有界故障回报。
 * [POS]: BOAI受审内置预览插件目录；不发现或执行外部包。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { TextFilePreview } from '../text-preview'
import { ImageFilePreview } from '../image-preview'
import { createPreviewRegistry } from './registry'
import type { PreviewPlugin } from './types'
import { previewManifest } from '@boai/shared/plugins/catalog'

export const builtinPreviewPlugins: readonly PreviewPlugin[] = [
  {
    manifest: previewManifest('boai.preview.text'),
    ownsHeader: true,
    component: ({ content, name, line, markdown, header }) => {
      if (!('text' in content) || content.kind === 'unsupported') return null
      return <TextFilePreview name={name} text={content.text} kind={content.kind} language={content.language} line={line} markdown={markdown} header={header} />
    },
  },
  {
    manifest: previewManifest('boai.preview.image'),
    component: ({ content, name, onPreviewError }) => content.kind === 'image' ? <ImageFilePreview name={name} url={content.url} onPreviewError={onPreviewError} /> : null,
  },
  {
    manifest: previewManifest('boai.preview.pdf'),
    load: () => import('./pdf'),
  },
  {
    manifest: previewManifest('boai.preview.office'),
    load: () => import('./office'),
  },
]

export const builtinPreviewRegistry = createPreviewRegistry(builtinPreviewPlugins)
