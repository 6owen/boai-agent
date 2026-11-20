/*
 * [INPUT]: Local skill identity and trusted desktop CLI progress and results.
 * [OUTPUT]: Fixed-height update popover using the shared ScrollArea, Shiki transcript and Carbon action icons.
 * [POS]: Local library UI for npx skills.
 * [PROTOCOL]: Update Header and library/.folder.md when changed.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DesktopApi, LocalSkillCliProgress, Methods } from '@boai/shared/ipc'
import { useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { CodeBlock } from '@/components/ui/code-block'
import { Popconfirm } from '@/components/ui/popconfirm'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LoaderCircle, RefreshCw } from '@/components/icons'

type Result = Methods['localSkillCli']['output']
type Command = { action: 'check'; id?: string } | { action: 'update'; id: string }

function useSkillCommand(api: DesktopApi, onUpdated?: () => Promise<void>) {
  const [progress, setProgress] = useState<LocalSkillCliProgress>()
  const [result, setResult] = useState<Result['status']>()
  const [action, setAction] = useState<Command['action']>()
  const { busy, run } = useMutation()
  const execute = useCallback((input: Command) => run(async () => {
    const requestId = crypto.randomUUID()
    setProgress(undefined)
    setResult(undefined)
    setAction(input.action)
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'local-skill-cli:progress' && event.requestId === requestId) setProgress(event)
    })
    try {
      const value = await api.request('localSkillCli', { ...input, requestId })
      setResult(value.status)
      if (value.command) setProgress({ command: value.command, output: value.output })
    } finally {
      unsubscribe()
    }
    if (input.action === 'update') await onUpdated?.()
  }), [api, onUpdated, run])
  return { action, busy, execute, progress, result }
}

function SkillCliTerminal({ progress, busy, className = 'max-h-56 min-h-12' }: { progress?: LocalSkillCliProgress; busy: boolean; className?: string }) {
  const scroll = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const transcript = progress ? `${progress.command}\n${progress.output}` : ''
  useLayoutEffect(() => {
    const node = scroll.current
    if (!transcript) follow.current = true
    if (node && follow.current) node.scrollTop = node.scrollHeight
  }, [transcript])
  return <ScrollArea
    role="region"
    aria-label="技能命令终端"
    aria-busy={busy}
    className={`${className} min-w-0 overflow-hidden rounded-sm bg-[var(--code-background)] [box-shadow:var(--shadow-input)]`}
    viewportProps={{
      ref: scroll,
      className: 'max-h-[inherit] overscroll-contain',
      onScroll: event => {
        const node = event.currentTarget
        follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 12
      },
    }}
  >
    <CodeBlock
      code={transcript}
      language="command-log"
      density="compact"
      className="overflow-visible rounded-none bg-transparent shadow-none [&>code]:min-w-0 [&>code]:whitespace-pre-wrap [&>code]:[overflow-wrap:anywhere]"
    />
  </ScrollArea>
}

function SkillUpdateIcon() {
  return <i className="app-icon i-carbon-update-now" aria-hidden="true" />
}

export function LocalSkillUpdate({ api, id, onUpdated }: { api: DesktopApi; id: string; onUpdated(): Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  const { action, busy, execute, progress, result } = useSkillCommand(api, onUpdated)
  const canUpdate = !busy && result === 'available'
  const check = () => void execute({ action: 'check', id })
  const buttonLabel = busy ? (action === 'update' ? '正在更新' : '正在检查') : '检查更新'

  return <Popover onOpenChange={open => {
    if (!open) setConfirm(false)
    else if (!busy && !result) check()
  }}>
    <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="查看技能更新" title="查看技能更新" aria-busy={busy} />}>
      {busy ? <LoaderCircle className="spinner" /> : canUpdate ? <SkillUpdateIcon /> : <RefreshCw />}
    </PopoverTrigger>
    <PopoverContent aria-label="技能更新" align="end" className="h-[296px] max-h-(--available-height) w-[480px] max-w-[calc(100vw-24px)] gap-3 p-4">
      <SkillCliTerminal progress={progress} busy={busy} className="min-h-0 flex-1" />
      <div className="flex shrink-0 justify-end">
        {canUpdate ? <Popconfirm
          trigger={<Button size="sm"><SkillUpdateIcon />现在更新</Button>}
          title="更新技能"
          description="更新可能覆盖这个技能的本地修改。"
          confirmLabel="确认更新"
          open={confirm}
          onOpenChange={setConfirm}
          onConfirm={() => { setConfirm(false); void execute({ action: 'update', id }) }}
        /> : <Button variant="secondary" size="sm" disabled={busy} onClick={check}>{busy ? <LoaderCircle className="spinner" /> : <RefreshCw />}{buttonLabel}</Button>}
      </div>
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
  </section>
}
