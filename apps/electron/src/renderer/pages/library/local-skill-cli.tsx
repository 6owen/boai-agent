/*
 * [INPUT]: Local skill identity and trusted desktop CLI progress and results.
 * [OUTPUT]: Actual command and live terminal output for single-skill operations and global checks.
 * [POS]: Local library UI for npx skills.
 * [PROTOCOL]: Update Header and library/.folder.md when changed.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DesktopApi, LocalSkillCliProgress, Methods } from '@boai/shared/ipc'
import { useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { ArrowUp, LoaderCircle, RefreshCw } from '@/components/icons'

type Result = Methods['localSkillCli']['output']
type Command = { action: 'check'; id?: string } | { action: 'update'; id: string }

function useSkillCommand(api: DesktopApi, onUpdated?: () => Promise<void>) {
  const [progress, setProgress] = useState<LocalSkillCliProgress>()
  const [result, setResult] = useState<{ action: Command['action']; value: Result }>()
  const { busy, run } = useMutation()
  const execute = useCallback((input: Command) => run(async () => {
    const requestId = crypto.randomUUID()
    setProgress(undefined)
    setResult(undefined)
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'local-skill-cli:progress' && event.requestId === requestId) setProgress(event)
    })
    try {
      const value = await api.request('localSkillCli', { ...input, requestId })
      setResult({ action: input.action, value })
      if (value.command) setProgress({ command: value.command, output: value.output })
    } finally {
      unsubscribe()
    }
    if (input.action === 'update') await onUpdated?.()
  }), [api, onUpdated, run])
  return { busy, execute, progress, result }
}

function SkillCliTerminal({ progress, busy }: { progress?: LocalSkillCliProgress; busy: boolean }) {
  const scroll = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  useLayoutEffect(() => {
    const node = scroll.current
    if (node && follow.current) node.scrollTop = node.scrollHeight
  }, [progress?.output])
  return <section aria-label="技能命令终端" aria-busy={busy} className="min-w-0 overflow-hidden rounded-md border bg-muted/50 [font-family:var(--font-code-family)] text-xs leading-relaxed">
    <div className="flex items-start gap-2 px-3 py-2.5">
      <span className="select-none text-muted-foreground" aria-hidden>$</span>
      <code className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{progress?.command}</code>
      {busy && <LoaderCircle size={14} className="spinner shrink-0 text-muted-foreground" aria-label="命令执行中" />}
    </div>
    <div ref={scroll} tabIndex={0} aria-label="命令输出" className="max-h-56 min-h-20 overflow-y-auto px-3 pb-3" onScroll={event => {
      const node = event.currentTarget
      follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 12
    }}>
      <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{progress?.output}</pre>
    </div>
  </section>
}

function SkillCliResult({ status, completed }: { status: Result['status']; completed: string }) {
  const label = {
    completed,
    available: '有可用更新',
    unsupported: '此技能没有可用的 CLI 更新来源',
    failed: 'skills CLI 执行失败',
    cancelled: '检查已停止',
  }[status]
  return <p className="field-hint" role="status">{label}</p>
}

export function LocalSkillUpdate({ api, id, onUpdated }: { api: DesktopApi; id: string; onUpdated(): Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  const { busy, execute, progress, result } = useSkillCommand(api, onUpdated)
  const check = () => {
    setConfirm(false)
    void execute({ action: 'check', id })
  }

  return <Popover onOpenChange={open => {
    if (!open) setConfirm(false)
    else if (!busy && !result) check()
  }}>
    <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="查看技能更新" title="查看技能更新" aria-busy={busy} />}>
      {busy ? <LoaderCircle className="spinner" /> : result?.value.status === 'available' ? <ArrowUp /> : <RefreshCw />}
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[480px] max-w-[calc(100vw-24px)] gap-3 p-4">
      <PopoverTitle>技能更新</PopoverTitle>
      <div className="button-row">
        <Button variant="secondary" size="sm" disabled={busy} onClick={check}><RefreshCw />检查更新</Button>
        <Button variant="ghost" size="sm" disabled={busy || confirm || result?.value.status === 'unsupported'} onClick={() => setConfirm(true)}><ArrowUp />更新技能</Button>
      </div>
      {confirm && <div className="space-y-2">
        <p className="field-hint">更新可能覆盖这个技能的本地修改。</p>
        <div className="button-row">
          <Button size="sm" onClick={() => { setConfirm(false); void execute({ action: 'update', id }) }}>确认更新</Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>取消</Button>
        </div>
      </div>}
      {(busy || progress) && <SkillCliTerminal progress={progress} busy={busy} />}
      {result && <SkillCliResult status={result.value.status} completed={result.action === 'check' ? '检查完成' : '更新命令已完成'} />}
    </PopoverContent>
  </Popover>
}

export function LocalSkillsCheck({ api, active }: { api: DesktopApi; active: boolean }) {
  const started = useRef(false)
  const { busy, execute, progress, result } = useSkillCommand(api)
  const stop = useMutation()
  useEffect(() => {
    if (!active || started.current) return
    started.current = true
    void execute({ action: 'check' })
  }, [active, execute])
  return <section className="skill-update-batch" aria-label="全部技能更新检查">
    <div className="button-row">
      <Button variant="secondary" disabled={busy} onClick={() => void execute({ action: 'check' })}><RefreshCw />{result ? '重新检查' : '检查全部更新'}</Button>
      {busy && <Button variant="ghost" disabled={stop.busy} onClick={() => void stop.run(async () => { await api.request('localSkillCli', { action: 'stop' }) })}>停止检查</Button>}
    </div>
    {(busy || progress) && <SkillCliTerminal progress={progress} busy={busy} />}
    {result && <SkillCliResult status={result.value.status} completed="全局检查完成" />}
  </section>
}
