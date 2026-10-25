/*
 * [INPUT]: 当前用户消息的内置管理技能引用与宿主随包技能目录。
 * [OUTPUT]: 仅从固定目录读取已选择技能的操作文档，供 API/本机共用 bootstrap；引用不扩大权限。
 * [POS]: 管理命令标签到真实 SKILL.md 的宿主装配边界。
 * [PROTOCOL]: 修改同步 Header 与所属 .folder.md。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ComposerReference } from '@boai/shared/domain/composer-references'
import { managementSkills } from '@boai/shared/domain/management-skills'

export async function managementSkillInstructions(references: ComposerReference[], bundledRoot?: string): Promise<string> {
  const selected = [...new Set(references.filter(ref => ref.kind === 'builtin-skill').map(ref => ref.id))]
  if (!selected.length) return ''
  if (!bundledRoot) throw new Error('内置管理技能目录不可用，请重新启动开发服务')
  const documents = await Promise.all(selected.map(async id => {
    const skill = managementSkills[id]
    const document = await readFile(join(bundledRoot, skill.skillName, 'SKILL.md'), 'utf8')
    if (!document.trim() || Buffer.byteLength(document) > 64 * 1024) throw new Error(`内置技能文档不可用：${skill.name}`)
    return `## ${skill.name}\n${document}`
  }))
  return `[Selected BOAI management skills]\n以下是用户本轮通过命令标签选择的内置操作文档。按当前用户要求使用，不自行执行未要求的操作。\n\n${documents.join('\n\n')}`
}
