/*
 * [INPUT]: Rovai ExecutionNarration.tsx @ f9acc239 (MIT)。
 * [OUTPUT]: 迁入正文按需加载、缓存与重试；共用MarkdownContent/Typeset紧凑排版。
 * [POS]: BOAI工具详情的可访问交互；许可见shared/rovai/LICENSE。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import type { DesktopApi } from '@shared/ipc'
import type { AgentRun } from '@shared/domain'
import type { ExecutionEvidence } from '@shared/domain/execution'
import { readExecutionEvidence } from './execution-content'
import { useContext, useEffect, useState } from 'react'
import { ExecutionContentContext } from './ExecutionVirtualList'
import { MarkdownContent } from '@/components/common/markdown'
import { Button } from '@/components/ui/button'

/** Full narration is read only while its measured row is mounted near the viewport. */
export function ExecutionNarration({ api, run, evidence, preview }: {
  api?: DesktopApi; run?: AgentRun; evidence?: ExecutionEvidence; preview: string
}) {
  const cache = useContext(ExecutionContentContext)
  const stamp = `${evidence?.id}:${evidence?.revision}:${evidence?.contentLength}`
  const [body, setBody] = useState<{ stamp: string; text: string } | null>(() => {
    const text = cache?.get<string>(`body:${stamp}`)
    return text === undefined ? null : { stamp, text }
  })
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!evidence?.deferred || !api || !run) return undefined
    const cached = cache?.get<string>(`body:${stamp}`)
    if (cached !== undefined) { setBody({ stamp, text: cached }); return undefined }
    let disposed = false
    setFailed(false)
    const read = async () => {
      const result = await readExecutionEvidence(api, run, evidence)
      if (typeof (result.payload as { text?: string }).text !== 'string') throw new Error('执行正文格式不兼容')
      return (result.payload as { text: string }).text
    }
    void (cache ? cache.load(`body:${stamp}`, read) : read()).then(text => {
      if (!disposed) setBody({ stamp, text })
    }).catch(() => { if (!disposed) setFailed(true) })

    return () => { disposed = true }
  }, [api, run?.id, stamp, cache, retry])
  return <><MarkdownContent size="compact">{body?.stamp === stamp ? body.text : preview}</MarkdownContent>
    {failed && <Button variant="link" size="sm" onClick={() => setRetry(value => value + 1)}>正文读取失败，重试</Button>}
  </>
}
