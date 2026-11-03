/*
 * [INPUT]: Plugin-owned boai-agent-desktop/SKILL.md.
 * [OUTPUT]: Original guide text from the source/package-relative asset, compatible with direct Node loading.
 * [POS]: Public desktop-plugin skill asset entry, separate from native executable installation.
 * [PROTOCOL]: Update Header and src/.folder.md on change.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

function readGuide() {
  try { return readFileSync(new URL('../skills/boai-agent-desktop/SKILL.md', import.meta.url), 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // Evaluation/dev bundles can live outside dist/runtime. Resolve only this package's
    // public source entry, without guessing a checkout path in a packaged application.
    const entry = createRequire(import.meta.url).resolve('@boai/desktop-plugin/skill')
    return readFileSync(join(dirname(entry), '../skills/boai-agent-desktop/SKILL.md'), 'utf8')
  }
}
export default readGuide()
