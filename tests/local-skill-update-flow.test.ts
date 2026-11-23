// @vitest-environment jsdom
/*
 * [INPUT]: Real catalog and terminal components with controlled native CLI receipts.
 * [OUTPUT]: The skills header exposes AI management without the package dialog. Updates use the toolbar, skill-detail popover, and title rockets for outdated global skill rows.
 * [POS]: Desktop library interaction regression without network or user profile writes.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement as h, Fragment, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import type { LocalSkill } from '@boai/shared/domain/skills'
import type { AppEvent, DesktopApi, Methods } from '@boai/shared/ipc'
import { LocalSkillUpdate, useLocalSkillUpdates } from '../apps/electron/src/renderer/pages/library/local-skill-cli'
import { SkillsWorkspace } from '../apps/electron/src/renderer/pages/library/skills-workspace'

test('updates the exact global skill from its title rocket or detail, and confirms bulk updates', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const skills: LocalSkill[] = [
    { id: 'one', name: 'Report', slug: 'report', path: '/home/.agents/skills/report', source: 'global', sourceLabel: '全局', description: 'report body' },
    { id: 'two', name: 'Helper', slug: 'helper', path: '/home/.agents/skills/helper', source: 'global', sourceLabel: '全局', description: '' },
    { id: 'three', name: 'Notes', slug: 'notes-cli', path: '/home/.agents/skills/notes-cli', source: 'global', sourceLabel: '全局', description: '' },
    { id: 'copy', name: 'Notes', slug: 'notes-cli', path: '/agent/skills/notes-cli', source: 'agent', sourceLabel: 'Agent', description: '' },
    { id: 'plugin', name: 'Plugin Report', slug: 'vercel:report', path: '/plugins/vercel/report', source: 'plugin', sourceLabel: '插件', description: '', pluginName: 'vercel' },
  ]
  type Result = Methods['localSkillCli']['output']
  let finish!: (result: Result) => void
  let receive!: (event: AppEvent) => void
  const request = vi.fn(async (method, input) => {
    if (method === 'listLocalSkills') return { skills, issues: [] }
    if (method === 'getSkillCollections') return { revision: 1, groups: [], favoriteResourceIds: skills.map(skill => skill.id), groupByResourceId: {} }
    if (method === 'localSkillCli') return new Promise<Result>(resolve => { finish = resolve })
    throw new Error(`Unexpected request ${method}: ${JSON.stringify(input)}`)
  })
  const api = { request, subscribe: (receiveEvent: typeof receive) => { receive = receiveEvent; return () => {} } } as unknown as DesktopApi
  function Fixture() {
    const updates = useLocalSkillUpdates(api, () => {})
    const [selected, setSelected] = useState<LocalSkill>()
    return h(Fragment, {},
      h(SkillsWorkspace, {
        api, section: 'own', onSection: () => {}, provider: 'skills-sh', onProvider: () => {}, divider: null,
        updates, revision: 0, onManage: () => {}, onOpenSkill: setSelected, onOpenMarketplace: () => {},
      }),
      selected && h(LocalSkillUpdate, { id: selected.id, slug: selected.slug, updates }),
    )
  }
  const button = (label: string) => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label)
  const calls = () => request.mock.calls.filter(([method]) => method === 'localSkillCli').map(([, input]) => input)
  const globalPopup = () => document.querySelector('[role="dialog"][aria-label="全部技能更新"]')
  const terminal = (parent: ParentNode = document) => parent.querySelector('[aria-label="技能命令终端"]')
  try {
    await act(async () => root.render(h(Fixture)))
    expect(button('能力包')).toBeUndefined()
    expect(button('AI 管理')).toBeDefined()
    expect(host.querySelector('.skill-row-update')).toBeNull()
    await act(async () => button('检查技能更新')!.click())
    expect(calls()).toEqual([expect.objectContaining({ action: 'check' })])
    const popup = globalPopup()!
    expect(popup.classList.contains('h-[296px]')).toBe(true)
    expect(popup.querySelector('[data-slot="popover-title"]')).toBeNull()
    expect(terminal(popup)?.querySelector('[data-slot="scroll-area-viewport"]')).not.toBeNull()
    expect(button('确认更新')).toBeUndefined()
    await act(async () => receive({ type: 'local-skill-cli:progress', requestId: calls()[0].requestId, command: 'npx skills check', output: 'Checking for skill updates' }))
    expect(terminal(popup)?.textContent).toContain('Checking for skill updates')
    await act(async () => finish({ status: 'available', command: 'npx skills check', output: 'updates', availableSkills: ['report', 'helper', 'notes-cli'] }))
    const notes = button('更新 Notes')!
    expect(notes.querySelector('.i-solar-rocket-outline')).not.toBeNull()
    expect(notes.closest('[data-skill-row]')?.getAttribute('data-skill-row')).toBe('three')
    expect(host.querySelector('[data-skill-row="copy"] .skill-row-update')).toBeNull()
    expect(host.querySelector('[data-skill-row="plugin"] .skill-row-update')).toBeNull()
    expect(notes.parentElement?.closest('button')).toBeNull()
    await act(async () => button('更新全部技能')!.click())
    await act(async () => notes.click())
    expect(calls()).toHaveLength(2)
    expect(calls()[1]).toMatchObject({ action: 'update', id: 'three' })
    expect(button('查看技能更新')).toBeUndefined()
    expect(button('确认更新')).toBeUndefined()
    expect(button('更新 Helper')?.disabled).toBe(true)
    await act(async () => receive({ type: 'local-skill-cli:progress', requestId: calls()[1].requestId, command: 'npx skills update notes-cli', output: 'Updating notes-cli' }))
    expect(terminal()?.textContent).toContain('Updating notes-cli')
    await act(async () => finish({ status: 'completed', command: 'npx skills update notes-cli', output: '✓ Updated notes-cli', skillName: 'notes-cli' }))
    expect(terminal()?.textContent).toContain('✓ Updated notes-cli')
    await act(async () => button('查看 Notes 更新结果')!.click())
    expect(button('更新 Notes')).toBeUndefined()

    await act(async () => host.querySelector<HTMLButtonElement>('button:has([title="Report"])')!.click())
    await act(async () => button('查看技能更新')!.click())
    expect(calls()).toHaveLength(2)
    const detailPopup = document.querySelector('[role="dialog"][aria-label="技能更新"]')!
    expect(detailPopup.classList.contains('h-[296px]')).toBe(true)
    await act(async () => button('现在更新')!.click())
    expect(calls().at(-1)).toMatchObject({ action: 'update', id: 'one' })
    expect(button('确认更新')).toBeUndefined()
    await act(async () => receive({ type: 'local-skill-cli:progress', requestId: calls().at(-1).requestId, command: 'npx skills update report', output: 'Updating report' }))
    expect(terminal(detailPopup)?.textContent).toContain('Updating report')
    await act(async () => finish({ status: 'completed', output: '✓ Updated report', skillName: 'report', updatedSkills: ['report'] }))
    expect(button('现在更新')).toBeUndefined()
    expect(button('检查更新')).toBeDefined()
    await act(async () => button('查看技能更新')!.click())

    await act(async () => button('更新全部技能')!.click())
    const bulkPopup = globalPopup()!
    expect(terminal(bulkPopup)?.textContent).toContain('npx skills check')
    await act(async () => button('现在更新')!.click())
    expect(calls()).toHaveLength(3)
    await act(async () => button('确认更新')!.click())
    expect(calls().at(-1)).toMatchObject({ action: 'update-all' })
    expect(calls().at(-1)).not.toHaveProperty('id')
    await act(async () => receive({ type: 'local-skill-cli:progress', requestId: calls().at(-1).requestId, command: 'npx skills update --global', output: 'Updating helper' }))
    expect(globalPopup()).toBe(bulkPopup)
    expect(terminal(bulkPopup)?.textContent).toContain('Updating helper')
    expect(document.querySelector('[aria-label="技能更新终端"]')).toBeNull()
    await act(async () => finish({ status: 'completed', output: '✓ Updated helper', updatedSkills: ['helper'] }))
    expect(host.querySelector('[aria-label^="更新 "]')).toBeNull()
    expect(button('检查技能更新')).toBeDefined()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
