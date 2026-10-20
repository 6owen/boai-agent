/*
 * [INPUT]: 独立Git工作目录、源码/技能源和实际构建文件。
 * [OUTPUT]: 旧dist、构建后字节外改和构建期间输入变化不能取得通过身份。
 * [POS]: 开发/CI产物身份的真实文件负例，不启动应用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Plain Node ESM build helper intentionally has no declaration file.
import { buildInputHash, recordBuildIdentity, verifyBuildIdentity } from '../scripts/build-identity.mjs'
// @ts-expect-error Plain Node ESM CLI intentionally has no declaration file.
import { sourceIdentity } from '../scripts/ui-regression.mjs'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'boai-build-identity-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  for (const name of ['src', 'resources', 'dist']) await mkdir(join(root, name))
  await writeFile(join(root, 'src/entry.ts'), 'export const value = 1')
  await writeFile(join(root, 'resources/skill.md'), '固定技能源')
  await writeFile(join(root, 'dist/main.mjs'), 'export const value = 1')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
it('完整同源产物通过，源码变化后旧dist被拒绝', async () => {
  await recordBuildIdentity(await buildInputHash(root), root)
  await expect(verifyBuildIdentity(root)).resolves.toHaveProperty('version', 1)
  await writeFile(join(root, 'src/entry.ts'), 'export const value = 2')
  await expect(verifyBuildIdentity(root)).rejects.toThrow(/源码/)
})
it('构建后修改任一实际输出字节会失败', async () => {
  await recordBuildIdentity(await buildInputHash(root), root)
  await writeFile(join(root, 'dist/main.mjs'), 'export const wrong = true')
  await expect(verifyBuildIdentity(root)).rejects.toThrow(/字节已变化/)
})
it('技能源在构建期间变化不能登记构建完成', async () => {
  const initial = await buildInputHash(root)
  await writeFile(join(root, 'resources/skill.md'), '构建中外改的技能源')
  await expect(recordBuildIdentity(initial, root)).rejects.toThrow(/输入变化/)
})
it('Tailwind配置是实际构建和测试输入，外改不能复用旧产物', async () => {
  await writeFile(join(root, 'tailwind.config.ts'), 'export default { theme: {} }')
  execFileSync('git', ['add', 'tailwind.config.ts'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root })
  await recordBuildIdentity(await buildInputHash(root), root)
  const before = await sourceIdentity(root)
  await writeFile(join(root, 'tailwind.config.ts'), 'export default { theme: { colors: {} } }')
  expect((await sourceIdentity(root)).sourceHash).not.toBe(before.sourceHash)
  await expect(verifyBuildIdentity(root)).rejects.toThrow(/源码/)
})
