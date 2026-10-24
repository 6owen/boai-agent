/*
 * [INPUT]: Rovai ExecutionNarration.tsx @ f9acc239 (MIT)。
 * [OUTPUT]: 流式正文更新自动重读同版分页，等待期间保留已读正文；真实读取错误才展示重试，成功或缓存命中清理旧错误。
 * [POS]: BOAI工具详情的可访问交互；许可见shared/rovai/LICENSE。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import type { DesktopApi } from '@shared/ipc'
import type { AgentRun } from '@shared/domain'
import type { ExecutionEvidence } from '@shared/domain/execution'
import { ExecutionContentUpdating, readExecutionEvidence } from './execution-content'
import { useContext, useEffect, useState } from 'react'
import { ExecutionContentContext } from './ExecutionVirtualList'
import { MarkdownContent } from '@/components/common/markdown'
import { Button } from '@/components/ui/button'

/** Full narration is read only while its measured row is mounted near the viewport. */
export function ExecutionNarration({ api, run, evidence, preview }: {
  api?: DesktopApi; run?: AgentRun; evidence?: ExecutionEvidence; preview: string
}) {
  const cache = useContext(ExecutionContentContext)
  const owner = `${run?.id}:${evidence?.id}`
  const stamp = `${owner}:${evidence?.revision}:${evidence?.contentLength}`
  const [body, setBody] = useState<{ owner: string; text: string } | null>(() => {
    const text = cache?.get<string>(`body:${stamp}`)
    return text === undefined ? null : { owner, text }
  })
  const [failed, setFailed] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    setFailed(null)
    if (!evidence?.deferred || !api || !run) return undefined
    const cached = cache?.get<string>(`body:${stamp}`)
    if (cached !== undefined) { setBody({ owner, text: cached }); return undefined }
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const read = async () => {
      const result = await readExecutionEvidence(api, run, evidence, true)
      if (typeof (result.payload as { text?: string }).text !== 'string') throw new Error('执行正文格式不兼容')
      return (result.payload as { text: string }).text
    }
    void (cache ? cache.load(`body:${stamp}`, read) : read()).then(text => {
      if (!disposed) setBody({ owner, text })
    }).catch(error => {
      if (disposed) return
      if (error instanceof ExecutionContentUpdating) retryTimer = setTimeout(() => setRetry(value => value + 1), 300)
      else setFailed(stamp)
    })

    return () => { disposed = true; clearTimeout(retryTimer) }
  }, [api, run?.id, stamp, cache, retry])
  return <><MarkdownContent size="compact">{evidence?.deferred && body?.owner === owner ? body.text : preview}</MarkdownContent>
    {failed === stamp && <Button variant="link" size="sm" onClick={() => setRetry(value => value + 1)}>正文读取失败，重试</Button>}
  </>
}
