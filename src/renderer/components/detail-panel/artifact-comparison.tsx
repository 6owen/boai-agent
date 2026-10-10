/*
 * [INPUT]: 用户明确选中的同家族两份成果ID/hash、活跃详情及原IPC。
 * [OUTPUT]: 逐份核源后向Lody DiffViewer传固定原文；隐藏/清理/版本切换及来源变化失效旧比较。
 * [POS]: 成果详情只读比较连接；零采用/修订/Work/模型调用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import type { ArtifactVersion } from '@shared/domain/artifacts'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText } from '@/components/common'
const DiffViewer = lazy(() => import('@/components/common/lody/diff-viewer').then(module => ({ default: module.DiffViewer })))
export function ArtifactComparison({ api, first, second, active, sourceRevision }: { api: DesktopApi; first: ArtifactVersion; second: ArtifactVersion; active: boolean; sourceRevision: number }) {
  const [view, setView] = useState<{ key: string; oldText: string; newText: string }>(), [error, setError] = useState('')
  const [oldVersion, newVersion] = [first, second].sort((a, b) => a.contentVersion - b.contentVersion)
  const key = `${oldVersion.id}:${oldVersion.contentHash}:${newVersion.id}:${newVersion.contentHash}:${sourceRevision}`
  useEffect(() => {
    let disposed = false
    setView(undefined); setError('')
    if (!active) return
    const load = async () => {
      try {
        if (oldVersion.id === newVersion.id || oldVersion.conversationId !== newVersion.conversationId || oldVersion.logicalArtifactId !== newVersion.logicalArtifactId) throw new Error('只能比较同一成果家族的两个明确版本。')
        const results = await Promise.all([oldVersion, newVersion].map(version => api.request('getArtifactPreview', { id: version.id, expectedHash: version.contentHash })))
        const texts = results.map((result, index) => {
          const version = [oldVersion, newVersion][index]
          if (result.artifact.id !== version.id || result.artifact.contentHash !== version.contentHash || result.artifact.conversationId !== version.conversationId || result.artifact.logicalArtifactId !== version.logicalArtifactId || result.artifact.contentVersion !== version.contentVersion) throw new Error('成果比较来源已变化，请重新打开明确版本。')
          if (!result.filePreview || result.filePreview.kind === 'unsupported') throw new Error('版本对比仅支持已核对的文本文件。')
          return result.filePreview.text
        })
        if (!disposed) setView({ key, oldText: texts[0], newText: texts[1] })
      } catch (failure) { if (!disposed) setError(errorText(failure)) }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'changed' && (!event.conversationId || event.conversationId === oldVersion.conversationId)) || ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === oldVersion.conversationId)) {
        disposed = true; setView(undefined); setError('比较来源已变化，请重新核对成果。')
      }
    })
    return () => { disposed = true; unsubscribe() }
  }, [api, active, key, oldVersion.id, oldVersion.contentHash, oldVersion.conversationId, oldVersion.logicalArtifactId, oldVersion.contentVersion, newVersion.id, newVersion.contentHash, newVersion.conversationId, newVersion.logicalArtifactId, newVersion.contentVersion])
  if (!active) return null
  return <section className="min-h-0 flex-1 overflow-auto" aria-label={`成果版本对比 第${oldVersion.contentVersion}版到第${newVersion.contentVersion}版`}>
    {error ? <Banner>{error}</Banner> : view?.key === key ? <Suspense fallback={<p role="status">正在载入版本对比…</p>}><DiffViewer key={key} path={newVersion.name} oldText={view.oldText} newText={view.newText} responsiveSplit parseCacheKey={key} commentsEnabled={false} /></Suspense> : <p role="status">正在核对两个成果原件…</p>}
  </section>
}
