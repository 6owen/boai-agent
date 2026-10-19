/*
 * [INPUT]: 用户明确的知识操作和原请求回执接口。
 * [OUTPUT]: 保存/共享/移除请求身份发送前持久保存，未知只查回执；迟到旧回执不得清除后续请求，隐藏不丢核对入口。
 * [POS]: 文件区知识保存/共享的共同操作状态，不存路径或文件内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { KnowledgeReceipt } from '@shared/domain/knowledge'
import { errorText } from '@/components/common'
import { showErrorToast } from '@/components/common/error-feedback'

export function useKnowledgeOperation(api: DesktopApi, scope: string) {
  const key = `boai.knowledge.pending:${scope}`
  const [pending, setPending] = useState<string | null>(() => localStorage.getItem(key)), [busy, setBusy] = useState(false)
  const locked = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const remember = (requestId: string | null) => { if (requestId) localStorage.setItem(key, requestId); else localStorage.removeItem(key); if (mounted.current) setPending(requestId) }
  const accept = (receipt: KnowledgeReceipt | null, requestId: string) => {
    if (localStorage.getItem(key) !== requestId) return false
    if (receipt && receipt.requestId !== requestId) throw new Error('知识资料回执身份不一致，请继续核对原请求')
    if (!receipt || receipt.status !== 'preparing') remember(null)
    if (receipt?.cleanupError) showErrorToast(`操作已提交，受管副本清理未完成：${receipt.cleanupError}`)
    if (receipt && ['failed', 'interrupted'].includes(receipt.status)) showErrorToast(receipt.error ?? '知识资料操作未完成')
    return receipt?.status === 'completed'
  }
  const check = async () => {
    const requestId = localStorage.getItem(key)
    if (!requestId) { setPending(null); return false }
    if (locked.current) return false
    locked.current = true; setBusy(true)
    try { return accept(await api.request('getEmployeeKnowledgeReceipt', { requestId }), requestId) }
    catch (error) { showErrorToast(errorText(error)); return false }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  const execute = async (requestId: string, action: () => Promise<KnowledgeReceipt>) => {
    if (locked.current || localStorage.getItem(key)) return false
    locked.current = true; remember(requestId); setBusy(true)
    try { return accept(await action(), requestId) }
    catch (error) {
      try { const confirmed = accept(await api.request('getEmployeeKnowledgeReceipt', { requestId }), requestId); if (confirmed) return true }
      catch { /* Unknown remains pending; the user can query this exact receipt. */ }
      showErrorToast(errorText(error)); return false
    } finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  return { pending, busy, execute, check }
}
