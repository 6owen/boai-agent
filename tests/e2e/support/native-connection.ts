/*
 * [OUTPUT]: 模型连接从本人菜单“其他配置”进入，原行为断言保持。
 * [INPUT]: 原Electron桌面和明确的真实/离线Codex验收开关。
 * [OUTPUT]: 原设置单一手动入口明确名称/命令/协议、测试/保存，核对唯一新配置与登录来源；不转存登录凭据。
 * [POS]: 单员工与混合群共用现行本机Agent连接UI入口，不依赖个人机器扫描候选。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import type { Desktop } from './desktop'

export async function addNativeConnection(runtime: Desktop, kind: 'Codex' | 'Claude', program: string, useExistingLogin: boolean) {
  const page = runtime.page, before = await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
  await page.getByRole('button', { name: '手动添加 填写启动命令，或从目录加载', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '手动添加 Agent', exact: true })
  await dialog.getByRole('textbox', { name: 'Agent 名称', exact: true }).fill(`本机 ${kind}`)
  await dialog.getByRole('textbox', { name: '启动命令', exact: true }).fill(program)
  await dialog.getByRole('button', { name: '高级设置', exact: true }).click()
  await dialog.getByRole('combobox', { name: '接入协议', exact: true }).click()
  await page.getByRole('option', { name: `${kind} 原生程序`, exact: true }).click()
  await dialog.getByRole('checkbox', { name: '使用本机已有配置', exact: true }).setChecked(useExistingLogin)
  await dialog.getByRole('checkbox', { name: '允许此 Agent 在本机运行', exact: true }).check()
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText(kind === 'Claude' ? '程序已核对' : '测试成功', { timeout: 30000 })
  await runtime.reviewCheckpoint(`${kind}原生程序核对；不是供应商模型认证`)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  const profiles = await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  const added = profiles.filter(profile => !before.some(value => value.id === profile.id))
  expect(added).toHaveLength(1)
  expect(added[0]).toMatchObject({ name: `本机 ${kind}`, protocol: kind === 'Codex' ? 'codex-app-server' : 'claude-cli', useExistingLogin, hostAccessAcknowledged: true })
  return added[0]
}

export const addCodexConnection = (runtime: Desktop, real: boolean) => addNativeConnection(runtime, 'Codex', real ? process.env.BOAI_CODEX_PROGRAM ?? 'codex' : resolve('tests/fixtures/codex-app-server.mjs'), real)

export async function selectNativeEmployee(page: Page, form: Locator, profileName: string) {
  await form.getByRole('combobox', { name: '运行方式', exact: true }).click()
  await page.getByRole('option', { name: '本机 Agent', exact: true }).click()
  await form.getByRole('combobox', { name: '本机 Agent', exact: true }).click()
  await page.getByRole('option', { name: profileName, exact: true }).click()
  await expect(form.getByRole('combobox', { name: '本机 Agent', exact: true })).toContainText(profileName)
  await expect(form.getByRole('combobox', { name: '运行方式', exact: true })).toHaveAttribute('aria-expanded', 'false')
}
