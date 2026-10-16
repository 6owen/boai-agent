/*
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: 草稿条目、已发送附件回执、页面活跃状态及宿主预览/移除/重试回调。
 * [OUTPUT]: 附件随当前聊天消息发送；未发送附件的真实导入状态、显性失败/未知回执核对与局部忙碌锁定；已发送文件整行可打开右侧预览，无单独收件人设置。
 * [OUTPUT]: 图片准备期即固定为composer内部缩略图，不先挂通用文件卡或等待文字，准备完成保持同一节点/尺寸；hover/focus右上角可删除，点击和已发图片打开全屏Dialog，图片不显示常驻文件名/预览横条；图片使用宿主核对的data URI缩略图；当前版本/清理/授权变化隔离旧图片和迟到读取，文件保持真实卡片，不持久化二进制正文或创建object URL，流式消息仅后台复核而不反复清空缩略图。
 * [POS]: 会话私有材料草稿条与消息内材料列表；不访问本机文件或自行宣布员工已读。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { ErrorToast } from '@/components/common/error-feedback'
import { useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { ConversationMaterial } from '@shared/domain/materials'
import { sizeText } from '@/components/common'
import { FileText, LoaderCircle, RefreshCw, X } from '@/components/icons'
import { Attachment, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import { MaterialImageDialog, useMaterialImage } from './material-image'
import { materialDisplayName, materialErrorText, materialFormatLabel, materialStatusLabels, type MaterialDraftItem } from './material-draft'

export type { MaterialDraftItem } from './material-draft'

interface MaterialDraftBarProps {
  api?: DesktopApi
  pageActive?: boolean
  items: MaterialDraftItem[]
  disabled?: boolean
  onRemove(item: MaterialDraftItem): void
  onRetry(item: MaterialDraftItem): void
  onPreview(material: ConversationMaterial): void
}

export function MaterialDraftBar({ api, pageActive = true, items, disabled, onRemove, onRetry, onPreview }: MaterialDraftBarProps) {
  const [image, setImage] = useState<ConversationMaterial>()
  const selectedImage = items.find(item => item.material?.id === image?.id)?.material
  if (!items.length) return null
  return <section className="flex min-w-0 flex-wrap items-start gap-3 pb-1" aria-label="待发送材料">
    {items.map(item => {
      const material = item.material, status = material?.status ?? item.status
      const ready = status === 'ready' && Boolean(material), failed = ['failed', 'unavailable', 'removed'].includes(status)
      const name = materialDisplayName(material?.name ?? item.name)
      const locked = disabled || item.busy
      if (material?.format === 'image' || !material && item.image) return <MaterialImageTile key={item.id} api={api} material={material} name={name} active={pageActive} draftId={item.id} disabled={locked} onOpen={() => { if (material) setImage(material) }} onRemove={() => onRemove(item)} onRetry={failed ? () => onRetry(item) : undefined} error={failed ? materialErrorText(material?.error ?? item.error) : undefined} />
      return <div key={item.id} className="w-full min-w-0 rounded-xl bg-card p-2 text-card-foreground soft-card" data-material-draft-id={item.id} data-material-status={status}>
        <Attachment className="w-full border-0 bg-transparent" size="sm" state={status === 'preparing' ? 'processing' : failed ? 'error' : 'done'}>
          <MaterialMedia preparing={status === 'preparing'} />
          <AttachmentContent>
            <AttachmentTitle>{name}</AttachmentTitle>
            <AttachmentDescription>{materialFormatLabel(material?.format)} · {material && (material.size > 0 || ready) ? sizeText(material.size) : '大小待确认'} · {materialStatusLabels[status]}</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions className="gap-1">
            {ready && material && <Button variant="ghost" size="xs" disabled={locked} aria-label={`预览材料 ${name}`} onClick={() => onPreview(material)}>预览</Button>}
            {failed && <Button variant="ghost" size="icon-xs" disabled={locked} aria-label={`${item.preparationState === 'unknown' ? '核对' : '重试'}材料 ${name}`} onClick={() => onRetry(item)}><RefreshCw /></Button>}
            <Button variant="ghost" size="icon-xs" disabled={locked} aria-label={`移除材料 ${name}`} onClick={() => onRemove(item)}><X /></Button>
          </AttachmentActions>
        </Attachment>
        {failed && <ErrorToast>{materialErrorText(material?.error ?? item.error)}</ErrorToast>}
      </div>
    })}
    <MaterialImageDialog api={api} material={selectedImage} active={pageActive} open={Boolean(selectedImage)} onOpenChange={open => { if (!open) setImage(undefined) }} />
  </section>
}

interface SentMaterialListProps {
  api?: DesktopApi
  pageActive?: boolean
  materials: ConversationMaterial[]
  onPreview(material: ConversationMaterial): void
}

export function SentMaterialList({ api, pageActive = true, materials, onPreview }: SentMaterialListProps) {
  const [image, setImage] = useState<ConversationMaterial>()
  const selectedImage = materials.find(material => material.id === image?.id)
  if (!materials.length) return null
  return <section className="mt-2 flex min-w-0 flex-wrap items-start gap-3" aria-label="消息材料">
    {materials.map(material => {
      const name = materialDisplayName(material.name), ready = material.status === 'ready'
      const failed = ['failed', 'unavailable', 'removed'].includes(material.status)
      if (material.format === 'image') return <div key={material.id} className="min-w-0" data-material-id={material.id} data-material-status={material.status}>
        <MaterialImageTile api={api} material={material} active={pageActive} onOpen={() => setImage(material)} error={failed ? materialErrorText(material.error) : undefined} />
      </div>
      return <div key={material.id} className="w-full min-w-0 rounded-xl bg-card p-2 text-card-foreground soft-card" data-material-id={material.id} data-material-status={material.status}>
        <Button variant="ghost" size="content" className="w-full min-w-0 text-left" disabled={!ready} aria-label={`预览材料 ${name}`} onClick={() => onPreview(material)}>
        <Attachment className="w-full border-0 bg-transparent" size="sm" state={material.status === 'preparing' ? 'processing' : failed ? 'error' : 'done'}>
          <MaterialMedia preparing={material.status === 'preparing'} />
          <AttachmentContent>
            <AttachmentTitle>{name}</AttachmentTitle>
            <AttachmentDescription>{materialFormatLabel(material.format)} · {sizeText(material.size)} · {materialStatusLabels[material.status]}</AttachmentDescription>
          </AttachmentContent>
          <span className="shrink-0 text-xs text-muted-foreground">预览</span>
        </Attachment>
        </Button>
        {failed && <ErrorToast>{materialErrorText(material.error)}</ErrorToast>}
      </div>
    })}
    <MaterialImageDialog api={api} material={selectedImage} active={pageActive} open={Boolean(selectedImage)} onOpenChange={open => { if (!open) setImage(undefined) }} />
  </section>
}

function MaterialMedia({ preparing }: { preparing: boolean }) {
  return <AttachmentMedia>{preparing ? <LoaderCircle className="spinner" /> : <FileText />}</AttachmentMedia>
}

function MaterialImageTile({ api, material, name: pendingName, active, draftId, disabled, onOpen, onRemove, onRetry, error }: {
  api?: DesktopApi; material?: ConversationMaterial; name?: string; active: boolean; draftId?: string; disabled?: boolean
  onOpen(): void; onRemove?(): void; onRetry?(): void; error?: string
}) {
  const { url, loading, error: previewError } = useMaterialImage(api, material, active)
  const [failedUrl, setFailedUrl] = useState<string>()
  const name = materialDisplayName(material?.name ?? pendingName ?? '图片'), ready = material?.format === 'image' && material.status === 'ready'
  const failed = error || previewError || (url && failedUrl === url ? '图片预览暂不可用。' : undefined)
  return <div className="group/material-image relative w-28 shrink-0" data-material-draft-id={draftId} data-material-status={material?.status ?? 'preparing'}>
    <Button variant="ghost" size="content" className="flex size-28 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted p-0" title={name} aria-label={`查看图片 ${name}`} disabled={!ready} onClick={onOpen}>
      {url && failedUrl !== url ? <img src={url} alt={name} className="size-full object-cover" draggable={false} onError={() => setFailedUrl(url)} /> : loading || !material || material.status === 'preparing' ? <LoaderCircle className="spinner" /> : <FileText />}
    </Button>
    {onRemove && <Button variant="ink" size="icon-xs" round className="absolute -top-1.5 -right-1.5 opacity-0 transition-opacity group-hover/material-image:opacity-100 group-focus-within/material-image:opacity-100 focus-visible:opacity-100" disabled={disabled} aria-label={`移除材料 ${name}`} onClick={onRemove}><X /></Button>}
    {failed && <ErrorToast>{failed}</ErrorToast>}
    {onRetry && <Button variant="ghost" size="xs" disabled={disabled} aria-label={`重试材料 ${name}`} onClick={onRetry}>重试</Button>}
  </div>
}
