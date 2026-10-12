/*
 * [INPUT]: 宿主已核验的图片data URI与显示名称。
 * [OUTPUT]: 可滚动静态图片及加载失败提示，不读取文件路径。
 * [POS]: 全局file-preview图片渲染器；来源与权限由调用方核验。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useState } from 'react'
import { ScrollFade } from '@/components/ui/scroll-fade'

export function ImageFilePreview({ name, url }: { name: string; url?: string }) {
  const [failed, setFailed] = useState<string>()
  return <ScrollFade className="min-h-0 flex-1 rounded-xl bg-card text-card-foreground soft-card" aria-label="材料图片">
    {url && failed !== url ? <img src={url} alt={name} className="max-h-full w-full object-contain p-2" draggable={false} onError={() => setFailed(url)} /> : <p role="status" className="field-hint p-3">图片预览暂不可用，请重新核对原件。</p>}
  </ScrollFade>
}
