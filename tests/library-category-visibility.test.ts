// @vitest-environment jsdom
/*
 * [INPUT]: Real library navigation/display menu, local preferences and isolated catalog fixtures.
 * [OUTPUT]: Visibility persistence, category guard and fallback, and external details with an idle skill command fixture.
 * [POS]: Renderer feature regression; no resource or binding mutations, Electron or external services.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement as h, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CustomizationWorkspace } from '../apps/electron/src/renderer/pages/library/customization-workspace'
import { GuardContext, type Guard } from '../apps/electron/src/renderer/components/common'
import { libraryVisibilityKey } from '../apps/electron/src/renderer/pages/library/library-display-menu'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { Snapshot } from '../packages/shared/src/domain'

const fixture = vi.hoisted(() => ({ catalog: { skills: [{ id: 'skill-reader', name: '阅读技能', slug: 'reader', description: '' }] } }))
vi.mock('../apps/electron/src/renderer/pages/library/use-local-skills', () => ({ useLocalSkills: () => ({ catalog: fixture.catalog, loading: false, error: '' }) }))
vi.mock('../apps/electron/src/renderer/pages/library/skills-workspace', () => ({ SkillsWorkspace: () => h('div', { 'data-view': 'skills' }, '技能目录') }))
vi.mock('../apps/electron/src/renderer/pages/sources/sources-view', () => ({ SourcesView: () => h('div', { 'data-view': 'sources' }, '数据源目录'), SourceIcon: () => null }))
vi.mock('../apps/electron/src/renderer/pages/library/prompt-templates-view', () => ({ PromptTemplatesView: () => h('div', { 'data-view': 'prompts' }, '提示词目录') }))
vi.mock('../apps/electron/src/renderer/pages/library/applications-view', () => ({ ApplicationsView: () => h('div', { 'data-view': 'applications' }, '应用目录') }))
vi.mock('../apps/electron/src/renderer/pages/library/assistants-view', () => ({ AssistantsView: () => h('div', { 'data-view': 'assistants' }, '助手目录') }))

let host: HTMLDivElement, root: Root, props: ComponentProps<typeof CustomizationWorkspace>
const names = ['技能', '数据源', '提示词', '应用', '助手']
const allIds = ['skills', 'sources', 'prompts', 'applications', 'assistants']
const nav = () => [...host.querySelectorAll<HTMLButtonElement>('.custom-categories>button')]
const menuItem = (name: string) => [...document.querySelectorAll<HTMLElement>('[role=menuitemcheckbox]')].find(item => item.textContent?.trim() === name)!
const openMenu = () => act(async () => host.querySelector<HTMLButtonElement>('[aria-label="显示资源库分类"]')!.click())
const toggle = (name: string) => act(async () => menuItem(name).click())
const render = (guard?: Guard) => act(async () => root.render(guard ? h(GuardContext.Provider, { value: guard }, h(CustomizationWorkspace, props)) : h(CustomizationWorkspace, props)))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  Element.prototype.scrollIntoView = () => {}
  props = {
    api: { request: vi.fn(async (method: string) => {
      if (method === 'listDataSources') return [{ id: 'source-mcp', type: 'mcp', name: '数据连接', enabled: true, revision: 1 }]
      if (method === 'listPromptTemplates') return [{ id: 'prompt-example', name: '写作提示词' }]
      throw Error('Unexpected request: ' + method)
    }), subscribe: () => () => {} } as unknown as DesktopApi,
    section: 'all', onSection: vi.fn(), provider: 'skills-sh', onProvider: vi.fn(), divider: null,
    updates: { available: new Set(), busy: false, stopping: false, command: undefined, progress: undefined, globalProgress: undefined, execute: vi.fn(), stopCheck: vi.fn() }, revision: 0, onOpenSkill: vi.fn(), onOpenMarketplace: vi.fn(),
    snapshot: { agents: [], conversations: [], resources: [], connections: [] } as unknown as Snapshot,
    onEmployeeCreated: async () => {}, onOpenSource: vi.fn(), onRemoveSource: vi.fn(),
    onOpenPrompt: vi.fn(), onCreatePrompt: vi.fn(), onRemovePrompt: vi.fn(),
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks()
})

it('defaults to all five categories and offers the display menu in the title row', async () => {
  await render()
  expect(nav().map(item => item.textContent)).toEqual(names)
  expect(host.querySelector('.list-heading [aria-label="显示资源库分类"]')).not.toBeNull()
  expect(host.querySelector('[aria-label="已安装的提示词"]')).not.toBeNull()
  await openMenu()
  expect(names.map(name => menuItem(name).getAttribute('aria-checked'))).toEqual(names.map(() => 'true'))
})

it('keeps only skills/sources, persists across remount and restores hidden resources without mutations', async () => {
  await render(); await openMenu()
  for (const name of ['提示词', '应用', '助手']) await toggle(name)
  expect(nav().map(item => item.textContent)).toEqual(['技能', '数据源'])
  expect(host.querySelector('[aria-label="已安装的提示词"]')).toBeNull()
  expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('搜索技能、数据源')
  expect(JSON.parse(localStorage.getItem(libraryVisibilityKey)!)).toEqual(['prompts', 'applications', 'assistants'])
  await act(async () => root.render(null)); await render()
  expect(nav().map(item => item.textContent)).toEqual(['技能', '数据源'])
  await openMenu(); await toggle('提示词')
  expect(host.querySelector('[aria-label="已安装的提示词"]')).not.toBeNull()
  expect(vi.mocked(props.api.request).mock.calls.every(([method]) => ['listDataSources', 'listPromptTemplates'].includes(method))).toBe(true)
  expect(props.onRemovePrompt).not.toHaveBeenCalled(); expect(props.onRemoveSource).not.toHaveBeenCalled()
})

it('defers hiding the current category until its existing navigation guard allows it', async () => {
  let pending: (() => void) | undefined
  let blocked = false
  const guard: Guard = { dirty: true, setDirty: vi.fn(), saved: vi.fn(), navigate: action => { if (blocked) pending = action; else action() } }
  await render(guard)
  await act(async () => nav().find(item => item.textContent === '数据源')!.click())
  blocked = true
  await openMenu(); await toggle('数据源')
  expect(menuItem('数据源').getAttribute('aria-checked')).toBe('true')
  expect(host.querySelector('[data-view="sources"]')).not.toBeNull()
  expect(JSON.parse(localStorage.getItem(libraryVisibilityKey)!)).toEqual([])
  await act(async () => pending!())
  expect(nav().map(item => item.textContent)).not.toContain('数据源')
  expect(host.querySelector('[data-view="skills"]')).not.toBeNull()
})

it('preserves at least one visible category while allowing another to be restored', async () => {
  localStorage.setItem(libraryVisibilityKey, JSON.stringify(allIds.filter(id => id !== 'assistants')))
  await render(); await openMenu()
  expect(menuItem('助手').getAttribute('aria-disabled')).toBe('true')
  expect(host.querySelector('.custom-installed-search')).toBeNull()
  expect(host.querySelector('.custom-installed-list')).toBeNull()
  await toggle('数据源'); await toggle('助手')
  expect(nav().map(item => item.textContent)).toEqual(['数据源'])
  expect(menuItem('数据源').getAttribute('aria-disabled')).toBe('true')
  expect(host.querySelector('[data-view="sources"]')).not.toBeNull()
})

it.each(['broken json', JSON.stringify(allIds)])('recovers unusable display preferences to the full navigation (%s)', async saved => {
  localStorage.setItem(libraryVisibilityKey, saved)
  await render()
  expect(nav().map(item => item.textContent)).toEqual(names)
})

it('opens an explicitly requested skill detail without undoing the hidden category preference', async () => {
  localStorage.setItem(libraryVisibilityKey, JSON.stringify(['skills']))
  props.focusSkill = { id: 'skill-reader', requestId: 'external-focus' }
  await render()
  expect(nav().map(item => item.textContent)).not.toContain('技能')
  expect(props.onOpenSkill).toHaveBeenCalledExactlyOnceWith(fixture.catalog.skills[0])
  expect(JSON.parse(localStorage.getItem(libraryVisibilityKey)!)).toEqual(['skills'])
  expect(host.querySelector('[data-view="sources"]')).not.toBeNull()
})
