/*
 * [OUTPUT]: 资源管理结果导航携已保存名称，数据源打开全局右侧配置标签。
 * [INPUT]: 当前bobo普通会话、已提交目录回执和全局管理导航。
 * [OUTPUT]: 真实技能/数据源结果卡，隐藏停读、迟到响应隔离，安装状态取原操作。
 * [POS]: 正常聊天的目录管理结果，无第二套聊天组件。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { CatalogResult } from '@shared/domain/catalog-management'
import { Button } from '@/components/ui/button'
import { Database, Zap } from '@/components/icons'
import { errorText } from '@/components/common'
import { toast } from 'sonner'

export function CatalogResults({ api, conversationId, active, onOpen }: { api: DesktopApi; conversationId: string; active: boolean; onOpen(kind: 'skill' | 'source', id: string, name?: string): void }) {
  const [view, setView] = useState<{ conversationId: string; items: CatalogResult[] }>({ conversationId, items: [] })
  useEffect(() => {
    if (!active) return
    let live = true, request = 0, timer: ReturnType<typeof setTimeout> | undefined, lastError = ''
    const load = async () => {
      const token = ++request
      try { const items = await api.request('listCatalogResults', { conversationId }); if (live && token === request) { setView({ conversationId, items }); lastError = '' } }
      catch (error) { const text = errorText(error); if (live && token === request && text !== lastError) { lastError = text; toast.error(text) } }
    }
    void load()
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && (!event.conversationId || event.conversationId === conversationId)) { timer ??= setTimeout(() => { timer = undefined; void load() }, 120) } })
    return () => { live = false; request++; clearTimeout(timer); unsubscribe() }
  }, [api, conversationId, active])
  if (view.conversationId !== conversationId || !view.items.length) return null
  return <div aria-label="技能和数据源操作结果">{view.items.map(item => <div className="schedule-chat-plan" key={item.id}>{item.kind === 'skill' ? <Zap /> : <Database />}<div><strong>{item.name}</strong><p>{item.removed ? '已删除' : item.status === 'running' ? '处理中' : item.status === 'cancelled' ? '已取消' : item.status === 'failed' || item.status === 'interrupted' ? '未完成' : item.kind === 'skill' ? '技能' : '数据源'}</p></div>{item.available && item.targetId && <Button variant="secondary" size="sm" onClick={() => onOpen(item.kind, item.targetId!, item.name)}>打开</Button>}</div>)}</div>
}
