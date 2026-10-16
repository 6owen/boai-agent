/*
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: 可选DesktopApi、明确材料身份/版本/hash/解析版本、页面活跃状态和受控图片预览开关。
 * [OUTPUT]: 宿主核对后的静态图片data URI与加载/失败状态；无API明确不可用，隐藏立即卸载Portal/焦点锁，清理、版本变化及迟到读取隔离，普通changed仅后台核对不闪图；全屏深色预览支持关闭/Esc/遮罩关闭和焦点恢复，不提供编辑或下载。
 * [POS]: 会话图片草稿/消息缩略图和全屏预览共用的读取边界；不直接读取路径、不创建object URL或持久保存图片字节。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { ErrorToast } from '@/components/common/error-feedback'
import { useEffect, useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import type { ConversationMaterial } from '@shared/domain/materials'
import type { DesktopApi } from '@shared/ipc'
import { LoaderCircle, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { materialDisplayName, materialErrorText, materialImageUrl } from './material-draft'

export interface MaterialImageState { url?: string; loading: boolean; error?: string }

export function useMaterialImage(api?: DesktopApi, material?: ConversationMaterial, active = true): MaterialImageState {
  const id = material?.id, revision = material?.revision, hash = material?.contentHash, parseVersion = material?.parseVersion, conversationId = material?.conversationId
  const key = material ? `${id}:${revision}:${hash ?? ''}:${parseVersion}` : ''
  const ready = material?.format === 'image' && material.status === 'ready'
  const [state, setState] = useState<(MaterialImageState & { key: string })>()
  useEffect(() => {
    setState(undefined)
    if (!api || !ready || !active || !id || revision === undefined) return
    let disposed = false, cleared = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (disposed || cleared) return
      const token = ++request
      try {
        const result = await api.request('getMaterialPreview', { id, expectedRevision: revision })
        if (disposed || cleared || token !== request) return
        const url = materialImageUrl(result)
        const current = result.material.id === id && result.material.revision === revision && result.material.contentHash === hash && result.material.parseVersion === parseVersion
        setState(current && url ? { key, url, loading: false } : { key, loading: false, error: '图片原件已变化或不可用，请重新核对。' })
      } catch (failure) {
        if (!disposed && !cleared && token === request) setState({ key, loading: false, error: materialErrorText(failure instanceof Error ? failure.message : String(failure)) })
      }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) {
        cleared = true; request++; clearTimeout(timer); timer = undefined
        setState({ key, loading: false, error: '来源聊天已清理或移除，图片不可用。' }); return
      }
      if (event.type !== 'changed' || event.conversationId && event.conversationId !== conversationId) return
      request++
      if (!cleared && !timer) timer = setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, ready, active, id, revision, hash, parseVersion, conversationId, key])
  if (!active || !material || material.format !== 'image') return { loading: false }
  if (!ready) return material.status === 'preparing' ? { loading: true } : { loading: false, error: materialErrorText(material.error ?? '图片暂不可用。') }
  if (!api) return { loading: false, error: '当前环境无法读取图片。' }
  return state?.key === key ? { url: state.url, loading: state.loading, error: state.error } : { loading: true }
}

export interface MaterialImageDialogProps {
  api?: DesktopApi
  material?: ConversationMaterial
  open: boolean
  active?: boolean
  onOpenChange(open: boolean): void
}

export function MaterialImageDialog({ api, material, open, active = true, onOpenChange }: MaterialImageDialogProps) {
  const image = useMaterialImage(api, material, open && active)
  const key = `${material?.id ?? ''}:${material?.revision ?? ''}`
  const [failedImage, setFailedImage] = useState<string>()
  useEffect(() => { setFailedImage(undefined) }, [open, active, key])
  const name = materialDisplayName(material?.name ?? '图片')
  const url = failedImage === key ? undefined : image.url
  const error = failedImage === key ? '图片无法显示，请重新打开以核对原件。' : image.error
  return <Dialog open={open && active} onOpenChange={onOpenChange}>
    {active && <DialogPortal>
      <DialogOverlay className="bg-black/90" />
      <DialogPrimitive.Popup className="dark fixed inset-0 z-50 flex items-center justify-center p-6 text-foreground outline-none [--foreground:var(--soft-thumb)]" finalFocus onClick={event => { if (event.target === event.currentTarget) onOpenChange(false) }}>
        <DialogTitle className="sr-only">图片预览 {name}</DialogTitle>
        <DialogClose render={<Button variant="ghost" size="icon-sm" round className="absolute top-4 right-4" aria-label="关闭图片预览" />}><X /></DialogClose>
        {url ? <img src={url} alt={name} className="max-h-[calc(100vh-3rem)] max-w-full object-contain" draggable={false} onError={() => setFailedImage(key)} /> : image.loading ? <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="spinner" />正在载入图片…</p> : <ErrorToast>{error ?? '图片暂不可用。'}</ErrorToast>}
      </DialogPrimitive.Popup>
    </DialogPortal>}
  </Dialog>
}
