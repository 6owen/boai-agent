/*
 * [INPUT]: Explicit version/bump or bumpp's interactive selection on a clean checkout.
 * [OUTPUT]: Application version and buildVersion updated together; tag/push belong to publication.
 * [POS]: Local release version entry point; internal workspace packages keep independent versions.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { versionBump } from 'bumpp'

const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export async function bumpApplicationVersion(release = 'prompt', { cwd = process.cwd(), interactive = true } = {}) {
  if (!['prompt', 'patch', 'minor', 'major'].includes(release) && !stable.test(release)) throw Error('个人发布使用 patch、minor、major 或稳定版本 X.Y.Z')
  const file = resolve(cwd, 'package.json'), original = await readFile(file, 'utf8')
  const before = JSON.parse(original)
  if (!stable.test(before.version) || before.build?.buildVersion !== before.version) throw Error('当前应用版本与构建版本不一致')
  return versionBump({
    cwd, release, files: ['package.json'], commit: false, tag: false, push: false,
    confirm: interactive, interface: interactive, ignoreScripts: true,
    execute: async () => {
      const value = JSON.parse(await readFile(file, 'utf8'))
      const higher = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] }
      if (!stable.test(value.version) || higher(value.version, before.version) <= 0) {
        // Interactive bumpp also offers prereleases; restore its single-file edit on rejection.
        await writeFile(file, original)
        throw Error('个人发布须递增稳定版本 X.Y.Z，已恢复原文件')
      }
      value.build.buildVersion = value.version
      await writeFile(file, JSON.stringify(value, null, 2) + '\n')
    },
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw new Error('用法：pnpm release:version [patch|minor|major|X.Y.Z]')
  await bumpApplicationVersion(process.argv[2])
}
