/*
 * [OUTPUT]: 数据设置增加明确诊断导出，取消零成功提示、操作反馈沿Sonner。
 * [INPUT]: 快照领域类型、DesktopApi 与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 数据目录/备份复用公共设置分区、Card与横向行；说明归图标Tooltip，原打开目录与导出回调保持。
 * [POS]: apps/electron/apps/electron/src/renderer/pages/settings/data.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { FolderOpen, HardDrive, Download } from '@/components/icons'
import type { DesktopApi } from '@boai/shared/ipc'
import type { Snapshot } from '@boai/shared/domain'
import type { useMutation } from '@/components/common'
import { SettingsLayout, SettingsSection, SettingsCard, SettingsRow, SettingsHelp } from './settings-layout'

export function DataSettings({ api, snapshot, busy, run, onNotice }: { api: DesktopApi; snapshot: Snapshot; busy: boolean; run: ReturnType<typeof useMutation>['run']; onNotice(message: string): void }) {
  return <SettingsLayout title={<>数据与备份<SettingsHelp label="数据存储说明">
    <p>员工、记忆与工作文件保存在这台电脑上。</p>
    <p>使用云端模型时，获准的上下文会发送给对应服务。</p>
  </SettingsHelp></>}>
    <SettingsSection first title={<>本地数据目录<SettingsHelp label="完整数据目录">{snapshot.dataPath}</SettingsHelp></>}>
      <SettingsCard><SettingsRow>
        <div className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground" title={snapshot.dataPath}>{snapshot.dataPath}</div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={() => { void run(async () => { await api.request('openPath', { path: snapshot.dataPath }) }) }}><FolderOpen size={16} />打开目录</Button>
      </SettingsRow></SettingsCard>
    </SettingsSection>
    <SettingsSection title="备份">
      <SettingsCard><SettingsRow>
        <div className="flex min-w-0 items-center gap-1 font-medium"><span>本地备份</span><SettingsHelp label="备份说明">保存本地数据、员工系统文件与工作产物。导出不包含模型凭据。</SettingsHelp></div>
        <Button size="sm" className="shrink-0" disabled={busy} onClick={() => { void run(async () => { const path = await api.request('exportBackup', undefined); if (path) onNotice(`备份已导出：${path}`) }) }}><HardDrive size={16} />导出备份</Button>
      </SettingsRow></SettingsCard>
    </SettingsSection>
    {api.exportDiagnostics && <SettingsSection title="故障诊断">
      <SettingsCard><SettingsRow>
        <div className="flex min-w-0 items-center gap-1 font-medium"><span>运行记录</span><SettingsHelp label="诊断记录说明">导出应用版本、进程退出和系统中断记录；不包含聊天正文、录音或模型凭据。</SettingsHelp></div>
        <Button variant="secondary" size="sm" className="shrink-0" disabled={busy} onClick={() => { void run(async () => { const path = await api.exportDiagnostics!(); if (path) toast.success(`诊断记录已导出：${path}`) }) }}><Download size={16} />导出诊断</Button>
      </SettingsRow></SettingsCard>
    </SettingsSection>}
  </SettingsLayout>
}
