/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState, type CSSProperties } from 'react'
import { Button } from '@boai/ui/button'
import { Input } from '@boai/ui/input'
import { PanelResize } from '@boai/ui/panel-resize'
import { FloatingLayerScope } from '@boai/ui/floating-layer-scope'
import { Popover, PopoverContent, PopoverTrigger } from '@boai/ui/popover'
import { CatalogSearch } from '@boai/ui/catalog-search'
import { DragList, DragListItem } from '@boai/ui/drag-list'
export default function Workspace() {
 const [open,setOpen] = useState(true), [query,setQuery] = useState(''), [items,setItems] = useState(['设计说明','需求清单','组件索引'])
 const visible = items.filter(item => item.includes(query))
 return <div className="example-stack"><Button aria-pressed={open} onClick={() => setOpen(!open)}>{open ? '收起面板' : '展开面板'}</Button><div className="example-panel-layout" style={{'--list-width':'min(260px, 65vw)'} as CSSProperties}><PanelResize open={open} side="left" divider={null}><FloatingLayerScope active={open}><div className="example-stack p-3"><Input aria-label="保留的面板草稿" placeholder="输入后收起再打开，草稿保留" /><Popover><PopoverTrigger render={<Button variant="secondary" />}>面板浮层</PopoverTrigger><PopoverContent><p>隐藏面板时，此浮层自动关闭。</p><Button onClick={() => setOpen(false)}>隐藏所属面板</Button></PopoverContent></Popover></div></FloatingLayerScope></PanelResize><div className="p-3">主内容</div></div><CatalogSearch label="搜索资料" value={query} onChange={setQuery} /><DragList ids={visible} onMove={({id,targetId,placement}) => setItems(current => { const next=current.filter(item => item !== id); next.splice(next.indexOf(targetId)+(placement === 'after' ? 1 : 0),0,id); return next })}>{visible.map(id => <DragListItem id={id} key={id}>{({dragProps}) => <button {...dragProps} type="button" className="example-drag-row">{id}<span>拖动 / Alt + ↑↓</span></button>}</DragListItem>)}</DragList><output>{items.join(' → ')}</output></div>
}
