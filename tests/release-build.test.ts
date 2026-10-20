/*
 * [INPUT]: 原构建配置、个人候选身份和临时真实文件/链接。
 * [OUTPUT]: 个人签名配置保留原资源/原生依赖；错版本/架构/签名拒绝，文件字节/模式/链接可核对。
 * [POS]: 候选构建合同；不实际打包、不运行GUI或发布资产。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdtemp, writeFile, mkdir, symlink, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Node candidate builder has no declaration file.
import { personalMacConfiguration, assertPersonalBundle, releaseFile, bundleInventory } from '../scripts/release-build.mjs'
const sha = 'a'.repeat(40), version = '0.2.4'
const metadata = { version, build: { buildVersion: version, appId: 'com.boai.agent', productName: 'BoAI Agent', directories: { output: 'release', buildResources: 'resources' }, files: ['dist/**/*', 'package.json'], asar: true, asarUnpack: ['dist/native/**/*'], npmRebuild: false, protocols: [{ schemes: ['boai'] }], electronDist: 'node_modules/electron/dist', mac: { icon: 'resources/app-icons/default.icns', category: 'public.app-category.productivity', target: ['dmg'] }, extraMetadata: { existing: 'keep' }, linux: { target: ['AppImage'] } } }
it('个人配置只覆盖候选输出/签名/目标，保留原文件、原生助手、协议和现有metadata', () => {
  const before = structuredClone(metadata), config = personalMacConfiguration(metadata, { output: '/fixture/candidate', sha, version })
  expect(config).toMatchObject({ files: metadata.build.files, asar: true, asarUnpack: metadata.build.asarUnpack, npmRebuild: false, protocols: metadata.build.protocols, electronDist: metadata.build.electronDist, directories: { output: '/fixture/candidate', buildResources: 'resources' }, mac: { icon: metadata.build.mac.icon, category: metadata.build.mac.category, target: ['dmg', 'zip'], identity: '-', hardenedRuntime: false, notarize: false }, extraMetadata: { existing: 'keep', boaiRelease: { sha, arch: 'arm64', applicationVersion: version, channel: 'personal-macos-arm64' } }, linux: metadata.build.linux })
  expect(metadata).toEqual(before)
})
it.each([{ version: '0.2.3' }, { sha: 'short' }, { version: 'v0.2.4' }])('配置本身也拒绝错版本或SHA：%j', patch => expect(() => personalMacConfiguration(metadata, { output: '/fixture', version, sha, ...patch })).toThrow())
const bundle = { version, plist: { CFBundleIdentifier: 'com.boai.agent', CFBundleShortVersionString: version, CFBundleVersion: version, CFBundleExecutable: 'BoAI Agent' }, architectures: 'arm64\n', signature: 'CodeDirectory v=20400 flags=0x2(adhoc)\nSignature=adhoc\nTeamIdentifier=not set\n' }
it('仅匹配的arm64/ad-hoc个人bundle身份通过', () => expect(() => assertPersonalBundle(bundle)).not.toThrow())
it.each([
  { architectures: 'x86_64' }, { architectures: 'arm64 x86_64' }, { signature: 'Signature=Developer ID\nTeamIdentifier=TEAM\n' },
  { signature: bundle.signature.replace('0x2(adhoc)', '0x10002(adhoc,runtime)') }, { signature: bundle.signature.replace('not set', 'TEAM') },
  { plist: { ...bundle.plist, CFBundleIdentifier: 'other' } }, { plist: { ...bundle.plist, CFBundleVersion: '0.2.3' } },
  { plist: { ...bundle.plist, CFBundleShortVersionString: '0.2.3' } }, { plist: { ...bundle.plist, CFBundleExecutable: '../other' } },
])('拒绝错架构/身份/版本/签名：%j', patch => expect(() => assertPersonalBundle({ ...bundle, ...patch })).toThrow())
it('真实bundle清单绑定字节和执行模式，资源链接必须保留在应用内', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-release-files-'))
  try {
    await mkdir(join(directory, 'Contents')); const binary = join(directory, 'Contents/binary')
    await writeFile(binary, 'actual bytes', { mode: 0o600 }); await symlink('binary', join(directory, 'Contents/current'))
    const before = await bundleInventory(directory), file = await releaseFile(binary)
    expect(before.find((row: { path: string }) => row.path === 'Contents/current')).toMatchObject({ type: 'link', target: 'binary' })
    await chmod(binary, 0o700); expect(await bundleInventory(directory)).not.toEqual(before); expect(await releaseFile(binary)).toEqual(file)
    await writeFile(binary, 'changed bytes'); expect(await releaseFile(binary)).not.toEqual(file)
    await expect(releaseFile(join(directory, 'Contents/current'))).rejects.toThrow('普通文件')
    await symlink('Contents', join(directory, 'linked-bundle')); await expect(bundleInventory(join(directory, 'linked-bundle'))).rejects.toThrow('真实目录')
    await symlink('../../outside', join(directory, 'Contents/escape')); await expect(bundleInventory(directory)).rejects.toThrow('越出应用目录')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
