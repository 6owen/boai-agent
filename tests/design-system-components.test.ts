// @vitest-environment jsdom
/*
 * [OUTPUT]: 基础和Tabs/Popover/Composer均保持桌面与网站同源；禁用/标签合同保持。
 * [INPUT]: 共享React组件与原Renderer兼容入口。
 * [OUTPUT]: 同一实现、真实禁用与原生标签/输入关联回归。
 * [POS]: 设计系统组件合同，不启动Electron。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Button, Field, FieldLabel, Input, Card, Skeleton } from '@boai/ui'
import { Button as HostButton } from '../src/renderer/components/ui/button'
import { Input as HostInput } from '../src/renderer/components/ui/input'
import { Card as HostCard } from '../src/renderer/components/ui/card'
import { Tabs as SharedTabs } from '@boai/ui/tabs'
import { Tabs as HostTabs } from '../src/renderer/components/ui/tabs'
import { ChatComposer as SharedComposer } from '@boai/ui/chat-composer'
import { ChatComposer as HostComposer } from '../src/renderer/components/ui/chat-composer'
import { Popover as SharedPopover } from '@boai/ui/popover'
import { Popover as HostPopover } from '../src/renderer/components/ui/popover'
import { Skeleton as HostSkeleton } from '../src/renderer/components/ui/skeleton'

let host: HTMLDivElement, root: Root
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

it('desktop and documentation consume the same component functions', () => {
  expect(HostButton).toBe(Button); expect(HostInput).toBe(Input); expect(HostCard).toBe(Card); expect(HostSkeleton).toBe(Skeleton); expect(HostTabs).toBe(SharedTabs); expect(HostComposer).toBe(SharedComposer); expect(HostPopover).toBe(SharedPopover)
})

it('disabled remains a real interaction boundary after extraction', async () => {
  const action = vi.fn()
  await act(async () => root.render(createElement(Button, { disabled: true, onClick: action }, '保存')))
  expect(host.querySelector('button')!.disabled).toBe(true)
  await act(async () => host.querySelector('button')!.click())
  expect(action).not.toHaveBeenCalled()
  await act(async () => root.render(createElement(Button, { onClick: action }, '保存')))
  await act(async () => host.querySelector('button')!.click())
  expect(action).toHaveBeenCalledOnce()
})

it('field labels and native input attributes survive the public package boundary', async () => {
  await act(async () => root.render(createElement(Field, null, createElement(FieldLabel, { htmlFor: 'project' }, '名称'), createElement(Input, { id: 'project', defaultValue: '草稿', readOnly: true, 'aria-describedby': 'description' }))))
  const input = host.querySelector('input')!
  expect(input.labels?.[0]?.textContent).toBe('名称')
  expect(input.value).toBe('草稿')
  expect(input.readOnly).toBe(true)
  expect(input.getAttribute('aria-describedby')).toBe('description')
})
