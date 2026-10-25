/*
 * [INPUT]: 快照领域类型、DesktopApi 与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 数据目录和备份操作界面。
 * [POS]: apps/electron/src/renderer/pages/settings/data.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FolderOpen, HardDrive } from '@/components/icons'
import type { DesktopApi } from '@boai/shared/ipc'
import type { Snapshot } from '@boai/shared/domain'
import type { useMutation } from '@/components/common'

export function DataSettings({ api, snapshot, busy, run, onNotice }: { api: DesktopApi; snapshot: Snapshot; busy: boolean; run: ReturnType<typeof useMutation>['run']; onNotice(message: string): void }) {
  return <><div className="page-heading"><div><h2>数据与备份</h2><p>员工、记忆与工作文件保存在这台电脑上。</p></div></div><Card className="connection-card gap-0 p-4"><CardContent className="p-0"><h3>本地数据目录</h3><p className="resource-path">{snapshot.dataPath}</p><Button variant="secondary" onClick={() => { void run(async () => { await api.request('openPath', { path: snapshot.dataPath }) }) }}><FolderOpen size={16} />打开目录</Button></CardContent></Card><Card className="connection-card gap-0 p-4"><CardContent className="p-0"><h3>导出备份</h3><p>保存本地数据、员工系统文件与工作产物。导出不包含模型凭据。</p><Button disabled={busy} onClick={() => { void run(async () => { const path = await api.request('exportBackup', undefined); if (path) onNotice(`备份已导出：${path}`) }) }}><HardDrive size={16} />导出备份</Button></CardContent></Card><p className="field-hint">数据在本地保存不代表模型离线。使用云端模型时，获准的上下文会发送给对应服务。</p></>
}
