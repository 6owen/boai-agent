/*
 * [INPUT]: Local skill identity and trusted desktop CLI results.
 * [OUTPUT]: Single-skill check/update and global check in the existing detail surfaces.
 * [POS]: Local library UI for npx skills.
 * [PROTOCOL]: Update Header and library/.folder.md when changed.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopApi, Methods } from '@boai/shared/ipc'
import { Loading, useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { ArrowUp, LoaderCircle, RefreshCw } from '@/components/icons'

type Result = Methods['localSkillCli']['output']

function SkillCliResult({ result, completed }: { result: Result; completed: string }) {
  const label = {
    completed,
    available: '有可用更新',
    unsupported: '此技能没有可用的 CLI 更新来源',
    failed: 'skills CLI 执行失败',
    cancelled: '检查已停止',
  }[result.status]
  return <div className="min-w-0 space-y-2">
    <p className="field-hint" role="status">{label}</p>
    {result.output && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">{result.output}</pre>}
  </div>
}

export function LocalSkillUpdate({ api, id, onUpdated }: { api: DesktopApi; id: string; onUpdated(): Promise<void> }) {
  const [result, setResult] = useState<{ action: 'check' | 'update'; value: Result }>()
  const [confirm, setConfirm] = useState(false)
  const [phase, setPhase] = useState<'check' | 'update'>('check')
  const { busy, run } = useMutation()

  const execute = (action: 'check' | 'update') => run(async () => {
    setPhase(action)
    setResult(undefined)
    setConfirm(false)
    const value = await api.request('localSkillCli', { action, id })
    setResult({ action, value })
    if (action === 'update') await onUpdated()
  })

  return <Popover onOpenChange={open => {
    if (!open) setConfirm(false)
    else if (!busy && !result) void execute('check')
  }}>
    <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="查看技能更新" title="查看技能更新" aria-busy={busy} />}>
      {busy ? <LoaderCircle className="spinner" /> : result?.value.status === 'available' ? <ArrowUp /> : <RefreshCw />}
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[360px] max-w-[calc(100vw-24px)] gap-3 p-4">
      <PopoverTitle>技能更新</PopoverTitle>
      <div className="button-row">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void execute('check')}><RefreshCw />检查更新</Button>
        <Button variant="ghost" size="sm" disabled={busy || confirm || result?.value.status === 'unsupported'} onClick={() => setConfirm(true)}><ArrowUp />更新技能</Button>
      </div>
      {confirm && <div className="space-y-2">
        <p className="field-hint">更新可能覆盖这个技能的本地修改。</p>
        <div className="button-row">
          <Button size="sm" onClick={() => void execute('update')}>确认更新</Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>取消</Button>
        </div>
      </div>}
      {busy && <Loading>{phase === 'check' ? '正在检查更新…' : '正在更新技能…'}</Loading>}
      {result && <SkillCliResult result={result.value} completed={result.action === 'check' ? '检查完成' : '更新命令已完成'} />}
    </PopoverContent>
  </Popover>
}

export function LocalSkillsCheck({ api, active }: { api: DesktopApi; active: boolean }) {
  const [result, setResult] = useState<Result>()
  const started = useRef(false)
  const { busy, run } = useMutation()
  const stop = useMutation()
  const check = useCallback(() => run(async () => {
    setResult(undefined)
    setResult(await api.request('localSkillCli', { action: 'check' }))
  }), [api, run])
  useEffect(() => {
    if (!active || started.current) return
    started.current = true
    void check()
  }, [active, check])
  return <section className="skill-update-batch" aria-label="全部技能更新检查">
    <div className="button-row">
      <Button variant="secondary" disabled={busy} onClick={() => void check()}><RefreshCw />{result ? '重新检查' : '检查全部更新'}</Button>
      {busy && <Button variant="ghost" disabled={stop.busy} onClick={() => void stop.run(async () => { await api.request('localSkillCli', { action: 'stop' }) })}>停止检查</Button>}
    </div>
    {busy && <Loading>正在检查全局技能…</Loading>}
    {result && <SkillCliResult result={result} completed="全局检查完成" />}
  </section>
}
