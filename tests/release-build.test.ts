/*
 * [INPUT]: 原构建配置、个人候选身份和临时真实文件/链接。
 * [OUTPUT]: 原配置/身份拒绝、实际链式链接外逃与旧guard未退出负例；不降低候选排他边界。
 * [POS]: 候选构建合同；不实际打包、不运行GUI或发布资产。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdtemp, writeFile, mkdir, symlink, chmod, rm, readdir, copyFile, readFile } from 'node:fs/promises'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { drainPendingProcesses } from '../scripts/development/recovery'
// @ts-expect-error Node candidate builder has no declaration file.
import { personalMacConfiguration, assertPersonalBundle, releaseFile, bundleInventory, drainReleaseCandidates } from '../scripts/release-build.mjs'
const sha = 'a'.repeat(40), version = '0.2.4'
const metadata = { version, build: { buildVersion: version, appId: 'com.boai.agent', productName: 'BoAI Agent', directories: { output: 'release', buildResources: 'resources' }, files: ['dist/**/*', 'package.json'], asar: true, asarUnpack: ['dist/native/**/*'], npmRebuild: false, protocols: [{ schemes: ['boai'] }], electronDist: 'node_modules/electron/dist', mac: { icon: 'resources/app-icons/default.icns', category: 'public.app-category.productivity', target: ['dmg'] }, extraMetadata: { existing: 'keep' }, linux: { target: ['AppImage'] } } }
it('个人配置只覆盖候选输出/签名/目标，保留原文件、原生助手、协议和现有metadata', () => {
  const before = structuredClone(metadata), config = personalMacConfiguration(metadata, { output: '/fixture/candidate', sha, version })
  expect(config).toMatchObject({ files: metadata.build.files, asar: true, asarUnpack: metadata.build.asarUnpack, npmRebuild: false, protocols: metadata.build.protocols, electronDist: metadata.build.electronDist, directories: { output: '/fixture/candidate', buildResources: 'resources' }, mac: { icon: metadata.build.mac.icon, category: metadata.build.mac.category, target: ['dmg', 'zip'], identity: '-', hardenedRuntime: false, notarize: false }, extraMetadata: { existing: 'keep', boaiRelease: { sha, arch: 'arm64', applicationVersion: version, channel: 'personal-macos-arm64' } }, linux: metadata.build.linux })
  expect(metadata).toEqual(before)
})
it('词法在包内的链式链接实际指向包外时仍拒绝', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-release-link-chain-')), app = join(directory, 'app')
  try {
    await mkdir(join(app, 'C'), { recursive: true }); await writeFile(join(directory, 'outside'), 'outside bundle')
    await symlink('.', join(app, 'B')); await symlink('../B/../outside', join(app, 'C/link'))
    await expect(bundleInventory(app)).rejects.toThrow('越出应用目录')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
it('旧候选实际guard仍活跃时拒绝重建，实际退出后才可继续', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-release-old-process-')), old = join(directory, 'previous'), ledger = join(old, 'processes'), guard = resolve('dist/native/boai-process-guard')
  await mkdir(ledger, { recursive: true })
  await copyFile(guard, join(old, 'process-guard')); await chmod(join(old, 'process-guard'), 0o700)
  const child = spawn(guard, ['--ledger', ledger, process.execPath, '-e', 'setInterval(()=>{},1000)'], { stdio: ['pipe', 'pipe', 'pipe'] }), ended = once(child, 'close')
  try {
    await expect.poll(async () => (await readdir(ledger)).some(name => name.endsWith('.json'))).toBe(true)
    await expect(drainReleaseCandidates(directory, { drainPendingProcesses })).rejects.toThrow('未确认退出')
  } finally { child.kill('SIGTERM'); await ended }
  try { await expect(drainReleaseCandidates(directory, { drainPendingProcesses })).resolves.toBeUndefined() }
  finally { await rm(directory, { recursive: true, force: true }) }
})
it('实际构建CLI遇到旧活跃账本时，零dist/构建写入并保留失败回执', async () => {
  const source = process.cwd(), directory = await mkdtemp(join(tmpdir(), 'boai-release-cli-')), old = join(directory, '.local/release-candidates/previous'), ledger = join(old, 'processes'), guard = join(old, 'process-guard')
  await mkdir(ledger, { recursive: true }); await copyFile(resolve('dist/native/boai-process-guard'), guard); await chmod(guard, 0o700)
  const oldProcess = spawn(guard, ['--ledger', ledger, process.execPath, '-e', 'setInterval(()=>{},1000)'], { stdio: ['pipe', 'pipe', 'pipe'] }), oldEnded = once(oldProcess, 'close')
  try {
    await mkdir(join(directory, 'scripts/development'), { recursive: true }); await mkdir(join(directory, 'tests/evaluation'), { recursive: true })
    await symlink(join(source, 'node_modules'), join(directory, 'node_modules')); await writeFile(join(directory, 'package.json'), JSON.stringify({ ...metadata, type: 'module' }))
    for (const name of ['release-build.mjs', 'release-check.mjs']) await copyFile(join(source, 'scripts', name), join(directory, 'scripts', name))
    await writeFile(join(directory, 'scripts/local-ci.mjs'), 'export async function verifyLocalCi(){throw Error("not a CI qualification")}')
    await writeFile(join(directory, 'scripts/local-ci-github.mjs'), 'export const localCiRepository="6owen/boai-agent",localCiContext="BOAI local CI"')
    // Explicit protocol fixtures: source identity is fixed, resource locks remain
    // real SQLite at private paths; build/packaging can never return fake success.
    await writeFile(join(directory, 'scripts/ui-regression.mjs'), `export async function sourceIdentity(){return {commit:${JSON.stringify(sha)},dirty:false}}`)
    await writeFile(join(directory, 'scripts/build-identity.mjs'), 'export async function verifyBuildIdentity(){throw Error("never built")}')
    await writeFile(join(directory, 'scripts/resource-lock.mjs'), `import{basename,join}from'node:path';import{acquireResourceLock as actual}from ${JSON.stringify(join(source, 'scripts/resource-lock.mjs'))};export const acquireResourceLock=p=>actual(join(${JSON.stringify(join(directory, '.local'))},basename(p)))`)
    await writeFile(join(directory, 'scripts/build-process-guard.mjs'), `import{writeFile}from'node:fs/promises';export default async()=>{await writeFile(${JSON.stringify(join(directory, '.local/build-entered'))},'entered');throw Error('build must not start')}`)
    for (const [target, actual] of [['tests/evaluation/repair-process.ts', 'tests/evaluation/repair-process.ts'], ['scripts/development/recovery.ts', 'scripts/development/recovery.ts']]) await writeFile(join(directory, target!), `export * from ${JSON.stringify(join(source, actual!))}`)
    await expect.poll(async () => (await readdir(ledger)).some(name => name.endsWith('.json'))).toBe(true)
    const child = spawn(process.execPath, ['scripts/release-build.mjs', '--version', version, '--sha', sha], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''; child.stdout.resume(); child.stderr.on('data', bytes => { stderr += bytes }); const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
    let code: unknown
    try { [code] = await once(child, 'close') } finally { clearTimeout(timer) }
    expect(code, stderr).toBe(1)
    await expect(readFile(join(directory, '.local/build-entered'))).rejects.toMatchObject({ code: 'ENOENT' })
    const fresh = (await readdir(join(directory, '.local/release-candidates'))).filter(name => name !== 'previous')
    expect(fresh).toHaveLength(1)
    const result = JSON.parse(await readFile(join(directory, '.local/release-candidates', fresh[0]!, 'candidate.json'), 'utf8'))
    expect(result).toMatchObject({ status: 'failed' }); expect(result.errors.join()).toContain('未确认退出')
  } finally { oldProcess.kill('SIGTERM'); await oldEnded; await rm(directory, { recursive: true, force: true }) }
}, 20_000)
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
