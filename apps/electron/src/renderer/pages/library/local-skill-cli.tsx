/*
 * [INPUT]: Local skill identity and trusted desktop CLI progress and results.
 * [OUTPUT]: Shared live terminal for checks and updates, with available-skill state shared by the toolbar, rows and detail popover.
 * [POS]: Local library UI for npx skills.
 * [PROTOCOL]: Update Header and library/.folder.md when changed.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { DesktopApi, LocalSkillCliCommand, LocalSkillCliProgress, Methods } from '@boai/shared/ipc'
import { useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { CodeBlock } from '@/components/ui/code-block'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LoaderCircle, RefreshCw } from '@/components/icons'

type Result = Methods['localSkillCli']['output']
export function useLocalSkillUpdates(api: DesktopApi | undefined, onUpdated: () => void) {
  const [progress, setProgress] = useState<LocalSkillCliProgress>()
  const [result, setResult] = useState<Result['status']>()
  const [command, setCommand] = useState<LocalSkillCliCommand>()
  const [available, setAvailable] = useState<ReadonlySet<string>>(() => new Set())
  const { busy, run } = useMutation()
  const stop = useMutation()
  const execute = useCallback((input: LocalSkillCliCommand) => run(async () => {
    if (!api) return
    const requestId = crypto.randomUUID()
    setProgress(undefined)
    setResult(undefined)
    setCommand(input)
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'local-skill-cli:progress' && event.requestId === requestId) setProgress(event)
    })
    try {
      const value = await api.request('localSkillCli', { ...input, requestId })
      setResult(value.status)
      if (value.command) setProgress({ command: value.command, output: value.output })
      if (value.status !== 'cancelled') setAvailable(previous => nextAvailableSkills(previous, input, value))
    } finally {
      unsubscribe()
    }
    if (input.action !== 'check') {
      try { await api.request('listLocalSkills', { refresh: true }) }
      finally { onUpdated() }
    }
  }), [api, onUpdated, run])
  const stopCheck = () => stop.run(async () => { await api?.request('localSkillCli', { action: 'stop' }) })
  return { command, available, busy, execute, progress, result, stopCheck, stopping: stop.busy }
}

export type LocalSkillUpdates = ReturnType<typeof useLocalSkillUpdates>

function nextAvailableSkills(previous: ReadonlySet<string>, input: LocalSkillCliCommand, result: Result): ReadonlySet<string> {
  if (input.action === 'update-all' && result.status === 'completed') return new Set()
  const isWholeCheck = input.action === 'check' && !input.id
  const complete = result.status === 'completed' || result.status === 'available'
  const names = new Set(isWholeCheck && complete ? [] : previous)
  if (!isWholeCheck && complete && result.skillName) names.delete(result.skillName.toLowerCase())
  for (const skill of result.availableSkills ?? []) names.add(skill.toLowerCase())
  for (const skill of result.updatedSkills ?? []) names.delete(skill.toLowerCase())
  return names
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

export function SkillUpdateIcon() {
  return <i className="app-icon i-carbon-update-now" aria-hidden="true" />
}

export function LocalSkillUpdate({ id, slug, updates }: { id: string; slug: string; updates: LocalSkillUpdates }) {
  const current = updates.command && 'id' in updates.command && updates.command.id === id
  const busy = !!current && updates.busy
  const available = updates.available.has(slug.toLowerCase())
  const check = () => void updates.execute({ action: 'check', id })
  const buttonLabel = busy ? (updates.command?.action === 'update' ? '正在更新' : '正在检查') : available ? '现在更新' : '检查更新'

  return <Popover onOpenChange={open => {
    if (open && !updates.busy && !current && !available) check()
  }}>
    <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="查看技能更新" title="查看技能更新" aria-busy={busy} />}>
      {busy ? <LoaderCircle className="spinner" /> : available ? <SkillUpdateIcon /> : <RefreshCw />}
    </PopoverTrigger>
    <PopoverContent aria-label="技能更新" align="end" className="h-[296px] max-h-(--available-height) w-[480px] max-w-[calc(100vw-24px)] gap-3 p-4">
      <SkillCliTerminal progress={current ? updates.progress : undefined} busy={busy} className="min-h-0 flex-1" />
      <div className="flex shrink-0 justify-end">
        <Button variant={available ? 'default' : 'secondary'} size="sm" disabled={updates.busy}
          onClick={available ? () => void updates.execute({ action: 'update', id }) : check}>
          {busy ? <LoaderCircle className="spinner" /> : available ? <SkillUpdateIcon /> : <RefreshCw />}{buttonLabel}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
}

export function LocalSkillCommands({ updates }: { updates: LocalSkillUpdates }) {
  const checkingAll = updates.busy && updates.command?.action === 'check' && !updates.command.id
  return <section className="skill-update-batch" aria-label="技能更新终端">
    <div className="button-row">
      <Button variant="secondary" disabled={updates.busy} onClick={() => void updates.execute({ action: 'check' })}><RefreshCw />{updates.result ? '重新检查' : '检查全部更新'}</Button>
      {checkingAll && <Button variant="ghost" disabled={updates.stopping} onClick={() => void updates.stopCheck()}>停止检查</Button>}
    </div>
    {(updates.busy || updates.progress) && <SkillCliTerminal progress={updates.progress} busy={updates.busy} />}
  </section>
}
