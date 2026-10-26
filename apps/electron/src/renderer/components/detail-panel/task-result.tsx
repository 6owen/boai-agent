/*
 * [INPUT]: Fixed execution Work identity and shared task-result query.
 * [OUTPUT]: On-demand task files, outcomes and failures; hidden/cleared views discard late reads.
 * [POS]: Chat and execution detail consumer; continuation remains the original chat message action.
 * [PROTOCOL]: Update Header and detail-panel/.folder.md on change.
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentRun } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import type { TaskResult } from '@boai/shared/domain/task-results'
import type { ArtifactPreview } from '@boai/shared/domain/artifacts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorText, showErrorToast } from '@/components/common'
import { MarkdownContent } from '@/components/common/markdown'
import { FilePreview } from '@/components/common/file-preview'
import { workStateLabels } from '@/components/work-views/model'

export function TaskResultButton({ api, run, active, allowContinue = false }: { api: DesktopApi; run: AgentRun; active: boolean; allowContinue?: boolean }) {
  const [open, setOpen] = useState(false), [result, setResult] = useState<TaskResult>(), [preview, setPreview] = useState<ArtifactPreview>(), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0)
  const generation = useRef(0), previewGeneration = useRef(0)
  const workId = run.workId
  useEffect(() => {
    setResult(undefined); setPreview(undefined)
    if (!active || !open || !workId) return
    let disposed = false, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (disposed) return
      const request = ++sequence; generation.current++; previewGeneration.current++; setResult(undefined); setPreview(undefined); setLoading(true)
      try {
        const value = await api.request('getTaskResult', { workId })
        if (disposed || request !== sequence) return
        if (value.work.id !== workId || value.work.conversationId !== run.conversationId || value.work.ownerAgentId !== run.agentId) throw new Error('任务结果来源已变化')
        setResult(value)
      } catch (error) { if (!disposed && request === sequence) showErrorToast(errorText(error)) }
      finally { if (!disposed && request === sequence) setLoading(false) }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === run.conversationId) { disposed = true; clearTimeout(timer); timer = undefined; generation.current++; previewGeneration.current++; setResult(undefined); setPreview(undefined); setOpen(false); return }
      if (event.type === 'changed' && (!event.conversationId || event.conversationId === run.conversationId)) {
        sequence++; generation.current++; previewGeneration.current++; setResult(undefined); setPreview(undefined)
        if (!timer) timer = setTimeout(() => { timer = undefined; void load() }, 200)
      }
    })
    return () => { disposed = true; generation.current++; previewGeneration.current++; clearTimeout(timer); unsubscribe() }
  }, [api, active, open, workId, run.conversationId, run.agentId, refresh])
  const openFile = async (id: string, hash: string) => {
    const request = ++previewGeneration.current, scope = generation.current; setPreview(undefined)
    try {
      const value = await api.request('getArtifactPreview', { id, expectedHash: hash })
      if (scope !== generation.current || request !== previewGeneration.current) return
      if (value.artifact.id !== id || value.artifact.contentHash !== hash || value.artifact.conversationId !== run.conversationId || value.artifact.sourceWorkId !== workId) throw new Error('文件来源已变化')
      setPreview(value)
    } catch (error) { if (scope === generation.current && request === previewGeneration.current) showErrorToast(errorText(error)) }
  }
  if (!workId) return null
  return <>
    <Button variant="ghost" size="sm" disabled={!active} onClick={() => setOpen(true)}>任务结果</Button>
    <Dialog open={open && active} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader><DialogTitle>{preview?.artifact.name ?? '任务结果'}</DialogTitle></DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-auto">
          {preview ? <><Button size="sm" variant="ghost" className="self-start" onClick={() => setPreview(undefined)}>返回任务结果</Button><FilePreview name={preview.artifact.name} file={preview.filePreview} binary={preview.binaryPreview} active={active && open} /></> : result ? <>
            <div><p className="m-0 whitespace-pre-wrap break-words text-sm">{result.work.deliverable}</p><p className="mt-1 text-xs text-muted-foreground">{workStateLabels[result.work.status]}</p></div>
            {result.summary && <MarkdownContent size="compact">{result.summary}</MarkdownContent>}
            {result.work.nextStep && <p className="m-0 whitespace-pre-wrap break-words text-sm">{result.work.nextStep}</p>}
            <section aria-label="结果文件" className="flex flex-col gap-2"><h3 className="m-0 text-sm font-medium">结果文件 · {result.files.total}</h3>
              {!result.files.total && <p className="m-0 text-sm text-muted-foreground">没有登记交付文件</p>}
              {result.files.items.map(file => file.status === 'available' ? <Button key={file.id} variant="secondary" className="justify-start" disabled={!file.contentHash} onClick={() => void openFile(file.id, file.contentHash!)}>{file.name}</Button> : <p key={file.id} className="m-0 text-sm text-muted-foreground">{file.reason}</p>)}
              {result.files.truncated && <p className="m-0 text-xs text-muted-foreground">显示最近 {result.files.items.length} 份；其余文件见原聊天。</p>}
            </section>
            {!!result.messages.total && <section aria-label="结果记录" className="flex flex-col gap-2"><h3 className="m-0 text-sm font-medium">结果记录</h3>{result.messages.items.map(message => <div key={message.id}>{message.status === 'available' ? <><MarkdownContent size="compact">{message.excerpt ?? ''}</MarkdownContent>{message.truncated && <p className="text-xs text-muted-foreground">正文已截断，完整结果见原聊天。</p>}</> : <p className="text-sm text-muted-foreground">{message.reason}</p>}</div>)}{result.messages.truncated && <p className="text-xs text-muted-foreground">显示最近 {result.messages.items.length} / {result.messages.total} 条</p>}</section>}
            <section aria-label="关键执行记录" className="flex flex-col gap-2"><h3 className="m-0 text-sm font-medium">关键执行记录 · {result.runs.total}</h3>
              {result.runs.items.map(item => <div key={item.id} className="text-sm"><p className="m-0 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()} · {({ queued: '排队中', running: '执行中', completed: '已完成', failed: '失败', cancelled: '已停止', interrupted: '已中断', waiting_approval: '等待批准' })[item.status]} · 工具成功 {item.toolCounts.completed} / 失败 {item.toolCounts.failed} / 未结束 {item.toolCounts.running}</p>{item.error && <MarkdownContent size="compact">{item.error}</MarkdownContent>}{item.errorTruncated && <p className="text-xs text-muted-foreground">原因已截断，完整内容见原执行过程。</p>}</div>)}
              {result.runs.unavailable > 0 && <p className="m-0 text-xs text-muted-foreground">{result.runs.unavailable} 条记录的原来源已不可读取</p>}
              {result.runs.truncated && <p className="m-0 text-xs text-muted-foreground">仅显示最近的执行记录</p>}
              {['failed', 'interrupted'].includes(result.work.status) && !result.runs.items.some(item => item.error) && !result.summary && <p className="m-0 text-sm text-muted-foreground">失败原因未记录</p>}
            </section>
            {result.continuation.reason && <p className="m-0 text-sm text-muted-foreground">{result.continuation.reason}</p>}
            {allowContinue && result.continuation.state === 'available' && result.continuation.runId === run.id && <div className="flex justify-end"><Button size="sm" onClick={() => setOpen(false)}>返回聊天继续</Button></div>}
          </> : <Button variant="ghost" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? '正在读取…' : '重新读取'}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
