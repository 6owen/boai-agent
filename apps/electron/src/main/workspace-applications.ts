/*
 * [INPUT]: Fixed application catalog, local installations and already-authorized filesystem targets.
 * [OUTPUT]: Cached available openers and argv-only launches; default file behavior preserves original safe extensions.
 * [POS]: Main-process external application adapter shared by old openPath and workspace browsing.
 * [PROTOCOL]: Update this Header and owning .folder.md when changed.
 */
import { access, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { WorkspaceApplication } from '@boai/shared/ipc/workspace-files'

interface DesktopOpener { openPath(path: string): Promise<string>; showItemInFolder(path: string): void }
const safeExtensions = new Set(['.md', '.txt', '.markdown', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.csv', '.json', '.xlsx', '.docx', '.pptx', '.svg', '.log'])
export async function openLocalResource(desktop: DesktopOpener, path: string, action: 'open' | 'reveal' = 'open') {
  const info = await stat(path)
  if (action === 'reveal' || !info.isDirectory() && !safeExtensions.has(extname(path).toLowerCase())) { desktop.showItemInFolder(path); return }
  const error = await desktop.openPath(path)
  if (error) throw new Error(error)
}

const catalog: { id: string; name: string; kind: 'editor' | 'terminal'; mac: string; linux?: string }[] = [
  { id: 'vscode', name: 'VS Code', kind: 'editor', mac: 'Visual Studio Code.app', linux: 'code' },
  { id: 'cursor', name: 'Cursor', kind: 'editor', mac: 'Cursor.app', linux: 'cursor' },
  { id: 'xcode', name: 'Xcode', kind: 'editor', mac: 'Xcode.app' },
  { id: 'idea', name: 'IntelliJ IDEA', kind: 'editor', mac: 'IntelliJ IDEA.app', linux: 'idea' },
  { id: 'zed', name: 'Zed', kind: 'editor', mac: 'Zed.app', linux: 'zed' },
  { id: 'sublime', name: 'Sublime Text', kind: 'editor', mac: 'Sublime Text.app', linux: 'subl' },
  { id: 'terminal', name: '终端', kind: 'terminal', mac: 'Utilities/Terminal.app' },
  { id: 'iterm', name: 'iTerm', kind: 'terminal', mac: 'iTerm.app' },
  { id: 'ghostty', name: 'Ghostty', kind: 'terminal', mac: 'Ghostty.app' },
  { id: 'warp', name: 'Warp', kind: 'terminal', mac: 'Warp.app' },
]

export class WorkspaceApplications {
  private installed = new Map<string, { view: WorkspaceApplication; path: string }>()
  private scannedAt = 0
  private scanning?: Promise<void>
  constructor(private desktop: DesktopOpener, private platform: NodeJS.Platform = process.platform, private home = homedir()) {}
  async list(refresh = false): Promise<WorkspaceApplication[]> {
    if (this.scanning) await this.scanning
    else if (refresh || !this.scannedAt || Date.now() - this.scannedAt > 300000) {
      this.scanning = this.scan().finally(() => { this.scanning = undefined })
      await this.scanning
    }
    return [{ id: 'system', name: this.platform === 'darwin' ? '访达' : '系统默认', kind: 'system' }, ...[...this.installed.values()].map(item => ({ ...item.view }))]
  }
  private async scan() {
    const found = new Map<string, { view: WorkspaceApplication; path: string }>()
    await Promise.all(catalog.map(async item => {
      const candidates = this.platform === 'darwin'
        ? [join('/Applications', item.mac), join(this.home, 'Applications', item.mac), join('/System/Applications', item.mac)]
        : this.platform === 'linux' && item.linux ? (process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin').split(delimiter).filter(Boolean).map(directory => join(directory, item.linux!)) : []
      for (const candidate of candidates) {
        try {
          const info = await stat(candidate)
          if (this.platform === 'darwin' ? !info.isDirectory() : !info.isFile()) continue
          if (this.platform !== 'darwin') await access(candidate, constants.X_OK)
          found.set(item.id, { view: { id: item.id, name: item.name, kind: item.kind }, path: await realpath(candidate) }); break
        } catch { /* Missing application is simply omitted from the catalog. */ }
      }
    }))
    this.installed = new Map(catalog.flatMap(item => found.has(item.id) ? [[item.id, found.get(item.id)!] as const] : []))
    this.scannedAt = Date.now()
  }
  async open(path: string, action: 'open' | 'reveal', applicationId?: string) {
    if (action === 'reveal' || !applicationId || applicationId === 'system') return openLocalResource(this.desktop, path, action)
    await this.list()
    const application = this.installed.get(applicationId)
    if (!application) throw new Error('此应用不可用，请刷新打开方式列表')
    if (application.view.kind === 'terminal' && !(await stat(path)).isDirectory()) throw new Error('终端应用仅支持打开文件夹')
    try {
      await stat(application.path)
      if (this.platform === 'darwin') await promisify(execFile)('/usr/bin/open', ['-a', application.path, '--', path], { timeout: 15000, maxBuffer: 32768 })
      else await new Promise<void>((resolve, reject) => {
        const child = spawn(application.path, ['--', path], { detached: true, stdio: 'ignore' })
        child.once('error', reject); child.once('spawn', () => { child.unref(); resolve() })
      })
    } catch {
      this.scannedAt = 0
      throw new Error('应用打开失败，请刷新列表后重试')
    }
  }
}
