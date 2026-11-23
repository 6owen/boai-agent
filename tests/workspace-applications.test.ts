/*
 * [INPUT]: Isolated installed-application filesystem and injected native icon reader.
 * [OUTPUT]: Native icon caching, refresh, failure boundaries and skill file opening by catalog identity with read-only enforcement.
 * [POS]: Workspace open-with catalog regression.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { expect, it, vi } from 'vitest'
import { FileOpening } from '../apps/electron/src/main/file-opening'
import { WorkspaceApplications } from '../apps/electron/src/main/workspace-applications'

const skillFile = '/test-home/.agents/skills/example/SKILL.md'
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...fs,
    stat: async (path: string) => {
      if (path === skillFile) return { isDirectory: () => false, isFile: () => true }
      if (basename(path) === 'SKILL.md') return fs.stat(path)
      if (!['/Applications/Visual Studio Code.app', '/System/Applications/Utilities/Terminal.app'].includes(path)) throw new Error('missing')
      return { isDirectory: () => true, isFile: () => false }
    },
    realpath: async (path: string) => path,
    access: async () => {},
  }
})

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lEAAAAAASUVORK5CYII='
function fixture(iconForPath: (path: string) => Promise<string | undefined>) {
  return new WorkspaceApplications({ openPath: vi.fn(async () => ''), showItemInFolder: vi.fn(), iconForPath }, 'darwin', '/test-home')
}

it('shares one scan across concurrent reads and refreshes native icons with the application catalog', async () => {
  const icons = vi.fn<(path: string) => Promise<string | undefined>>().mockResolvedValue(png), applications = fixture(icons)
  const [first, concurrent] = await Promise.all([applications.list(), applications.list()])
  expect(first).toEqual(concurrent)
  expect(first.map(item => [item.id, item.iconDataUrl])).toEqual([['system', png], ['vscode', png], ['terminal', png]])
  expect(icons.mock.calls).toEqual(expect.arrayContaining([
    ['/System/Library/CoreServices/Finder.app'], ['/Applications/Visual Studio Code.app'], ['/System/Applications/Utilities/Terminal.app'],
  ]))
  expect(icons).toHaveBeenCalledTimes(3)
  await applications.list(); expect(icons).toHaveBeenCalledTimes(3)
  icons.mockResolvedValue(undefined)
  const refreshed = await applications.list(true)
  expect(icons).toHaveBeenCalledTimes(6)
  expect(refreshed.map(item => item.id)).toEqual(['system', 'vscode', 'terminal'])
  expect(refreshed.every(item => !item.iconDataUrl)).toBe(true)
})

it('keeps installed applications available when native icon lookup fails', async () => {
  const applications = fixture(async () => { throw new Error('native icon unavailable') })
  expect(await applications.list()).toEqual([
    { id: 'system', name: '访达', kind: 'system' },
    { id: 'vscode', name: 'VS Code', kind: 'editor' },
    { id: 'terminal', name: '终端', kind: 'terminal' },
  ])
})

it.each(['file:///Applications/icon.png', `data:image/png;base64,${'A'.repeat(128 * 1024)}`])('omits unsupported or oversized icon payloads without dropping openers', async data => {
  const applications = await fixture(async () => data).list()
  expect(applications).toHaveLength(3)
  expect(applications.every(item => !item.iconDataUrl)).toBe(true)
})

it('opens and reveals the catalog-resolved skill file and forwards the selected editor ID', async () => {
  const desktop = { openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() }
  const applications = new WorkspaceApplications(desktop, 'darwin', '/test-home')
  const request = vi.fn().mockResolvedValue({ skill: { source: 'global' }, filePath: skillFile })
  const files = new FileOpening(request, applications, '/test-data')
  const target = { kind: 'local-skill', id: 'skill-example' }

  await files.open({ target })
  expect(desktop.openPath).toHaveBeenCalledExactlyOnceWith(skillFile)
  await files.open({ target, action: 'reveal' })
  expect(desktop.showItemInFolder).toHaveBeenCalledExactlyOnceWith(skillFile)

  const openEditor = vi.spyOn(applications, 'open').mockResolvedValueOnce(undefined)
  await files.open({ target, applicationId: 'vscode' })
  expect(openEditor).toHaveBeenCalledExactlyOnceWith(skillFile, 'open', 'vscode')
  expect(request.mock.calls).toEqual(Array(3).fill(['getLocalSkillDetail', { id: target.id }]))
  await expect(files.open({ target: { ...target, path: '/tmp/other.md' } })).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(3)
})

it.each(['builtin', 'plugin'])('allows revealing a %s skill and keeps it read-only', async source => {
  const desktop = { openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() }
  const applications = new WorkspaceApplications(desktop, 'darwin', '/test-home')
  const content = '# Skill\n说明'
  const request = vi.fn().mockResolvedValue({ skill: { source }, filePath: skillFile, content })
  const files = new FileOpening(request, applications, '/test-data')
  const target = { kind: 'local-skill', id: 'skill-example' }
  const open = vi.spyOn(applications, 'open').mockResolvedValue(undefined)
  try {
    for (const applicationId of [undefined, 'vscode']) {
      await files.open({ target, applicationId })
      const [copy, action, application] = open.mock.lastCall!
      expect([action, application]).toEqual(['open', applicationId])
      expect(copy).not.toEqual(skillFile)
      expect(basename(copy)).toBe('SKILL.md')
      expect(await readFile(copy, 'utf8')).toBe(content)
      if (process.platform !== 'win32') expect((await stat(copy)).mode & 0o222).toBe(0)
    }
    await files.open({ target, action: 'reveal' })
    expect(open).toHaveBeenLastCalledWith(skillFile, 'reveal', undefined)
  } finally { await files.close() }
  for (const [copy, action] of open.mock.calls) {
    if (action === 'open') await expect(readFile(copy)).rejects.toMatchObject({ code: 'ENOENT' })
  }
})
