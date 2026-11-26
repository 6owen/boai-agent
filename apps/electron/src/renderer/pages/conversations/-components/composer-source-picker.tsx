/*
 * [INPUT]: 当前员工、数据源公共目录与 Composer 选择回调。
 * [OUTPUT]: 数据源二级菜单按需读取并复用 Composer 渐隐列表，普通员工只列启用的绑定源，核心列全部启用源。
 * [POS]: Composer 子菜单，选择只插入原始 ID 和版本标签。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { DigitalAgent } from '@boai/shared/domain'
import type { ComposerReference } from '@boai/shared/domain/composer-references'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { DataSource } from '@boai/shared/domain/sources'
import type { DesktopApi } from '@boai/shared/ipc'
import { errorText, showErrorToast } from '@/components/common'
import { Database } from '@/components/icons'
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu'
import { ComposerSubmenuContent } from './composer-submenu'

export function ComposerSourceMenu({ api, agent, active, onSelect, onChoose }: {
  api: DesktopApi; agent?: DigitalAgent; active: boolean
  onSelect(reference: ComposerReference): void
  onChoose(action: () => void): void
}) {
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const shown = active && open
  useEffect(() => {
    if (!shown || !agent) return
    let current = true
    setSources([]); setLoading(true); setFailed(false)
    void api.request('listDataSources', undefined).then(value => {
      if (current) setSources(value.filter(source => source.enabled && (isCoreAgent(agent) || agent.sourceIds?.includes(source.id))))
    }, reason => {
      if (current) { setFailed(true); showErrorToast(errorText(reason)) }
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, shown, agent, retry])
  return <DropdownMenuSub onOpenChange={value => {
    setOpen(value)
    if (value && agent) { setSources([]); setFailed(false); setLoading(true) }
  }}>
    <DropdownMenuSubTrigger><Database />数据源</DropdownMenuSubTrigger>
    <ComposerSubmenuContent>
      {agent && sources.length ? sources.map(source => <DropdownMenuItem key={source.id} onClick={() => onChoose(() => {
        onSelect({ kind: 'source', id: source.id, name: source.name, agentId: agent.id, revision: source.revision })
      })}><span className="truncate">{source.name}</span></DropdownMenuItem>) : agent && failed
        ? <DropdownMenuItem closeOnClick={false} onClick={() => setRetry(value => value + 1)}>重新读取数据源</DropdownMenuItem>
        : <DropdownMenuItem disabled>{agent && loading ? '正在读取数据源…' : '没有可用数据源'}</DropdownMenuItem>}
    </ComposerSubmenuContent>
  </DropdownMenuSub>
}
