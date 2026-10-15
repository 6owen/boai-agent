/*
 * [OUTPUT]: 执行事件后台核对且相同版本复用原字节；本次附件修改完成后自动预览单一新产物，原附件保留。
 * [OUTPUT]: 选文及标题入口直接定位同一修改Popover，移除底部编辑区中转。
 * [OUTPUT]: 已发送附件在原预览内编辑，独立草稿/员工/固定引用和回执；不占用或跳转主聊天。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 透传活跃状态至Lody二进制查看器，隐藏卸载原renderer；读取仍核材料版本并隔离迟到结果。
 * [INPUT]: 固定会话/材料身份、期望版本、活跃标签状态、搜索来源失效 revision 与宿主材料预览回执。
 * [OUTPUT]: 固定材料 Markdown/代码文件预览与来源行定位；显式按最新状态同hash复核后重读，隐藏/清理/授权变化失效旧原文，迟到读取不回填。
 * [POS]: detail-panel 的材料原文数据边界；不执行模型或读取任意文件路径。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { Artifact, Snapshot } from '@shared/domain'
import { FileEditSession, type FileEditHandle } from './file-edit-session'
import { latestFileEditArtifact, materialEditSource } from './file-edit-state'
import { useFileEditAutoPreview, useFileEdits } from './use-file-edits'
import type { MaterialPreview } from '@shared/domain/materials'
import { Button } from '@/components/ui/button'
import { MaterialPreviewPanel } from '@/pages/conversations/-components/material-preview'
import { materialErrorText } from '@/pages/conversations/-components/material-draft'

export function MaterialTab({ api, conversationId, id, revision, active, line, requestId, sourceRevision = 0, snapshot, onResult }: {
  snapshot: Snapshot; onResult(artifact: Artifact): void
  api: DesktopApi; conversationId: string; id: string; revision: number; active: boolean; line?: number; requestId: string; sourceRevision?: number
}) {
  const editor = useRef<FileEditHandle>(null)
  const [preview, setPreview] = useState<MaterialPreview>(), [loading, setLoading] = useState(active), [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [verified, setVerified] = useState<{ key: string; revision: number }>()
  const identity = `${conversationId}:${id}:${revision}:${requestId}:${active}`
  const identityRef = useRef(identity); identityRef.current = identity
  const repairing = useRef(false)
  const expectedRevision = verified?.key === identity ? verified.revision : revision
  const loadedSource = useRef(-1), cleared = useRef(false)
  const recheck = async () => {
    if (!active || repairing.current) return
    const key = identity
    repairing.current = true; setLoading(true); setPreview(undefined); setError('')
    try {
      const detail = await api.request('getConversationMetadata', { id: conversationId })
      if (identityRef.current !== key) return
      const material = detail.materials?.find(material => material.id === id)
      if (!material) throw new Error('材料已清理或不存在')
      const result = await api.request('recheckMaterial', { id, expectedRevision: material.revision })
      if (identityRef.current === key) { setVerified({ key, revision: result.material.revision }); setRefresh(value => value + 1) }
    } catch (failure) { if (identityRef.current === key) { setLoading(false); setError(materialErrorText(failure instanceof Error ? failure.message : String(failure))) } }
    finally { repairing.current = false }
  }
  useEffect(() => {
    let disposed = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async (background = false) => {
      if (!active || cleared.current) return
      const token = ++request
      if (!background) { setLoading(true); setPreview(undefined); setError('') }
      try {
        const result = await api.request('getMaterialPreview', { id, expectedRevision })
        if (!disposed && token === request && !cleared.current) { loadedSource.current = sourceRevision; setPreview(previous => previous?.material.id === result.material.id && previous.material.revision === result.material.revision && previous.material.contentHash === result.material.contentHash ? { ...result, filePreview: previous.filePreview, binaryPreview: previous.binaryPreview } : result); setError(''); setLoading(false) }
      } catch (failure) { if (!disposed && token === request) { setPreview(undefined); setLoading(false); setError(materialErrorText(failure instanceof Error ? failure.message : String(failure))) } }
    }
    if (active) void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) {
        cleared.current = true; request++; clearTimeout(timer); timer = undefined; setPreview(undefined); setLoading(false); setError('来源聊天已清理或移除，材料原文不可用。'); return
      }
      if (event.type !== 'changed' || event.conversationId && event.conversationId !== conversationId) return
      request++
      if (active && !cleared.current && !timer) timer = setTimeout(() => { timer = undefined; void load(true) }, 120)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, id, expectedRevision, active, requestId, refresh, sourceRevision])
  const current = loadedSource.current === sourceRevision && preview?.material.id === id && preview.material.revision === expectedRevision ? preview : undefined
  const editSource = current ? materialEditSource(current.material) : undefined
  const edits = useFileEdits(api, JSON.stringify([conversationId, 'material', id]), conversationId, active && !!editSource)
  const editedArtifact = latestFileEditArtifact(edits.results, editSource)
  useFileEditAutoPreview(edits, editSource, active, onResult)
  return <div className="detail-section file-preview-detail flex min-h-0 flex-1 flex-col gap-2">
    <MaterialPreviewPanel headerActions={editedArtifact && <Button variant="secondary" size="xs" onClick={() => onResult(editedArtifact)} aria-label={`查看修改结果：${editedArtifact.name}`}>查看修改结果</Button>} preview={current} loading={loading || active && !current && !error} error={error} line={line} active={active} onEdit={(material, annotation, anchor) => { const source = materialEditSource(material); if (source) editor.current?.begin(source, annotation, anchor) }} />
    <FileEditSession ref={editor} api={api} snapshot={snapshot} edits={edits} conversationId={conversationId} source={editSource} active={active} onResult={onResult} />
    {error && active && <Button variant="secondary" size="sm" disabled={loading} onClick={() => void recheck()}>重新核对材料</Button>}
  </div>
}
