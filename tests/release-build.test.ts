/*
 * [OUTPUT]: 旧guard以实际JSON账本就绪为起点，提前退出携带stderr失败；发布拒绝/零构建断言保持。
 * [INPUT]: 原构建配置、个人候选身份和临时真实文件/链接。
 * [OUTPUT]: 原配置保留/安装包排除、新旧产物路径及越界拒绝、实际链接与旧guard排他负例。
 * [OUTPUT]: 临时CLI复用真实workspace构建解析并提供登记版本协议输入，Node22工程测试进入旧进程守卫。
 * [POS]: 候选构建合同；不实际打包、不运行GUI或发布资产。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdtemp, writeFile, mkdir, symlink, chmod, rm, readdir, copyFile, readFile } from 'node:fs/promises'
import { once } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { drainPendingProcesses } from '../scripts/development/recovery'
// @ts-expect-error Node candidate builder has no declaration file.
import { personalMacConfiguration, assertPersonalBundle, releaseFile, bundleInventory, drainReleaseCandidates } from '../scripts/release-build.mjs'
// @ts-expect-error Plain Node build/release paths have no declaration file.
import { candidateArtifactDirectory, releaseArtifactDirectory, withoutReleaseArtifacts, releaseFileExclusions } from '../scripts/build-output-paths.mjs'
const sha = 'a'.repeat(40), version = '0.2.4'
const metadata = { version, build: { buildVersion: version, appId: 'com.boai.agent', productName: 'BoAI Agent', directories: { output: 'release', buildResources: 'resources' }, files: ['dist/**/*', 'package.json'], asar: true, asarUnpack: ['dist/native/**/*'], npmRebuild: false, protocols: [{ schemes: ['boai'] }], electronDist: 'node_modules/electron/dist', mac: { icon: 'resources/app-icons/default.icns', category: 'public.app-category.productivity', target: ['dmg'] }, extraMetadata: { existing: 'keep' }, linux: { target: ['AppImage'] } } }
async function guardReady(child: ChildProcess, ledger: string) {
  let stderr = ''
  child.stdout?.resume(); child.stderr?.on('data', bytes => { stderr += bytes })
  // Wait for a committed fixture ledger before testing release refusal.
  await expect.poll(async () => {
    if (child.exitCode !== null || child.signalCode !== null) throw Error(`guard exited before ledger readiness: ${child.exitCode}/${child.signalCode} ${stderr}`)
    for (const file of (await readdir(ledger)).filter(name => name.endsWith('.json'))) {
      try { JSON.parse(await readFile(join(ledger, file), 'utf8')); return true }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
    }
    return false
  }, { timeout: 5000, interval: 25 }).toBe(true)
}

it('个人配置只覆盖候选输出/签名/目标，保留原文件、原生助手、协议和现有metadata', () => {
  const before = structuredClone(metadata), config = personalMacConfiguration(metadata, { output: '/fixture/candidate', sha, version })
  expect(config).toMatchObject({ files: [...metadata.build.files, ...releaseFileExclusions], asar: true, asarUnpack: metadata.build.asarUnpack, npmRebuild: false, protocols: metadata.build.protocols, electronDist: metadata.build.electronDist, directories: { output: '/fixture/candidate', buildResources: 'resources' }, mac: { icon: metadata.build.mac.icon, category: metadata.build.mac.category, target: ['dmg', 'zip'], identity: '-', hardenedRuntime: false, notarize: false }, extraMetadata: { existing: 'keep', boaiRelease: { sha, arch: 'arm64', applicationVersion: version, channel: 'personal-macos-arm64' } }, linux: metadata.build.linux })
  expect(metadata).toEqual(before)
})
it('新候选使用同ID的dist安装包目录，旧记录保持可读，任意路径和其他ID拒绝', () => {
  const root = resolve('/fixture/repo'), directory = join(root, '.local/release-candidates/current')
  const artifactDirectory = join(root, 'dist/releases/candidates/current')
  expect(releaseArtifactDirectory(root, directory)).toBe(artifactDirectory)
  expect(candidateArtifactDirectory(root, directory, {})).toBe(directory)
  expect(candidateArtifactDirectory(root, directory, { artifactDirectory })).toBe(artifactDirectory)
  for (const path of [directory, join(root, 'dist/releases/candidates/other'), '../outside', null, undefined]) {
    expect(() => candidateArtifactDirectory(root, directory, { artifactDirectory: path })).toThrow('不匹配')
  }
  expect(() => releaseArtifactDirectory(root, '/another/repo/.local/release-candidates/current')).toThrow('本worktree')
})
it('文件排除保留FileSet并且重复应用不增加规则或修改原配置', () => {
  const files = ['dist/**/*', { from: 'resources', to: 'resources', filter: ['**/*'] }], original = structuredClone(files)
  const excluded = withoutReleaseArtifacts(files)
  expect(excluded).toEqual([...original, ...releaseFileExclusions])
  expect(withoutReleaseArtifacts(excluded)).toEqual(excluded)
  expect(files).toEqual(original)
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
    await guardReady(child, ledger)
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
    for (const name of ['release-build.mjs', 'release-check.mjs', 'build-output-paths.mjs']) await copyFile(join(source, 'scripts', name), join(directory, 'scripts', name))
    await writeFile(join(directory, 'scripts/workspace-packages.mjs'), `export {buildWorkspace} from ${JSON.stringify(join(source, 'scripts/workspace-packages.mjs'))};\n`)
    // Keep the actual Node binary and OS; fix only the release host's registered
    // version input so this protocol test reaches real process recovery on CI.
    // This does not qualify an actual Node24 release build.
    await writeFile(join(directory, 'scripts/registered-runtime.mjs'), `Object.defineProperty(process,'version',{value:'v24.16.0'});\n`)
    await writeFile(join(directory, 'scripts/local-ci.mjs'), 'export async function verifyLocalCi(){throw Error("not a CI qualification")}')
    await writeFile(join(directory, 'scripts/local-ci-github.mjs'), 'export const localCiRepository="6owen/boai-agent",localCiContext="BOAI local CI"')
    // Explicit protocol fixtures: source identity is fixed, resource locks remain
    // real SQLite at private paths; build/packaging can never return fake success.
    await writeFile(join(directory, 'scripts/ui-regression.mjs'), `export async function sourceIdentity(){return {commit:${JSON.stringify(sha)},dirty:false}}`)
    await writeFile(join(directory, 'scripts/build-identity.mjs'), 'export async function verifyBuildIdentity(){throw Error("never built")}')
    await writeFile(join(directory, 'scripts/resource-lock.mjs'), `import{basename,join}from'node:path';import{acquireResourceLock as actual}from ${JSON.stringify(join(source, 'scripts/resource-lock.mjs'))};export const acquireResourceLock=p=>actual(join(${JSON.stringify(join(directory, '.local'))},basename(p)))`)
    await writeFile(join(directory, 'scripts/build-process-guard.mjs'), `import{writeFile}from'node:fs/promises';export default async()=>{await writeFile(${JSON.stringify(join(directory, '.local/build-entered'))},'entered');throw Error('build must not start')}`)
    for (const [target, actual] of [['tests/evaluation/repair-process.ts', 'tests/evaluation/repair-process.ts'], ['scripts/development/recovery.ts', 'scripts/development/recovery.ts']]) await writeFile(join(directory, target!), `export * from ${JSON.stringify(join(source, actual!))}`)
    await guardReady(oldProcess, ledger)
    const child = spawn(process.execPath, ['--import', './scripts/registered-runtime.mjs', 'scripts/release-build.mjs', '--version', version, '--sha', sha], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
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
    expect(await bundleInventory(relative(process.cwd(), directory))).toEqual(before)
    const cancelled = new AbortController(); cancelled.abort()
    await expect(releaseFile(binary, { signal: cancelled.signal })).rejects.toThrow()
    expect(before.find((row: { path: string }) => row.path === 'Contents/current')).toMatchObject({ type: 'link', target: 'binary' })
    await chmod(binary, 0o700); expect(await bundleInventory(directory)).not.toEqual(before); expect(await releaseFile(binary)).toEqual(file)
    await writeFile(binary, 'changed bytes'); expect(await releaseFile(binary)).not.toEqual(file)
    await expect(releaseFile(join(directory, 'Contents/current'))).rejects.toThrow('普通文件')
    await symlink('Contents', join(directory, 'linked-bundle')); await expect(bundleInventory(join(directory, 'linked-bundle'))).rejects.toThrow('真实目录')
    await symlink('../../outside', join(directory, 'Contents/escape')); await expect(bundleInventory(directory)).rejects.toThrow('越出应用目录')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
