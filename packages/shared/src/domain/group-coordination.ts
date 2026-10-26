/*
 * [INPUT]: 普通 API 群的原用户请求、冻结成员与已提交回复身份。
 * [OUTPUT]: 共享请求解释、有界顺序进度与当前请求的可选逐回复字数上限；不授予工具或 Work 权限。
 * [POS]: 跨进程群协作状态合同，旧轮次字段缺省保持兼容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export type GroupInterpretation = { mode: 'independent' } | { mode: 'ordered'; instruction: string; agentIds: string[]; maxReplyCharacters?: number | null }
export interface GroupCoordination {
  mode: 'independent' | 'ordered'
  instruction?: string
  maxReplyCharacters?: number | null
  agentIds: string[]
  sourceRunId: string
  memberConfigVersions: Record<string, number>
  revision: number
  completed: { agentId: string; messageId: string; eventId: string; contentHash: string }[]
}
