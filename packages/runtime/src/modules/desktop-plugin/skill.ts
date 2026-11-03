/*
 * [INPUT]: The desktop plugin's shipped guide and shared skill document parser.
 * [OUTPUT]: Stable plugin skill identity and the hash of its actual Markdown bytes.
 * [POS]: Runtime-only plugin skill descriptor; never persisted as an employee resource.
 * [PROTOCOL]: Update Header and desktop-plugin/.folder.md on change.
 */
import { createHash } from 'node:crypto'
import content from '@boai/desktop-plugin/skill'
import { DESKTOP_PLUGIN_ID, type DesktopPluginSkill } from '@boai/shared/plugins/desktop-tools'
import { parseSkillDocument } from '../resources/local-resources'

const metadata = parseSkillDocument(content, { strictName: true })
export const desktopPluginSkill: DesktopPluginSkill = {
  resourceId: `plugin:${DESKTOP_PLUGIN_ID}:${metadata.name}`, source: 'plugin', pluginId: DESKTOP_PLUGIN_ID,
  name: metadata.name, description: metadata.description, content,
  contentHash: createHash('sha256').update(content).digest('hex'),
}
