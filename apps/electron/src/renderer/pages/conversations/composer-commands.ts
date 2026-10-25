/*
 * [INPUT]: Composer既有快捷命令及本地图标。
 * [OUTPUT]: 五类bobo管理命令分别说明实际用途并插入内置技能标签；与既有草稿展开/文件/目录动作共用目录。
 * [POS]: 会话前端的命令展示真源，不执行操作。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Check, FileText, FolderOpen, Clock, Zap, Database, Users } from '@/components/icons'
import { managementSkillIds, managementSkills, type ManagementSkillId } from '@boai/shared/domain/management-skills'
import type { ComposerReference } from '@boai/shared/domain/composer-references'

const managementIcons = { automations: Clock, skills: Zap, sources: Database, prompts: FileText, contacts: Users }
const managementDescriptions: Record<ManagementSkillId, string> = {
  automations: '创建、查看和调整定时任务',
  skills: '查找、安装和配置技能',
  sources: '添加、配置和测试数据源',
  prompts: '创建、编辑和删除提示词',
  contacts: '管理员工和群聊',
}
export interface ComposerCommand { id: string; name: string; description: string; icon: typeof FileText; prompt?: string; managementSkill?: ManagementSkillId }

export const composerCommands: ComposerCommand[] = [
  ...managementSkillIds.map(id => ({ id, name: managementSkills[id].name, description: `/${id} · ${managementDescriptions[id]}`, icon: managementIcons[id], managementSkill: id })),
  { id: 'summarize', name: '总结会话', description: '/summarize · 填入草稿后发送', icon: FileText, prompt: '请总结当前会话的关键结论、分歧和下一步建议。' },
  { id: 'todo', name: '整理待办', description: '/todo · 填入草稿后发送', icon: Check, prompt: '请根据当前会话整理待办事项，列出负责人、交付内容和待确认问题。' },
  { id: 'files', name: '查看文件', description: '/files · 打开聊天文件', icon: FileText },
  { id: 'workspace', name: '打开工作目录', description: '/workspace', icon: FolderOpen },
]

export function managementSkillReference(id: ManagementSkillId, agentId: string): ComposerReference {
  const skill = managementSkills[id]
  return { kind: 'builtin-skill', id, agentId, name: skill.name, version: skill.version }
}
