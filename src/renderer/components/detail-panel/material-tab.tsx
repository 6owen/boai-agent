/*
 * [INPUT]: 固定会话/材料身份、期望版本、活跃标签状态、搜索来源失效 revision 与宿主材料预览回执。
 * [OUTPUT]: 独立材料详情标签的复核读取与来源行定位；隐藏时停止读取，清理/授权变化立即失效旧原文，迟到读取不回填。
 * [POS]: detail-panel 的材料原文数据边界；不执行模型或读取任意文件路径。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { MaterialPreview } from '@shared/domain/materials'
import { Button } from '@/components/ui/button'
import { MaterialPreviewPanel } from '@/pages/conversations/-components/material-preview'
import { materialErrorText } from '@/pages/conversations/-components/material-draft'

export function MaterialTab({ api, conversationId, id, revision, active, line, requestId, sourceRevision = 0 }: {
  api: DesktopApi; conversationId: string; id: string; revision: number; active: boolean; line?: number; requestId: string; sourceRevision?: number
}) {
  const [preview, setPreview] = useState<MaterialPreview>(), [loading, setLoading] = useState(active), [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const loadedSource = useRef(-1)
  useEffect(() => {
    let disposed = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (!active) return
      const token = ++request; setLoading(true); setPreview(undefined); setError('')
      try {
        const result = await api.request('getMaterialPreview', { id, expectedRevision: revision })
        if (!disposed && token === request) { loadedSource.current = sourceRevision; setPreview(result); setLoading(false) }
      } catch (failure) { if (!disposed && token === request) { setPreview(undefined); setLoading(false); setError(materialErrorText(failure instanceof Error ? failure.message : String(failure))) } }
    }
    if (active) void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) {
        request++; clearTimeout(timer); timer = undefined; setPreview(undefined); setLoading(false); setError('来源聊天已清理或移除，材料原文不可用。'); return
      }
      if (event.type !== 'changed' || event.conversationId && event.conversationId !== conversationId) return
      request++; setPreview(undefined)
      if (active && !timer) timer = setTimeout(() => { timer = undefined; void load() }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, id, revision, active, requestId, refresh, sourceRevision])
  const current = loadedSource.current === sourceRevision && preview?.material.id === id && preview.material.revision === revision ? preview : undefined
  return <div className="detail-section flex min-h-0 flex-1 flex-col gap-2">
    <MaterialPreviewPanel preview={current} loading={loading || active && !current && !error} error={error} line={line} />
    {error && active && <Button variant="secondary" size="sm" onClick={() => setRefresh(value => value + 1)}>重新核对材料</Button>}
  </div>
}
