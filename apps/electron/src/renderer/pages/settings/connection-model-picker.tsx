/*
 * [INPUT]: DesktopApi、当前连接草稿与模型变更回调。
 * [OUTPUT]: 设置页通过共用 ModelPicker 呈现默认模型分组、目录获取和手动编辑；当前凭据、请求隔离及选中模型保持。
 * [POS]: 模型连接弹窗的布局入口，目录状态由共用控件管理。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { ModelPicker } from '@/components/common/model-picker'
import type { ConnectionInput } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'

export function ConnectionModelPicker({ api, draft, onChange }: { api: DesktopApi; draft: ConnectionInput; onChange: (model: string) => void }) {
  return <ModelPicker api={api} draft={draft} onChange={onChange} layout="connection" />
}
