/*
 * [INPUT]: Real temporary employee directories and injected desktop openers.
 * [OUTPUT]: Directory pagination/source revocation, traversal/link rejection and original default-open regression.
 * [POS]: Workspace browser filesystem boundary tests; no GUI or personal files.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceFileScope } from '../packages/shared/src/ipc/workspace-files'
import { WorkspaceFileService } from '../apps/electron/src/main/workspace-files'
import { WorkspaceApplications, openLocalResource } from '../apps/electron/src/main/workspace-applications'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-workspace-files-'))); roots.push(root)
  const workspace = join(root, 'employee'); await mkdir(workspace)
  const scope = { employeeId: 'employee', conversationId: 'chat' }, open = vi.fn(async () => {})
  const resolve = vi.fn(async (input: WorkspaceFileScope) => { if (input.employeeId !== scope.employeeId || input.conversationId !== scope.conversationId) throw new Error('scope revoked'); return workspace })
  const files = new WorkspaceFileService(resolve, open)
  return { root, workspace, scope, files, resolve, open }
}
it('browses the employee directory and returns root-relative navigation without scanning nested contents', async () => {
  const f = await fixture(); await mkdir(join(f.workspace, 'child')); await writeFile(join(f.workspace, 'child', 'note.md'), 'original')
  const page = await f.files.list({ scope: f.scope })
  expect(page.entries.map(entry => entry.name)).toEqual(['child']); expect(page.parentPath).toBeUndefined()
  const child = await f.files.list({ scope: f.scope, relativePath: 'child' })
  expect(child).toMatchObject({ rootPath: f.workspace, relativePath: 'child', parentPath: '', entries: [{ name: 'note.md', relativePath: 'child/note.md', kind: 'file' }] })
})
it('does not escape via absolute/traversal paths or any symlink component', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'private.txt'), 'private'); await symlink(f.root, join(f.workspace, 'escape'))
  expect((await f.files.list({ scope: f.scope })).entries[0]?.kind).toBe('symlink')
  for (const relativePath of ['../private.txt', f.root, 'escape/private.txt', 'escape']) {
    await expect(f.files.open({ scope: f.scope, relativePath })).rejects.toThrow()
  }
  expect(f.open).not.toHaveBeenCalled()
})
it('paginates deterministically and refuses a cursor when the directory changes', async () => {
  const f = await fixture()
  await Promise.all(Array.from({ length: 105 }, (_, i) => writeFile(join(f.workspace, `${String(i).padStart(3, '0')}.txt`), 'x')))
  const first = await f.files.list({ scope: f.scope }); expect(first.entries).toHaveLength(100)
  const next = await f.files.list({ scope: f.scope, cursor: first.nextCursor }); expect(next.entries).toHaveLength(5); expect(next.nextCursor).toBeUndefined()
  expect(new Set([...first.entries, ...next.entries].map(entry => entry.relativePath)).size).toBe(105)
  await writeFile(join(f.workspace, 'new.txt'), 'changed')
  await expect(f.files.list({ scope: f.scope, cursor: first.nextCursor })).rejects.toThrow('目录已变化')
})
it('rechecks authorization before returning pages or opening targets after asynchronous file checks', async () => {
  const f = await fixture(); await writeFile(join(f.workspace, 'note.md'), 'x')
  f.resolve.mockResolvedValueOnce(f.workspace).mockRejectedValue(new Error('scope revoked'))
  await expect(f.files.open({ scope: f.scope, relativePath: 'note.md' })).rejects.toThrow('scope revoked'); expect(f.open).not.toHaveBeenCalled()
  f.resolve.mockResolvedValueOnce(f.workspace)
  await expect(f.files.list({ scope: f.scope })).rejects.toThrow('scope revoked')
})
it('passes only resolved targets and explicit application IDs to the opener', async () => {
  const f = await fixture(); const name = 'quote $(touch nope).md'; await writeFile(join(f.workspace, name), 'x')
  await f.files.open({ scope: f.scope, relativePath: name, applicationId: 'vscode' })
  expect(f.open).toHaveBeenCalledWith(join(f.workspace, name), 'open', 'vscode')
  await expect(f.files.open({ scope: f.scope, relativePath: name, executable: '/bin/sh' })).rejects.toThrow()
})
it('preserves the original default open/reveal safety behavior and reports desktop failure', async () => {
  const f = await fixture(); const desktop = { openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() }
  await writeFile(join(f.workspace, 'script.sh'), 'echo 1'); await writeFile(join(f.workspace, 'note.md'), 'x')
  await openLocalResource(desktop, join(f.workspace, 'script.sh')); expect(desktop.showItemInFolder).toHaveBeenCalledWith(join(f.workspace, 'script.sh')); expect(desktop.openPath).not.toHaveBeenCalled()
  await openLocalResource(desktop, join(f.workspace, 'note.md')); expect(desktop.openPath).toHaveBeenCalledOnce()
  desktop.openPath.mockResolvedValue('open failed'); await expect(openLocalResource(desktop, f.workspace)).rejects.toThrow('open failed')
})
it('unknown applications cannot become arbitrary executable launchers', async () => {
  const f = await fixture(); const applications = new WorkspaceApplications({ openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() }, 'win32', f.root)
  expect(await applications.list()).toEqual([{ id: 'system', name: '系统默认', kind: 'system' }])
  await expect(applications.open(f.workspace, 'open', '/bin/sh')).rejects.toThrow('此应用不可用')
})
