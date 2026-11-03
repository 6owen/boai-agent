/*
 * [INPUT]: Plugin-owned boai-agent-desktop/SKILL.md.
 * [OUTPUT]: Original guide text embedded into application bundles; no runtime file lookup.
 * [POS]: Public desktop-plugin skill asset entry, separate from native executable installation.
 * [PROTOCOL]: Update Header and src/.folder.md on change.
 */
import content from '../skills/boai-agent-desktop/SKILL.md?raw'
export default content
