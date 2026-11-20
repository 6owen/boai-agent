// @vitest-environment jsdom
/*
 * [INPUT]: Real catalog and terminal components with controlled native CLI receipts.
 * [OUTPUT]: Global check marks the correct rows, single update is direct, bulk update requires confirmation.
 * [POS]: Desktop library interaction regression without network or user profile writes.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement as h, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import type { LocalSkill } from '@boai/shared/domain/skills'
import type { AppEvent, DesktopApi, Methods } from '@boai/shared/ipc'
import { LocalSkillCommands, useLocalSkillUpdates } from '../apps/electron/src/renderer/pages/library/local-skill-cli'
import { SkillsWorkspace } from '../apps/electron/src/renderer/pages/library/skills-workspace'

test('checks globally, updates a marked row directly, and confirms the bulk update', async () => {
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
  const onOpenSkill = vi.fn()
  function Fixture() {
    const updates = useLocalSkillUpdates(api, () => {})
    return h(Fragment, {},
      h(SkillsWorkspace, {
        api, section: 'own', onSection: () => {}, provider: 'skills-sh', onProvider: () => {}, divider: null,
        updates, onSkillCommand: command => { void updates.execute(command) },
        revision: 0, onOpenSkill, onOpenMarketplace: () => {},
      }),
      h(LocalSkillCommands, { updates }),
    )
  }
  const button = (label: string) => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label)
  const calls = () => request.mock.calls.filter(([method]) => method === 'localSkillCli').map(([, input]) => input)
  const terminal = () => document.querySelector('[aria-label="技能命令终端"]')
  try {
    await act(async () => root.render(h(Fixture)))
    await act(async () => button('检查技能更新')!.click())
    expect(calls()).toEqual([expect.objectContaining({ action: 'check' })])
    await act(async () => finish({ status: 'available', command: 'npx skills check', output: 'updates', availableSkills: ['report', 'helper'] }))
    expect(button('更新 Report')?.closest('button button')).toBeNull()
    expect(button('更新 Plugin Report')).toBeUndefined()

    await act(async () => button('更新 Report')!.click())
    expect(calls().at(-1)).toMatchObject({ action: 'update', id: 'one' })
    expect(button('确认更新')).toBeUndefined()
    expect(onOpenSkill).not.toHaveBeenCalled()
    await act(async () => receive({ type: 'local-skill-cli:progress', requestId: calls().at(-1).requestId, command: 'npx skills update report', output: 'Updating report' }))
    expect(terminal()?.textContent).toContain('Updating report')
    await act(async () => finish({ status: 'completed', output: '✓ Updated report', skillName: 'report', updatedSkills: ['report'] }))
    expect(button('更新 Report')).toBeUndefined()
    expect(button('更新 Helper')).toBeDefined()

    await act(async () => button('更新全部技能')!.click())
    expect(calls()).toHaveLength(2)
    await act(async () => button('确认更新')!.click())
    expect(calls().at(-1)).toMatchObject({ action: 'update-all' })
    expect(calls().at(-1)).not.toHaveProperty('id')
    await act(async () => receive({ type: 'local-skill-cli:progress', requestId: calls().at(-1).requestId, command: 'npx skills update --global', output: 'Updating helper' }))
    expect(terminal()?.textContent).toContain('Updating helper')
    await act(async () => finish({ status: 'completed', output: '✓ Updated helper', updatedSkills: ['helper'] }))
    expect(button('更新 Helper')).toBeUndefined()
    expect(button('检查技能更新')).toBeDefined()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
