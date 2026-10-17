/*
 * [INPUT]: 员工整体执行权限、旧原生配置占位、禁用状态与配置变更回调。
 * [OUTPUT]: 创建/编辑共用三档执行权限；当前权限说明放在标题后的信息图标Tooltip，控件下方不显示说明。
 * [OUTPUT]: 完全访问选项使用较深橘色，深色主题及聚焦时保持强调。
 * [POS]: API/Codex/Claude共用的整体权限入口，不拆分访问范围与审批策略。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useId } from 'react'
import { executionPermissionLabels, type ExecutionPermission } from '@shared/domain/execution'
import { ConnectionSettingRow } from '@/pages/settings/connection-layout'
import { SelectField } from '@/components/ui/select-field'

const descriptions: Record<ExecutionPermission, string> = {
  'read-only': '仅查看资料，禁止修改文件、写入数据源、网页交互和执行命令。',
  ask: '修改文件、写入数据源、网页交互和执行命令前请求批准。',
  'full-access': '允许执行操作，无需逐次批准。',
}
export function AgentPermissionField({ value, onChange, disabled, full }: { value?: ExecutionPermission; onChange(value: ExecutionPermission): void; disabled?: boolean; full?: boolean }) {
  const id = useId()
  return <ConnectionSettingRow label="执行权限" htmlFor={id} full={full} hint={value ? descriptions[value] : '当前沿用本机 Agent 已有权限；选择后统一设置访问范围与操作审批。'}><div className="connection-setting-control">
    <SelectField id={id} aria-label="执行权限" value={value ?? ''} disabled={disabled} onValueChange={selected => { if (selected === 'read-only' || selected === 'ask' || selected === 'full-access') onChange(selected) }} options={[...(!value ? [{ value: '', label: '沿用当前本机权限' }] : []), ...Object.entries(executionPermissionLabels).map(([value, label]) => ({ value, label, className: value === 'full-access' ? 'text-orange-600 dark:text-orange-400 [--accent-foreground:var(--color-orange-600)] dark:[--accent-foreground:var(--color-orange-400)]' : undefined }))]} />
  </div></ConnectionSettingRow>
}
