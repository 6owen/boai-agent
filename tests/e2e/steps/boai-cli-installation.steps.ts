/*
 * [INPUT]: Real isolated Electron settings, native directory choice and installed launcher process.
 * [OUTPUT]: Installed CLI read-only/isolated validation, own installation, no-system-Node execution, packaged relocation and selective uninstall.
 * [POS]: CLI installation BDD for source/current package, zero model calls.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, readdir, realpath, rename, writeFile, lstat, readlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { test as base } from '../support/test'
import { nextMaterialDialog } from '../support/materials'
import type { CliInstallation } from '../../../src/shared/ipc/cli-installation'
import type { Snapshot } from '../../../src/shared/domain'

interface State { directory?: string; command?: string; status?: CliInstallation; before?: Snapshot; facts: unknown[] }
export const test = base.extend<{ installation: State }>({ installation: async ({}, use) => use({ facts: [] }) })
const { Given, When, Then } = createBdd(test)
const run = (command: string, args: string[], cwd: string) => new Promise<{ stdout: string; stderr: string; code: number }>(done => execFile(command, args, { cwd, env: { HOME: cwd, TMPDIR: cwd, PATH: '/usr/bin:/bin' }, timeout: 25000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => done({ stdout, stderr, code: error ? typeof error.code === 'number' ? error.code : -1 : 0 })))

Given('CLI安装验收已打开隔离桌面的运行设置', async ({ runtime, installation }) => {
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  installation.directory = join(await realpath(runtime.root), "command bin ' 中文")
  installation.command = join(installation.directory, 'boai'); await mkdir(installation.directory)
  await runtime.start()
  installation.before = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  await writeFile(join(runtime.root, 'business-original.txt'), 'KEEP_ORIGINAL_BUSINESS_FILE')
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await runtime.page.getByRole('button', { name: '运行选项', exact: true }).click()
  await expect(runtime.page.getByRole('region', { name: '命令行工具' }).getByRole('button', { name: '安装命令行工具', exact: true })).toBeEnabled()
})
When('安装命令先保留同名外部文件再由本人选择空闲目录', async ({ runtime, installation }) => {
  const card = runtime.page.getByRole('region', { name: '命令行工具' })
  await writeFile(installation.command!, 'FOREIGN_COMMAND_PRESERVED')
  await nextMaterialDialog(runtime, { path: installation.directory! }); await card.getByRole('button', { name: '安装命令行工具', exact: true }).click()
  await expect(runtime.page.getByText('此目录已存在其他 boai 命令，原文件保留。', { exact: true })).toBeVisible()
  expect(await readFile(installation.command!, 'utf8')).toBe('FOREIGN_COMMAND_PRESERVED')
  await runtime.reviewNativeCheckpoint('安装遇到同名外部命令保持原文件')
  await rename(installation.command!, join(installation.directory!, 'foreign-saved'))
  await expect(card.getByRole('button', { name: '安装命令行工具', exact: true })).toBeEnabled()
  await nextMaterialDialog(runtime, { path: installation.directory! }); await card.getByRole('button', { name: '安装命令行工具', exact: true }).click()
  await expect(card.getByRole('status')).toContainText('已安装')
  await expect(card.getByText(/已连接当前工作空间/)).toBeVisible()
  installation.status = await runtime.page.evaluate(() => window.boai.request('getCliInstallation', undefined))
  expect(installation.status.state).toBe('installed'); expect(installation.status.commandPath).toBe(installation.command)
  const launcher = await readlink(installation.command!)
  expect((await lstat(installation.command!)).isSymbolicLink()).toBe(true)
  await runtime.reviewFile('本次实际安装的启动器', launcher, { required: true })
  await runtime.reviewFile('本次安装身份记录', join(runtime.root, 'cli-installation', 'installation.json'), { required: true })
  await runtime.reviewNativeCheckpoint('设置中的命令位置版本和连接状态')
})
Then('安装的命令无需系统Node即可连接当前桌面和独立启动', async ({ runtime, installation }) => {
  const version = await run(installation.command!, ['--version'], runtime.root)
  expect(version.code, version.stderr).toBe(0); expect(version.stdout.trim()).toBe(installation.status!.version)
  const versions = await run(installation.command!, ['versions', '--json'], runtime.root)
  expect(versions.code, versions.stderr).toBe(0)
  expect(JSON.parse(versions.stdout)).toMatchObject({ cli: installation.status!.version, service: installation.status!.connection.version })
  const forbidden = await run(installation.command!, ['invoke', 'installCli', JSON.stringify({ expectedRevision: installation.status!.revision }), '--json'], runtime.root)
  expect(forbidden.code).toBe(1); expect(forbidden.stderr).toContain('CHANNEL_NOT_FOUND')
  const diagnostic = await run(installation.command!, ['--validate-server', '--json'], runtime.root)
  expect(diagnostic.code, diagnostic.stderr + diagnostic.stdout).toBe(0)
  expect(JSON.parse(diagnostic.stdout)).toMatchObject({ mode: 'read-only', modelMode: 'none', passed: 10, failed: 0, skipped: 0, exitCode: 0 })
  const validationPath = join(await realpath(runtime.root), 'cli validation')
  const validation = await run(installation.command!, ['validate', '--validation-profile', validationPath, '--json'], runtime.root)
  expect(validation.code, validation.stderr + validation.stdout).toBe(0)
  const validationReport = JSON.parse(validation.stdout)
  expect(validationReport).toMatchObject({ mode: 'isolated', modelMode: 'controlled-local', directory: validationPath, passed: 19, failed: 0, skipped: 0, exitCode: 0, service: { state: 'stopped' } })
  expect(() => process.kill(validationReport.service.pid, 0)).toThrow()
  expect(await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).toMatchObject({ agents: installation.before!.agents, conversations: installation.before!.conversations })
  await runtime.reviewData('已安装命令验证两模式与当前工作空间保持', { diagnostic: JSON.parse(diagnostic.stdout), validationReport, originalProfileUnchanged: true, externalModelRequests: 0, actualValidationServiceExit: true })
  for (const name of ['report.json', 'execution.json', 'file-evidence.txt']) await runtime.reviewFile('CLI验证原件 ' + name, join(validationPath, name), { required: true })
  expect(await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => !window.isDestroyed()).length)).toBe(1)
  installation.facts.push({ version, versions: JSON.parse(versions.stdout), forbidden, path: '/usr/bin:/bin' })
  await runtime.close()
  const standalone = await run(installation.command!, ['run', '--employee', 'missing-installation-test-employee', '--json', '未受理探针'], runtime.root)
  expect(standalone.code, standalone.stderr + standalone.stdout).toBe(2)
  const service = JSON.parse(standalone.stdout.trim())
  expect(service).toMatchObject({ type: 'service', state: 'stopped' })
  expect(() => process.kill(service.pid, 0)).toThrow()
  installation.facts.push({ standalone, actualServiceExit: true })
  await runtime.reviewData('无系统Node的包内命令和独立服务退出', installation.facts)
  await runtime.start()
})
Then('重开桌面后可卸载命令而保留原业务数据', async ({ runtime, installation }) => {
  const current = await runtime.page.evaluate(() => window.boai.request('getCliInstallation', undefined))
  await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const afterReady = await runtime.page.evaluate(() => window.boai.request('getCliInstallation', undefined))
  await runtime.reviewData('重开时安装状态与服务就绪对照', { current, afterReady })
  expect(current).toMatchObject({ state: 'installed', commandPath: installation.command, connection: { state: 'connected' } })
  const packaged = process.env.BOAI_TEST_PACKAGED_PATH
  let relocated: string | undefined
  if (packaged) {
    // Copy only into this scenario's disposable directory; never move the supplied application.
    await runtime.close()
    const bundle = resolve(packaged, '../../..'), copy = join(await realpath(runtime.root), "Moved ' BoAI Agent.app")
    await cp(bundle, copy, { recursive: true, verbatimSymlinks: true })
    const links: { path: string; target: string }[] = []
    for (const entry of await readdir(bundle, { recursive: true })) {
      if (!(await lstat(join(bundle, entry))).isSymbolicLink()) continue
      const target = await readlink(join(bundle, entry))
      expect(await readlink(join(copy, entry))).toBe(target)
      links.push({ path: entry, target })
    }
    const hash = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex')
    const archiveHash = await hash(join(bundle, 'Contents/Resources/app.asar'))
    expect(await hash(join(copy, 'Contents/Resources/app.asar'))).toBe(archiveHash)
    relocated = join(copy, 'Contents/MacOS', packaged.split('/').at(-1)!)
    process.env.BOAI_TEST_PACKAGED_PATH = relocated
    try { await runtime.start() } finally { process.env.BOAI_TEST_PACKAGED_PATH = packaged }
    const changed = await runtime.page.evaluate(() => window.boai.request('getCliInstallation', undefined))
    expect(changed).toMatchObject({ state: 'update-available', commandPath: installation.command, connection: { state: 'connected' } })
    expect(await runtime.app.evaluate(() => process.execPath)).toBe(relocated)
    await runtime.reviewData('移动应用后的原命令更新提示', { originalExecutable: packaged, relocated, archiveHash, links, changed })
  }
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await runtime.page.getByRole('button', { name: '运行选项', exact: true }).click()
  const card = runtime.page.getByRole('region', { name: '命令行工具' })
  if (relocated) {
    await card.getByRole('button', { name: '更新命令行工具', exact: true }).click()
    await expect(card.getByRole('status')).toContainText('已安装')
    const launcher = await readlink(installation.command!)
    await runtime.reviewFile('移动后实际更新的启动器', launcher, { required: true })
    const versions = await run(installation.command!, ['versions', '--json'], runtime.root)
    expect(versions.code, versions.stderr).toBe(0)
    expect(JSON.parse(versions.stdout)).toMatchObject({ cli: current.version, service: current.connection.version })
    const script = await readFile(launcher, 'utf8')
    expect(script).toContain(relocated.replaceAll("'", "'\\''")); expect(script).not.toContain(packaged!)
    await runtime.reviewData('更新命令连接移动后的应用', { versions: JSON.parse(versions.stdout), commandPathUnchanged: true, usesRelocatedExecutable: true })
    await runtime.reviewNativeCheckpoint('移动应用后更新原命令')
  }
  await card.getByRole('button', { name: '卸载命令行工具', exact: true }).click()
  await expect(card.getByRole('status')).toContainText('未安装')
  await expect(lstat(installation.command!)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(runtime.root, 'business-original.txt'), 'utf8')).toBe('KEEP_ORIGINAL_BUSINESS_FILE')
  expect(await readFile(join(installation.directory!, 'foreign-saved'), 'utf8')).toBe('FOREIGN_COMMAND_PRESERVED')
  const after = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(after.agents).toEqual(installation.before!.agents); expect(after.conversations).toEqual(installation.before!.conversations)
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('重启安装身份和卸载后的业务保持', { current, after: await runtime.page.evaluate(() => window.boai.request('getCliInstallation', undefined)), agentsUnchanged: true, conversationsUnchanged: true, originalFilesPreserved: true, externalRequests: 0 })
  await runtime.reviewNativeCheckpoint('卸载后仍连接原工作空间')
})
