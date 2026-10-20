/*
 * [INPUT]: Composer既有快捷命令及本地图标。
 * [OUTPUT]: 输入候选和消息标签共用的命令目录，保留原草稿展开/文件/目录动作。
 * [POS]: 会话前端的命令展示真源，不执行操作。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Check, FileText, FolderOpen } from '@/components/icons'

export const composerCommands = [
  { id: 'summarize', name: '总结会话', description: '/summarize · 填入草稿后发送', icon: FileText, prompt: '请总结当前会话的关键结论、分歧和下一步建议。' },
  { id: 'todo', name: '整理待办', description: '/todo · 填入草稿后发送', icon: Check, prompt: '请根据当前会话整理待办事项，列出负责人、交付内容和待确认问题。' },
  { id: 'files', name: '查看文件', description: '/files · 打开聊天文件', icon: FileText },
  { id: 'workspace', name: '打开工作目录', description: '/workspace', icon: FolderOpen },
]
