/*
 * [INPUT]: 实际随包 SKILL.md、共享管理目录及宿主文档装配。
 * [OUTPUT]: 五个命令有完整分发文档，仅装配选定文档；未选择/缺分发不假成功。
 * [POS]: 管理技能资源合同回归，不调用模型或 Electron。
 * [PROTOCOL]: 修改同步 Header 与 tests/.folder.md。
 */
import { expect, test } from 'vitest'
import { resolve } from 'node:path'
import manifest from '../resources/agent-skills/manifest.json'
import { managementSkillIds, managementSkills } from '../src/shared/domain/management-skills'
import { managementSkillInstructions } from '../src/runtime/modules/resources/management-skills'
import { composerCommands, managementSkillReference } from '../src/renderer/pages/conversations/composer-commands'

test('all five slash commands resolve to their shipped workflow, without loading unselected documents', async () => {
  for (const id of managementSkillIds) {
    const skill = managementSkills[id]
    expect(manifest.skills).toContain(skill.skillName)
    expect(composerCommands.find(command => command.id === id)?.managementSkill).toBe(id)
    const reference = managementSkillReference(id, 'bobo')
    const instructions = await managementSkillInstructions([reference, reference], resolve('resources/agent-skills'))
    expect(instructions).toContain(`name: ${skill.skillName}`)
    expect(instructions).toContain('boai_catalog')
    expect(instructions).toContain('boai_receipt')
    expect(instructions.split(`name: ${skill.skillName}`)).toHaveLength(2)
    for (const other of managementSkillIds.filter(value => value !== id)) expect(instructions).not.toContain(`name: ${managementSkills[other].skillName}`)
  }
})

test('no management tag loads no document, and a selected tag cannot silently succeed without the bundle', async () => {
  expect(await managementSkillInstructions([])).toBe('')
  await expect(managementSkillInstructions([managementSkillReference('prompts', 'bobo')])).rejects.toThrow('内置管理技能目录不可用')
})
