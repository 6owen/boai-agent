/*
 * [OUTPUT]: 命令选择保留明确无障碍名称，新增恢复动作不影响字段定位和操作。
 * [OUTPUT]: 展示已记住的命令授权，并提供恢复逐次确认的明确操作。
 * [INPUT]: API员工受控命令能力、禁用状态与配置变更回调。
 * [OUTPUT]: 创建/编辑共用命令执行设置；仅控制命令工具，不影响定时任务资格。
 * [POS]: 员工API能力字段，本机Agent权限继续使用各自运行配置。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Button } from '@/components/ui/button'
import { Field } from '@/components/common'
import { SelectField } from '@/components/ui/select-field'

export function AgentCommandField({ value, onChange, disabled, full, alwaysAllowed, onRevoke }: { value: boolean; onChange(value: boolean): void; disabled?: boolean; full?: boolean; alwaysAllowed?: boolean; onRevoke?(): void }) {
  return <Field label="命令执行" full={full}>
    <SelectField aria-label="命令执行" value={value ? 'allowed' : 'disabled'} disabled={disabled} onValueChange={value => onChange(value === 'allowed')} options={[{ value: 'allowed', label: alwaysAllowed ? '允许，不再询问' : '允许，执行前确认' }, { value: 'disabled', label: '关闭' }]} />
    {alwaysAllowed && onRevoke && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onRevoke}>恢复逐次确认</Button>}
  </Field>
}
