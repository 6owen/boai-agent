/*
 * [OUTPUT]: 临时CLI复用真实workspace构建解析并提供登记版本协议输入，Node22工程测试进入原恢复守卫。
 * [INPUT]: 明确的目录/报告协议夹具及真实Node/native guard；无实际应用包或DMG资格。
 * [OUTPUT]: 固定8/2、完整逐启动profile负例、真实bundle被改拒绝及实际CLI旧活跃账本拒绝；不运行GUI/模型/挂载。
 * [POS]: 个人产物冒烟编排合同；实际包/挂载故障演练另留原件。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { readFile, writeFile, mkdir, mkdtemp, copyFile, chmod, symlink, readdir, rm, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
// @ts-expect-error Shared Node release module has no declaration.
import { ownedSmokeMount, selectSmokeCases, assertSmokeLaunch, verifySmokeBundle } from '../scripts/release-smoke.mjs'
// @ts-expect-error Shared Node release module has no declaration.
import { releaseFile, bundleInventory } from '../scripts/release-build.mjs'

const intent = { mount: '/private/owned/mounted', asset: '/private/owned/app.dmg' }
const image = { 'image-path': intent.asset, 'system-entities': [{ 'dev-entry': '/dev/disk99s1', 'mount-point': intent.mount }] }
it('只识别实际匹配的本批镜像及唯一挂载点，其他挂载保持', () => {
  expect(ownedSmokeMount({ images: [image] }, intent)).toEqual(image)
  expect(ownedSmokeMount({ images: [] }, intent)).toBeNull()
  expect(ownedSmokeMount({ images: [{ ...image, 'system-entities': [{ 'mount-point': '/private/other' }] }] }, intent)).toBeNull()
})
it.each([
  { images: [{ ...image, 'image-path': '/private/other.dmg' }] },
  { images: [image, image] },
  { images: [{ ...image, 'system-entities': [...image['system-entities'], { 'mount-point': '/private/another-partition' }] }] },
  { images: undefined },
])('挂载身份冲突或不完整时拒绝退挂：%j', info => expect(() => ownedSmokeMount(info, intent)).toThrow())

const launchOptions = { binary: '/fixture/BoAI Agent.app/Contents/MacOS/BoAI Agent', version: '0.2.4', cli: false, temporaryRoot: '/private/protocol-tmp' }
const launch = () => {
  const profileRoot = '/private/protocol-tmp/boai-bdd-profile1', expected = { executable: launchOptions.binary, dataDir: profileRoot }
  return { profileRoot, expected, actual: { ...expected }, observed: { executable: expected.executable, applicationPath: '/fixture/BoAI Agent.app/Contents/Resources/app.asar', dataDir: profileRoot, packaged: true, pid: 1234, version: launchOptions.version } }
}
it('完整实际启动字段绑定本场临时profile、实际程序/asar及版本', () => expect(assertSmokeLaunch(launch(), launchOptions)).toEqual({ profileRoot: launch().profileRoot, dataDir: launch().profileRoot }))
it('本场profile内的原目录授权product子目录合法且保留实际dataDir身份', () => {
  const value = launch(); value.expected.dataDir = value.actual.dataDir = value.observed.dataDir = value.profileRoot + '/product'
  expect(assertSmokeLaunch(value, launchOptions)).toEqual({ profileRoot: value.profileRoot, dataDir: value.profileRoot + '/product' })
})
it.each([
  { name: 'missing-both-dataDir', change: value => { Reflect.deleteProperty(value.expected, 'dataDir'); Reflect.deleteProperty(value.actual, 'dataDir') } },
  { name: 'wrong-observed-dataDir', change: value => { value.observed.dataDir = '/personal/boai' } },
  { name: 'outside-profile', change: value => { value.profileRoot = value.expected.dataDir = value.actual.dataDir = value.observed.dataDir = '/personal/boai' } },
  { name: 'nonstring-dataDir', change: value => { Reflect.set(value.expected, 'dataDir', 123); Reflect.set(value.actual, 'dataDir', 123) } },
  { name: 'wrong-actual-dataDir', change: value => { value.actual.dataDir = '/personal/boai' } },
  { name: 'neighbor-profile-dataDir', change: value => { value.expected.dataDir = value.actual.dataDir = value.observed.dataDir = '/private/protocol-tmp/boai-bdd-neighbor/product' } },
  { name: 'wrong-asar', change: value => { value.observed.applicationPath = '/other/app.asar' } },
  { name: 'not-packaged', change: value => { value.observed.packaged = false } },
  { name: 'wrong-version', change: value => { value.observed.version = '0.2.3' } },
  { name: 'wrong-observed-executable', change: value => { value.observed.executable = '/other/BoAI Agent' } },
] satisfies { name: string; change(value: ReturnType<typeof launch>): void }[])('$name不能因两侧相等或宿主退出0通过', ({ change }) => {
  const value = launch(); change(value); expect(() => assertSmokeLaunch(value, launchOptions)).toThrow()
})
it('已检查的实际解包bundle文件被修改后，清理前重核拒绝且保留修改现场', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-smoke-bundle-'))
  try {
    await mkdir(join(directory, 'Contents')); const file = join(directory, 'Contents/actual-file')
    await writeFile(file, 'verified-before'); const expected = await bundleInventory(directory)
    expect(await verifySmokeBundle(directory, expected)).toEqual(expected)
    await writeFile(file, 'changed-during-test')
    await expect(verifySmokeBundle(directory, expected)).rejects.toThrow('实际产物bundle字节')
    expect(await readFile(file, 'utf8')).toBe('changed-during-test')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

async function inventory() {
  const bytes = await readFile('tests/e2e/test-tiers.json'), plan = JSON.parse(bytes.toString())
  const rows = [...plan.t1.cases, { id: 'cli', file: 'boai-cli-installation.feature', titles: ['从桌面安装BOAI命令行工具', '安装命令行工具并在应用关闭后启动服务再重开卸载'] }]
  const report = { errors: [], suites: rows.map((row, index) => {
    const spec = { title: row.titles.at(-1), file: row.file + '.spec.js', id: 'protocol-' + row.id, line: 10 + index, tests: [{ expectedStatus: 'passed' }] }
    let suite = { title: row.titles.at(-2), specs: [spec], suites: [] } as any
    for (const title of row.titles.slice(0, -2).reverse()) suite = { title, suites: [suite] }
    return { title: row.file + '.spec.js', suites: [suite] }
  }) }
  return { bytes, report }
}
it('固定ZIP8与DMG2使用完整标题/实际ID，开发版Dock不被放入包场景', async () => {
  const f = await inventory(), zip = selectSmokeCases(f.bytes, f.report, 'zip'), dmg = selectSmokeCases(f.bytes, f.report, 'dmg')
  expect(zip.map((row: { id: string }) => row.id)).toEqual(['employee-create', 'api-chat-file-restart', 'native-file-chat-example-1', 'native-file-chat-example-2', 'directory-data-source-approval', 'directory-restart', 'appearance-restart', 'appearance-background'])
  expect(dmg.map((row: { id: string }) => row.id)).toEqual(['employee-create', 'packaged-cli-installation'])
  expect(zip.every((row: { playwrightId: string; line: number }) => row.playwrightId.startsWith('protocol-') && row.line >= 10)).toBe(true)
})
it('同名但标题层级不同、重复CLI、预期失败和清单报错均不能替代固定场景', async () => {
  const f = await inventory(), cli = f.report.suites.at(-1)!
  const duplicate = structuredClone(f.report); duplicate.suites.push(cli)
  expect(() => selectSmokeCases(f.bytes, duplicate, 'dmg')).toThrow('唯一CLI')
  const wrongTitle = structuredClone(f.report); wrongTitle.suites.at(-1)!.suites[0].title = '不同业务'
  expect(() => selectSmokeCases(f.bytes, wrongTitle, 'dmg')).toThrow('唯一CLI')
  const expectedFailure = structuredClone(f.report); expectedFailure.suites.at(-1)!.suites[0].specs[0].tests[0].expectedStatus = 'failed'
  expect(() => selectSmokeCases(f.bytes, expectedFailure, 'dmg')).toThrow('唯一CLI')
  expect(() => selectSmokeCases(f.bytes, { ...f.report, errors: [{}] }, 'zip')).toThrow('清单无效')
})
it.each(['controller', 'zip'])('真实CLI在旧%s监督器仍活跃时零worker/GUI启动且不修改原文件', async location => {
  const source = process.cwd(), directory = await realpath(await mkdtemp(join(tmpdir(), 'boai-release-smoke-cli-'))), scripts = join(directory, 'scripts')
  const candidate = join(directory, '.local/release-candidates/current'), old = join(directory, '.local/release-asset-runs/old'), guard = join(old, 'process-guard')
  const sha = 'a'.repeat(40), version = '0.2.4', fixedSource = { commit: sha, sourceHash: 'b'.repeat(64), dirty: false }, built = { version: 1, inputHash: 'c'.repeat(64), outputHash: 'd'.repeat(64), node: 'v24.16.0' }
  let child: ReturnType<typeof spawn> | undefined, ended: Promise<unknown> | undefined
  try {
    for (const path of [scripts, join(directory, 'tests/evaluation'), join(scripts, 'development'), join(directory, '.locks'), join(old, 'controller'), join(old, location, 'processes'), join(candidate, 'assets/mac-arm64/BoAI Agent.app')]) await mkdir(path, { recursive: true })
    await symlink(join(source, 'node_modules'), join(directory, 'node_modules'))
    await copyFile(join(source, 'scripts/release-smoke.mjs'), join(scripts, 'release-smoke.mjs'))
    await writeFile(join(scripts, 'workspace-packages.mjs'), `export {buildWorkspace} from ${JSON.stringify(join(source, 'scripts/workspace-packages.mjs'))};\n`)
    // Keep the actual Node binary and OS; only supply the registered-version
    // protocol input before exercising real SQLite leases and process recovery.
    // This does not qualify an actual Node24 release smoke run.
    await writeFile(join(scripts, 'registered-runtime.mjs'), `Object.defineProperty(process,'version',{value:'v24.16.0'});\n`)
    for (const name of ['release-build', 'release-check', 'release-archive', 'desktop-plan', 'desktop-evidence', 'local-ci']) await symlink(join(source, 'scripts', name + '.mjs'), join(scripts, name + '.mjs'))
    await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', version, build: { buildVersion: version, appId: 'com.boai.agent', productName: 'BoAI Agent' } }))
    // Explicit fixed source/build protocol fixtures; no GUI/build/asset operation
    // can complete successfully. SQLite leases and all process recovery are real.
    await writeFile(join(scripts, 'ui-regression.mjs'), `export async function sourceIdentity(){return ${JSON.stringify(fixedSource)}}`)
    await writeFile(join(scripts, 'build-identity.mjs'), `export async function verifyBuildIdentity(){return ${JSON.stringify(built)}};export {sameBuildBytes} from ${JSON.stringify(join(source, 'scripts/build-identity.mjs'))}`)
    await writeFile(join(scripts, 'resource-lock.mjs'), `import{basename,join}from'node:path';import{acquireResourceLock as actual}from ${JSON.stringify(join(source, 'scripts/resource-lock.mjs'))};export const acquireResourceLock=p=>actual(join(${JSON.stringify(join(directory, '.locks'))},basename(p)))`)
    for (const path of ['tests/evaluation/repair-process.ts', 'scripts/development/recovery.ts']) await writeFile(join(directory, path), `export * from ${JSON.stringify(join(source, path))}`)
    const app = join(candidate, 'assets/mac-arm64/BoAI Agent.app'); await writeFile(join(app, 'sentinel'), 'UNCHANGED')
    const assets = []
    for (const extension of ['dmg', 'zip']) { const name = `BoAI-Agent-${version}-macos-arm64.${extension}`; await writeFile(join(candidate, 'assets', name), 'PROTOCOL-ONLY-NOT-AN-APP'); assets.push({ name, ...await releaseFile(join(candidate, 'assets', name)) }) }
    await writeFile(join(candidate, 'candidate.json'), JSON.stringify({ status: 'built', errors: [], identity: { sha, version }, source: fixedSource, built, assets, app }))
    await writeFile(join(candidate, 'bundle-files.json'), JSON.stringify(await bundleInventory(app)))
    await copyFile(resolve('dist/native/boai-process-guard'), guard); await chmod(guard, 0o700)
    await writeFile(join(old, 'intent.json'), JSON.stringify({ version: 1, directory: old, guard: await releaseFile(guard) }))
    const ledger = join(old, location, 'processes')
    const readyScript = `const fs=require('node:fs'),directory=${JSON.stringify(ledger)};let ready=false;const check=()=>{if(!ready&&fs.readdirSync(directory).some(name=>name.endsWith('.json'))){ready=true;process.stdout.write('ledger-ready');watcher.close()}};const watcher=fs.watch(directory,check);check();setInterval(()=>{},1000)`
    child = spawn(guard, ['--ledger', ledger, process.execPath, '-e', readyScript], { stdio: ['pipe', 'pipe', 'pipe'] }); ended = once(child, 'close')
    let guardError = ''; child.stderr!.on('data', bytes => { guardError += bytes })
    const ready = await Promise.race([once(child.stdout!, 'data').then(([bytes]) => bytes.toString()), ended.then(() => { throw Error('guard在就绪前退出：' + guardError) })])
    expect(ready).toBe('ledger-ready')
    expect((await readdir(ledger)).some(name => name.endsWith('.json'))).toBe(true)
    const cli = spawn(process.execPath, ['--import', './scripts/registered-runtime.mjs', 'scripts/release-smoke.mjs', '--candidate', candidate], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''; cli.stdout.on('data', bytes => { output += bytes }); cli.stderr.on('data', bytes => { output += bytes })
    const timer = setTimeout(() => cli.kill('SIGKILL'), 15_000)
    try { const [code] = await once(cli, 'close'); expect(code, output).toBe(1) } finally { clearTimeout(timer) }
    expect(output).toContain('个人产物冒烟 failed')
    expect(output).toContain('未确认退出')
    expect(await readdir(join(directory, '.local/release-asset-runs'))).toEqual(['old'])
    expect(await readFile(join(app, 'sentinel'), 'utf8')).toBe('UNCHANGED')
    expect(() => process.kill(child!.pid!, 0)).not.toThrow()
    expect((await readdir(ledger)).some(name => name.endsWith('.json'))).toBe(true)
  } finally { if (child) { child.kill('SIGTERM'); await ended }; await rm(directory, { recursive: true, force: true }) }
}, 25_000)
