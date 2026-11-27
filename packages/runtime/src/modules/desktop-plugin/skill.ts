/*
 * [OUTPUT]: 桌面技能以稳定资源 ID 路由并按需加载；绑定描述按实际 YAML 读取并兼容旧文件。
 * [INPUT]: The desktop plugin's shipped guide and shared skill document parser.
 * [OUTPUT]: Stable plugin skill identity and the hash of its actual Markdown bytes.
 * [POS]: Runtime-only plugin skill descriptor; never persisted as an employee resource.
 * [PROTOCOL]: Update Header and desktop-plugin/.folder.md on change.
 */
import { createHash } from 'node:crypto'
import { DESKTOP_PLUGIN_ID, DESKTOP_PLUGIN_SKILL_ID, type DesktopPluginSkill } from '@boai/shared/plugins/desktop-tools'
import { parseSkillDocument } from '../resources/local-resources'

let bundledGuide: Promise<DesktopPluginSkill> | undefined

export function loadDesktopPluginSkill(): Promise<DesktopPluginSkill> {
  return bundledGuide ??= import('@boai/desktop-plugin/skill').then(({ default: content }): DesktopPluginSkill => {
    const { name, description } = parseSkillDocument(content, { strictName: true })
    return {
      resourceId: DESKTOP_PLUGIN_SKILL_ID, source: 'plugin', pluginId: DESKTOP_PLUGIN_ID,
      name, description, content, contentHash: createHash('sha256').update(content).digest('hex'),
    }
  }).catch(error => {
    bundledGuide = undefined
    throw error
  })
}
