/*
 * [INPUT]: 快照领域类型、DesktopApi 与公共组件。
 * [OUTPUT]: 数据目录和备份操作界面。
 * [POS]: src/renderer/pages/settings/data.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { FolderOpen, HardDrive } from '@/components/icons'
import type { DesktopApi } from '@shared/ipc'
import type { Snapshot } from '@shared/domain'
import type { useMutation } from '@/components/common'

export function DataSettings({ api, snapshot, busy, run, onNotice }: { api: DesktopApi; snapshot: Snapshot; busy: boolean; run: ReturnType<typeof useMutation>['run']; onNotice(message: string): void }) {
  return <><div className="page-heading"><div><h2>数据与备份</h2><p>员工、记忆与工作文件保存在这台电脑上。</p></div></div><article className="connection-card"><h3>本地数据目录</h3><p className="resource-path">{snapshot.dataPath}</p><button className="button subtle" onClick={() => { void run(async () => { await api.request('openPath', { path: snapshot.dataPath }) }) }}><FolderOpen size={16} />打开目录</button></article><article className="connection-card"><h3>导出备份</h3><p>保存本地数据、员工系统文件与工作产物。导出不包含模型凭据。</p><button className="button primary" disabled={busy} onClick={() => { void run(async () => { const path = await api.request('exportBackup', undefined); if (path) onNotice(`备份已导出：${path}`) }) }}><HardDrive size={16} />导出备份</button></article><p className="field-hint">数据在本地保存不代表模型离线。使用云端模型时，获准的上下文会发送给对应服务。</p></>
}
