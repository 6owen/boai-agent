/*
 * [INPUT]: BOAI五类内置管理技能与随包SKILL.md身份。
 * [OUTPUT]: Composer命令/标签和宿主文档装配共用的固定目录；标签不授予操作权限。
 * [POS]: 内置管理技能元数据，正文归resources/agent-skills。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
export const managementSkillIds = ['automations', 'skills', 'sources', 'prompts', 'contacts'] as const
export type ManagementSkillId = typeof managementSkillIds[number]
export const managementSkills = {
  automations: { name: '管理定时任务', skillName: 'boai-manage-automations', version: 1 },
  skills: { name: '管理技能', skillName: 'boai-manage-skills', version: 1 },
  sources: { name: '管理数据源', skillName: 'boai-manage-sources', version: 1 },
  prompts: { name: '管理提示词', skillName: 'boai-manage-prompts', version: 1 },
  contacts: { name: '管理通讯录', skillName: 'boai-manage-contacts', version: 1 },
} as const
