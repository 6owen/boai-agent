/*
 * [INPUT]: 当前员工、已启用数据源公共目录、Composer可用状态与标签插入回调。
 * [OUTPUT]: 工具栏数据库按钮与可搜索Popover；普通员工只列已绑定源，核心列全部启用源，选择仅插入固定ID/源版本标签。
 * [POS]: 单员工Composer数据源指定入口；隐藏/关闭停读，迟到结果隔离，不测试连接、不读取凭据或改变绑定。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { DigitalAgent } from '@shared/domain'
import type { ComposerReference } from '@shared/domain/composer-references'
import { isCoreAgent } from '@shared/domain/core-agent'
import { DATA_SOURCE_LABELS, type DataSource } from '@shared/domain/sources'
import type { DesktopApi } from '@shared/ipc'
import { errorText } from '@/components/common'
import { ErrorToast } from '@/components/common/error-feedback'
import { Database } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'

export function ComposerSourcePicker({ api, agent, active = true, disabled = false, onSelect }: {
  api: DesktopApi; agent: DigitalAgent; active?: boolean; disabled?: boolean; onSelect(reference: ComposerReference): void
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const [sources, setSources] = useState<DataSource[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), selected = useRef(false)
  const shown = open && active && !disabled && agent.active
  const bindingKey = JSON.stringify(agent.sourceIds ?? []), core = isCoreAgent(agent)
  useEffect(() => { if (!active || disabled || !agent.active) setOpen(false) }, [active, disabled, agent.active])
  useEffect(() => {
    if (!shown) return
    let current = true
    setSources([]); setLoading(true); setError('')
    void api.request('listDataSources', undefined).then(value => {
      if (current) setSources(value.filter(source => source.enabled && (core || agent.sourceIds?.includes(source.id))))
    }, reason => { if (current) setError(errorText(reason)) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, shown, agent.id, agent.configVersion, bindingKey, core, retry])
  return <Popover open={shown} onOpenChange={value => { setOpen(value); setQuery(''); if (value) selected.current = false }}>
    <PopoverTrigger render={<Button ref={trigger} type="button" variant="ghost" size="icon-sm" round aria-label="指定数据源" title="指定数据源" disabled={disabled || !agent.active} />}><Database /></PopoverTrigger>
    <PopoverContent side="top" align="start" sideOffset={8} initialFocus={input} finalFocus={() => selected.current ? false : trigger.current} className="w-72 max-w-[calc(100vw-24px)] gap-0 p-0">
      <PopoverTitle className="sr-only">指定数据源</PopoverTitle>
      <Command label="搜索数据源">
        <CommandInput ref={input} aria-label="搜索数据源" placeholder="搜索数据源…" value={query} onValueChange={setQuery} />
        <CommandList aria-label="可指定的数据源">
          <CommandEmpty>{loading ? '正在读取数据源…' : error ? '数据源读取失败' : '没有匹配的可用数据源'}</CommandEmpty>
          <CommandGroup>{sources.map(source => <CommandItem key={source.id} value={source.id} keywords={[source.name, source.description, DATA_SOURCE_LABELS[source.type]]} aria-label={source.name} onSelect={() => {
            if (!shown) return
            selected.current = true
            setOpen(false)
            onSelect({ kind: 'source', id: source.id, name: source.name, agentId: agent.id, revision: source.revision })
          }}><Database /><span className="min-w-0 flex-1 truncate">{source.name}</span></CommandItem>)}</CommandGroup>
        </CommandList>
        {error && <Button variant="ghost" size="sm" onClick={() => setRetry(value => value + 1)}>重新读取</Button>}
      </Command>
      {error && <ErrorToast>{error}</ErrorToast>}
    </PopoverContent>
  </Popover>
}
