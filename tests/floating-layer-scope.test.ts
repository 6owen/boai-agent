// @vitest-environment jsdom
/*
 * [INPUT]: 实际Popover/Menu/HoverCard、员工头像及可见作用域。
 * [OUTPUT]: 隐藏立即撤下Portal，受控/非受控浮层返回不复开；页面草稿DOM保持、兄弟作用域隔离，头像配置导航无遗留浮层。
 * [POS]: 保留挂载页面的浮层生命周期回归，不运行Electron或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FloatingLayerScope } from '../apps/electron/src/renderer/components/ui/floating-layer-scope'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../apps/electron/src/renderer/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../apps/electron/src/renderer/components/ui/dropdown-menu'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../apps/electron/src/renderer/components/ui/hover-card'
import { AgentInfoPopover } from '../apps/electron/src/renderer/pages/conversations/-components/agent-info-popover'
import type { DigitalAgent } from '../packages/shared/src/domain'

type LayerProps = { open?: boolean; defaultOpen?: boolean; onOpenChange?(open: boolean): void }
const layers = {
  popover: (props: LayerProps) => h(Popover, props, h(PopoverTrigger, { render: h('button') }, '资料入口'), h(PopoverContent, { className: 'owned-floating', initialFocus: false }, h(PopoverTitle, null, '资料'))),
  menu: (props: LayerProps) => h(DropdownMenu, props, h(DropdownMenuTrigger, { render: h('button') }, '操作入口'), h(DropdownMenuContent, { className: 'owned-floating' }, h(DropdownMenuItem, null, '操作'))),
  hover: (props: LayerProps) => h(HoverCard, props, h(HoverCardTrigger, { href: 'https://example.com' }, '网页'), h(HoverCardContent, { className: 'owned-floating' }, '网页预览')),
}
type Kind = keyof typeof layers
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function KeptPage({ active, kind, controlled }: { active: boolean; kind: Kind; controlled: boolean }) {
  const [open, setOpen] = useState(true)
  return h(FloatingLayerScope, { active }, h('section', { style: { display: active ? undefined : 'none' } },
    h('input', { 'aria-label': '聊天草稿', defaultValue: '初始草稿' }),
    layers[kind](controlled ? { open, onOpenChange: setOpen } : { defaultOpen: true })))
}

it.each(['popover', 'menu', 'hover'] as const)('%s hides immediately and stays closed on return without remounting page drafts', async kind => {
  for (const controlled of [true, false]) {
    await act(async () => root.render(h(KeptPage, { key: String(controlled), active: true, kind, controlled })))
    expect(document.querySelector('.owned-floating')).not.toBeNull()
    const input = host.querySelector('input')!
    input.value = '尚未发送的聊天草稿'
    await act(async () => root.render(h(KeptPage, { key: String(controlled), active: false, kind, controlled })))
    expect(document.querySelector('.owned-floating')).toBeNull()
    expect(host.querySelector('input')).toBe(input)
    await act(async () => root.render(h(KeptPage, { key: String(controlled), active: true, kind, controlled })))
    expect(document.querySelector('.owned-floating')).toBeNull()
    expect(host.querySelector('input')).toBe(input)
    expect(input.value).toBe('尚未发送的聊天草稿')
    await act(async () => root.render(null))
  }
})

it('inherits hidden parent state and does not close another visible page layer', async () => {
  const render = (active: boolean) => root.render(h('main', null,
    h(FloatingLayerScope, { active }, h(FloatingLayerScope, { active: true }, layers.popover({ defaultOpen: true }))),
    h(Popover, { defaultOpen: true }, h(PopoverTrigger, { render: h('button') }, '全局入口'), h(PopoverContent, { className: 'global-floating', initialFocus: false }, h(PopoverTitle, null, '全局资料')))))
  await act(async () => render(true))
  expect(document.querySelector('.owned-floating')).not.toBeNull()
  await act(async () => render(false))
  expect(document.querySelector('.owned-floating')).toBeNull()
  expect(document.querySelector('.global-floating')).not.toBeNull()
})

it('removes the employee profile portal when its configure action changes the page', async () => {
  const agent = { id: 'bobo', name: 'bobo', role: '系统核心 Agent', skillIds: [], knowledgeIds: [] } as unknown as DigitalAgent
  function Navigation() {
    const [active, setActive] = useState(true)
    return h('main', null, h(FloatingLayerScope, { active }, h('section', { style: { display: active ? undefined : 'none' } },
      h(AgentInfoPopover, { agent, resources: [], onConfigure: () => setActive(false) }))), !active && h('h1', null, '通讯录'))
  }
  await act(async () => root.render(h(Navigation)))
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="查看 bobo 的资料"]')!.click())
  expect(document.querySelector('.agent-info-popover')).not.toBeNull()
  const configure = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '配置 Agent')!
  await act(async () => configure.click())
  expect(host.querySelector('h1')?.textContent).toBe('通讯录')
  expect(document.querySelector('.agent-info-popover')).toBeNull()
})
