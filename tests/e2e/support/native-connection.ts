/*
 * [INPUT]: 原Electron桌面和明确的真实/离线Codex验收开关。
 * [OUTPUT]: 原设置扫描、测试和保存Codex配置；返回本次新配置，不读取个人历史或转存登录凭据。
 * [POS]: 单员工与Codex/Claude群协作共用原连接UI入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { resolve } from 'node:path'
import type { Desktop } from './desktop'

export async function addCodexConnection(runtime: Desktop, real: boolean) {
  const page = runtime.page, before = await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '扫描本机 Agent', exact: true }).click()
  await page.getByRole('button', { name: '本机 Codex 使用已安装的 Codex 和本机登录，支持连续聊天' }).click()
  const dialog = page.getByRole('dialog', { name: '手动添加 Agent', exact: true })
  if (!real) {
    await dialog.getByRole('textbox', { name: '启动命令', exact: true }).fill(resolve('tests/fixtures/codex-app-server.mjs'))
    await dialog.getByRole('button', { name: '高级设置', exact: true }).click()
    await dialog.getByRole('checkbox', { name: '使用本机已有配置', exact: true }).uncheck()
  }
  await dialog.getByRole('checkbox', { name: '允许此 Agent 在本机运行', exact: true }).check()
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('测试成功', { timeout: 30000 })
  await runtime.reviewCheckpoint('本机Codex实际连接验证')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  const profiles = await page.evaluate(() => window.boai.request('listLaunchProfiles', undefined))
  const added = profiles.filter(profile => !before.some(value => value.id === profile.id))
  expect(added).toHaveLength(1); expect(added[0].protocol).toBe('codex-app-server')
  return added[0]
}
