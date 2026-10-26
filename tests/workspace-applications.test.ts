/*
 * [INPUT]: Isolated installed-application filesystem and injected native icon reader.
 * [OUTPUT]: Native icon caching/refresh, concurrent scan reuse and optional-icon failure/size boundaries; no Electron or application launch.
 * [POS]: Workspace open-with catalog regression.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { expect, it, vi } from 'vitest'
import { WorkspaceApplications } from '../apps/electron/src/main/workspace-applications'

vi.mock('node:fs/promises', () => ({
  stat: async (path: string) => {
    if (!['/Applications/Visual Studio Code.app', '/System/Applications/Utilities/Terminal.app'].includes(path)) throw new Error('missing')
    return { isDirectory: () => true, isFile: () => false }
  },
  realpath: async (path: string) => path,
  access: async () => {},
}))

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
