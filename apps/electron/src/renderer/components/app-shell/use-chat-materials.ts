/*
 * [OUTPUT]: 原生Codex员工复用附件准备/未知回执/当前成员范围；旧ACP入口保持受限。
 * [OUTPUT]: 未接入材料的本机员工不准备附件。
 * [INPUT]: DesktopApi、当前成员快照、按会话保存的草稿和宿主材料请求回执。
 * [OUTPUT]: 有界原生选取/drop/图片与文件粘贴、稳定准备请求/未知回执核对、真实移除；图片按File类型/名称先占固定缩略图位，真实格式仍以宿主字节核对为准；附件按当前聊天发送；清理后丢弃迟到结果，不盲目重放未知准备。
 * [POS]: AppShell 的材料草稿用例；本机文件选择仅使用宿主发放的短期选择身份。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useRef, type RefObject } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { Snapshot } from '@boai/shared/domain'
import { MATERIAL_LIMITS, type ConversationMaterial } from '@boai/shared/domain/materials'
import type { ChatDraft } from '@/pages/conversations/presentation'
import { materialErrorText, type MaterialDraftItem } from '@/pages/conversations/-components/material-draft'

export function useChatMaterials({ api, snapshot, drafts, onChange, onError }: {
  api: DesktopApi | undefined; snapshot: Snapshot; drafts: RefObject<Map<string, ChatDraft>>
  onChange(): void; onError(message: string): void
}) {
  const generations = useRef(new Map<string, number>()), mutations = useRef(new Set<string>())
  const latestSnapshot = useRef(snapshot); latestSnapshot.current = snapshot
  const update = (conversationId: string, transform: (draft: ChatDraft) => ChatDraft) => {
    const current = drafts.current.get(conversationId)
    if (!current) return
    drafts.current.set(conversationId, transform(current)); onChange()
  }
  const updateItem = (conversationId: string, id: string, transform: (item: MaterialDraftItem) => MaterialDraftItem) => update(conversationId, draft => ({ ...draft, materials: draft.materials?.map(item => item.id === id ? transform(item) : item) }))
  const applyReceipt = (conversationId: string, id: string, requestId: string, material: ConversationMaterial) => updateItem(conversationId, id, item => item.requestId !== requestId ? item : ({ ...item, name: material.name, material, status: material.status === 'removed' ? 'unavailable' : material.status, error: material.error, preparationState: undefined }))
  const queryReceipt = async (conversationId: string, item: MaterialDraftItem) => {
    if (!api) return null
    const generation = generations.current.get(conversationId) ?? 0
    const material = await api.request('getMaterialPreparation', { requestId: item.requestId })
    if (generation !== (generations.current.get(conversationId) ?? 0)) return null
    if (material) applyReceipt(conversationId, item.id, item.requestId, material)
    else updateItem(conversationId, item.id, current => current.requestId !== item.requestId ? current : ({ ...current, status: 'unavailable', preparationState: 'not_accepted', error: '原导入请求尚未受理，可点击重试按原请求导入。' }))
    return material
  }
  const prepare = async (conversationId: string, item: MaterialDraftItem) => {
    if (!api || !item.selectionId) return
    const generation = generations.current.get(conversationId) ?? 0
    updateItem(conversationId, item.id, current => current.requestId !== item.requestId ? current : ({ ...current, status: 'preparing', error: undefined, preparationState: undefined, material: undefined }))
    try {
      const material = await api.request('prepareMaterial', { conversationId, selectionId: item.selectionId, requestId: item.requestId })
      if (generation === (generations.current.get(conversationId) ?? 0)) applyReceipt(conversationId, item.id, item.requestId, material)
    } catch (error) {
      if (generation !== (generations.current.get(conversationId) ?? 0)) return
      updateItem(conversationId, item.id, current => current.requestId !== item.requestId ? current : ({ ...current, status: 'unavailable', preparationState: 'unknown', error: `导入结果尚未确认：${materialErrorText(error instanceof Error ? error.message : String(error))}。重试将先核对原请求。` }))
      try { await queryReceipt(conversationId, item) } catch { /* Keep the original request until the user can read its receipt. */ }
    }
  }
  const addSelection = (conversationId: string, source: { id: string; name: string }, image = /\.(?:png|jpe?g|gif|webp|bmp|avif)$/i.test(source.name)) => {
    const view = latestSnapshot.current, conversation = view.conversations.find(item => item.id === conversationId)
    if (!conversation) return
    const members = view.agents.filter(member => conversation.agentIds.includes(member.id) && member.executionBackend?.kind !== 'acp-local')
    if (!members.length || conversation.agentIds.some(id => view.agents.find(member => member.id === id)?.executionBackend?.kind === 'acp-local')) { onError('此外部聊天不支持材料输入。'); return }
    const current = drafts.current.get(conversationId) ?? { text: '', mentionIds: [] }
    if (current.submission) { onError('请先核对或重试原消息的发送结果，再添加材料。'); return }
    if ((current.materials?.length ?? 0) >= MATERIAL_LIMITS.perMessage) { onError(`每条消息最多添加 ${MATERIAL_LIMITS.perMessage} 份材料。`); return }
    const item: MaterialDraftItem = { id: crypto.randomUUID(), name: source.name, selectionId: source.id, requestId: crypto.randomUUID(), status: 'preparing', image }
    drafts.current.set(conversationId, { ...current, materials: [...(current.materials ?? []), item] }); onChange()
    void prepare(conversationId, item)
  }
  const choose = async (conversationId: string) => {
    if (!api) return
    const generation = generations.current.get(conversationId) ?? 0
    try {
      const source = await api.request('chooseMaterialSource', undefined)
      if (source && generation === (generations.current.get(conversationId) ?? 0)) addSelection(conversationId, source)
    } catch (error) { onError(materialErrorText(error instanceof Error ? error.message : String(error))) }
  }
  const drop = async (conversationId: string, files: File[]) => {
    if (!api?.selectMaterialFile) { onError('当前环境无法接收文件，请使用添加文件。'); return }
    const generation = generations.current.get(conversationId) ?? 0
    for (const file of files) {
      if ((drafts.current.get(conversationId)?.materials?.length ?? 0) >= MATERIAL_LIMITS.perMessage) { onError(`每条消息最多添加 ${MATERIAL_LIMITS.perMessage} 份材料。`); break }
      try {
        const source = await api.selectMaterialFile(file)
        if (generation !== (generations.current.get(conversationId) ?? 0)) return
        addSelection(conversationId, source, /^image\/(?:png|jpeg|gif|webp|bmp|avif)$/i.test(file.type) || /\.(?:png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name))
      } catch (error) { if (generation !== (generations.current.get(conversationId) ?? 0)) return; onError(materialErrorText(error instanceof Error ? error.message : String(error))) }
    }
  }
  const paste = async (conversationId: string, files?: File[]) => {
    if (files?.length) { await drop(conversationId, files); return }
    if (!api?.selectClipboardMaterialFiles) return
    const generation = generations.current.get(conversationId) ?? 0
    try {
      const sources = await api.selectClipboardMaterialFiles()
      if (generation !== (generations.current.get(conversationId) ?? 0)) return
      for (const source of sources) {
        if ((drafts.current.get(conversationId)?.materials?.length ?? 0) >= MATERIAL_LIMITS.perMessage) { onError(`每条消息最多添加 ${MATERIAL_LIMITS.perMessage} 份材料。`); break }
        addSelection(conversationId, source)
      }
    } catch (error) { if (generation === (generations.current.get(conversationId) ?? 0)) onError(materialErrorText(error instanceof Error ? error.message : String(error))) }
  }
  const mutateItem = async (conversationId: string, item: MaterialDraftItem, operation: () => Promise<void>) => {
    if (mutations.current.has(item.id) || drafts.current.get(conversationId)?.submission) return
    mutations.current.add(item.id); updateItem(conversationId, item.id, current => ({ ...current, busy: true }))
    try { await operation() } catch (error) { onError(materialErrorText(error instanceof Error ? error.message : String(error))) }
    finally { mutations.current.delete(item.id); updateItem(conversationId, item.id, current => ({ ...current, busy: false })) }
  }
  const remove = (conversationId: string, item: MaterialDraftItem) => mutateItem(conversationId, item, async () => {
    if (!api) return
    const material = await api.request('getMaterialPreparation', { requestId: item.requestId })
    if (!material && item.preparationState !== 'not_accepted') throw new Error('尚未查到材料回执，请先核对原导入请求后再移除。')
    if (material && material.status !== 'removed') await api.request('discardMaterial', { id: material.id, expectedRevision: material.revision })
    update(conversationId, draft => ({ ...draft, materials: draft.materials?.filter(current => current.id !== item.id) }))
  })
  const retry = (conversationId: string, item: MaterialDraftItem) => mutateItem(conversationId, item, async () => {
    if (!api) return
    if (item.preparationState === 'unknown') { await queryReceipt(conversationId, item); return }
    if (item.preparationState === 'not_accepted') { await prepare(conversationId, item); return }
    const current = await queryReceipt(conversationId, item)
    if (!current || current.status === 'preparing' || current.status === 'ready') return
    if (current.status !== 'removed') await api.request('discardMaterial', { id: current.id, expectedRevision: current.revision })
    if (!item.selectionId) { updateItem(conversationId, item.id, value => ({ ...value, status: 'unavailable', error: '请移除这份材料，再重新选择文件。' })); return }
    const next = { ...item, requestId: crypto.randomUUID(), material: undefined, status: 'preparing' as const, preparationState: undefined, error: undefined }
    updateItem(conversationId, item.id, () => next); await prepare(conversationId, next)
  })
  const reconcile = useCallback((conversationId: string, materials: ConversationMaterial[]) => {
    const current = drafts.current.get(conversationId)
    if (!current?.materials?.length) return
    let changed = false
    const next = current.materials.map(item => {
      const material = materials.find(value => value.id === item.material?.id)
      if (!material || material.revision === item.material?.revision && material.status === item.material?.status) return item
      changed = true
      return { ...item, material, status: material.status === 'removed' ? 'unavailable' as const : material.status, error: material.error, preparationState: undefined }
    })
    if (changed) { drafts.current.set(conversationId, { ...current, materials: next }); onChange() }
  }, [drafts, onChange])
  const invalidate = useCallback((conversationId: string) => { generations.current.set(conversationId, (generations.current.get(conversationId) ?? 0) + 1) }, [])
  return { choose, drop, paste, remove, retry, reconcile, invalidate }
}
