/*
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [INPUT]: 原聊天成果的固定版本/hash、持久未决请求与桌面只读回执。
 * [OUTPUT]: 聊天内采用/稍后验收/同一composer修订，共用原幂等事务；未知仅核对，确认未受理才原载荷重试，清理隔离迟到结果。
 * [POS]: 成果消息操作的宿主接线，不保存预览正文，不打开右侧流程。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { ArtifactAcceptanceInput, ArtifactAdoptionInput, ArtifactRevisionInput } from '@shared/domain/artifacts'
import { artifactAcceptanceReceiptMatches, artifactAdoptionReceiptMatches, artifactRevisionReceiptMatches, artifactPendingKey, type ArtifactPending, type ArtifactPendingMap, type ArtifactRequest } from '@/components/detail-panel/artifact-state'
import { errorText } from '@/components/common'
import { materialErrorText } from './-components/material-draft'

export type ArtifactActionKind = 'revision' | 'adoption' | 'acceptance'
type ActionInput = { revision: ArtifactRevisionInput; adoption: ArtifactAdoptionInput; acceptance: ArtifactAcceptanceInput }
export type ChatArtifactTarget = Pick<ArtifactPending, 'scope' | 'conversationId' | 'logicalArtifactId'>
export interface ChatArtifactRevisionTarget { annotation?: import('@shared/domain/file-edit').FileEditAnnotation; artifactId: string; logicalArtifactId: string; contentHash: string; contentVersion?: number; name: string; targetAgentId: string }

export function useChatArtifacts(api: DesktopApi | undefined, values: ArtifactPendingMap, onPending: (key: string, value?: ArtifactPending) => boolean, onSubmitted: (target: ChatArtifactTarget, kind: ArtifactActionKind, input: ActionInput[ArtifactActionKind]) => void, onChecked: (conversationId: string, artifactId: string) => void) {
  const current = useRef(values); current.current = values
  const submitted = useRef(onSubmitted); submitted.current = onSubmitted
  const checked = useRef(onChecked); checked.current = onChecked
  const flights = useRef(new Set<string>()), epochs = useRef(new Map<string, number>()), alive = useRef(true)
  const [busy, setBusy] = useState<Set<string>>(new Set()), [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => api?.subscribe(event => {
    if (event.type !== 'conversation:cleared' && event.type !== 'conversation:deleted') return
    epochs.current.set(event.conversationId, (epochs.current.get(event.conversationId) ?? 0) + 1)
  }), [api])
  const save = <K extends ArtifactActionKind>(target: ChatArtifactTarget, kind: K, request?: ArtifactRequest<ActionInput[K]>) => {
    const key = artifactPendingKey(target.scope, target.conversationId, target.logicalArtifactId)
    const next: ArtifactPending = { ...target, ...current.current[key], [kind]: request }
    current.current = { ...current.current, [key]: next }
    if (!onPending(key, next)) throw new Error('未能保存请求身份，请先恢复本地存储后重试。')
  }
  const execute = async <K extends ArtifactActionKind>(target: ChatArtifactTarget, kind: K, input?: ActionInput[K]) => {
    if (!api) return
    const key = artifactPendingKey(target.scope, target.conversationId, target.logicalArtifactId)
    if (flights.current.has(key)) return
    const existing = current.current[key]?.[kind] as ArtifactRequest<ActionInput[K]> | undefined
    if (existing?.status === 'pending' || !existing && !input) return
    const other = current.current[key]
    if (!existing && (other?.revision || other?.adoption || other?.acceptance)) return
    const request: ArtifactRequest<ActionInput[K]> = existing ?? { input: input!, status: 'pending' }
    const epoch = epochs.current.get(target.conversationId) ?? 0
    const valid = () => alive.current && epoch === (epochs.current.get(target.conversationId) ?? 0)
    const stillOriginal = () => current.current[key]?.[kind]?.input.requestId === request.input.requestId
    const finish = () => {
      if (!valid() || !stillOriginal()) return
      save(target, kind); submitted.current(target, kind, request.input)
    }
    const lookup = async () => {
      if (kind === 'revision') {
        const receipt = await api.request('getMessageReceipt', { requestId: request.input.requestId })
        if (!valid()) return true
        if (!receipt) return false
        if (!artifactRevisionReceiptMatches(request.input as ArtifactRevisionInput, receipt)) throw new Error('修改回执与原请求不一致，请保留原请求核对。')
      } else if (kind === 'adoption') {
        const receipt = await api.request('getArtifactAdoptionReceipt', { requestId: request.input.requestId })
        if (!valid()) return true
        if (!receipt) return false
        if (!artifactAdoptionReceiptMatches(request.input as ArtifactAdoptionInput, receipt, target.conversationId, target.logicalArtifactId)) throw new Error('采用回执与原版本不一致。')
      } else {
        const receipt = await api.request('getArtifactAcceptanceReceipt', { requestId: request.input.requestId })
        if (!valid()) return true
        if (!receipt) return false
        if (!artifactAcceptanceReceiptMatches(request.input as ArtifactAcceptanceInput, receipt, target.conversationId)) throw new Error('待验收回执与原版本不一致。')
      }
      finish(); return true
    }
    flights.current.add(key); setBusy(new Set(flights.current)); setErrors(previous => ({ ...previous, [key]: '' }))
    try {
      if (existing) {
        if (await lookup()) return
        if (!valid()) return
        save(target, kind, { ...request, status: 'not_accepted' })
        if (existing.status === 'unknown') return
      }
      try { save(target, kind, { ...request, status: 'pending' }) }
      catch (failure) { try { save(target, kind, { ...request, status: 'not_accepted' }) } catch { /* No mutation has been sent. */ } throw failure }
      try {
        if (kind === 'revision') {
          const receipt = await api.request('reviseArtifact', request.input as ArtifactRevisionInput)
          if (!artifactRevisionReceiptMatches(request.input as ArtifactRevisionInput, receipt)) throw new Error('修改回执与原请求不一致。')
        }
        else if (kind === 'adoption') {
          const receipt = await api.request('adoptArtifact', request.input as ArtifactAdoptionInput)
          if (!artifactAdoptionReceiptMatches(request.input as ArtifactAdoptionInput, receipt, target.conversationId, target.logicalArtifactId)) throw new Error('采用回执与原版本不一致。')
        }
        else {
          const receipt = await api.request('requestArtifactAcceptance', request.input as ArtifactAcceptanceInput)
          if (!artifactAcceptanceReceiptMatches(request.input as ArtifactAcceptanceInput, receipt, target.conversationId)) throw new Error('待验收回执与原版本不一致。')
        }
        finish()
      } catch (failure) {
        if (!valid()) return
        try { save(target, kind, { ...request, status: 'unknown' }) } catch { /* Keep original payload in memory when durable storage fails. */ }
        try { if (await lookup()) return; if (valid()) save(target, kind, { ...request, status: 'not_accepted' }) } catch { /* Unknown remains read-only until an explicit receipt check. */ }
        throw failure
      }
    } catch (failure) { if (valid()) setErrors(previous => ({ ...previous, [key]: materialErrorText(errorText(failure)) })) }
    finally { if (valid()) checked.current(target.conversationId, request.input.artifactId); flights.current.delete(key); if (alive.current) setBusy(new Set(flights.current)) }
  }
  const discard = (target: ChatArtifactTarget, kind: ArtifactActionKind) => {
    const key = artifactPendingKey(target.scope, target.conversationId, target.logicalArtifactId)
    if (flights.current.has(key) || current.current[key]?.[kind]?.status !== 'not_accepted') return false
    try { save(target, kind); setErrors(previous => ({ ...previous, [key]: '' })); return true }
    catch (failure) { setErrors(previous => ({ ...previous, [key]: errorText(failure) })); return false }
  }
  return { values, busy, errors, execute, discard }
}
export type ChatArtifacts = ReturnType<typeof useChatArtifacts>
