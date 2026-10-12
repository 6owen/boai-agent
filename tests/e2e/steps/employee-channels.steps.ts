/*
 * [INPUT]: 实际Electron表单、vault/SQLite和既有BDD生命周期。
 * [OUTPUT]: 保存成功但响应失联的产品界面、只读核对、区域隔离及未保存守卫；平台通信未运行。
 * [POS]: 第16组桌面验收步骤。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
const { When, Then } = createBdd(test)

When('打开员工渠道并模拟保存响应失联', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('tab', { name: '渠道', exact: true }).click()
  const pane = page.getByRole('tabpanel', { name: '渠道', exact: true })
  await expect(pane).toContainText('员工渠道')
  await pane.getByRole('textbox', { name: 'App ID', exact: true }).fill('fixture-feishu-app')
  await pane.getByLabel('App Secret', { exact: true }).fill('channel-ui-fixture-secret')
  await pane.getByRole('textbox', { name: '授权用户 ID', exact: true }).fill('ou_fixture_owner')
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, '_invokeHandlers') as Map<string, (event: Electron.IpcMainInvokeEvent, payload: { method: string; input: unknown }) => Promise<unknown>>
    const original = handlers.get('boai:request')!
    let lose = true
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      const result = await original(event, payload)
      if (payload.method === 'saveChannelBinding' && lose) { lose = false; throw new Error('夹具：保存已提交，响应失联') }
      return result
    })
  })
  await pane.getByRole('button', { name: '添加绑定', exact: true }).click()
  await expect(pane).toContainText('原请求和草稿已保留')
  await expect(pane.getByLabel('App Secret', { exact: true })).toBeDisabled()
  await runtime.reviewCheckpoint('渠道保存响应失联-冻结原请求')
})
Then('核对原渠道保存回执后只有一份飞书绑定', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '渠道', exact: true })
  await pane.getByRole('button', { name: '核对保存结果', exact: true }).click()
  await expect(pane).toContainText('渠道绑定已保存')
  await expect(pane.getByLabel('App Secret', { exact: true })).toHaveValue('')
  const values = await page.evaluate(async () => ({ bindings: await window.boai.request('listChannelBindings', { agentId: 'researcher' }), snapshot: await window.boai.request('snapshot', undefined) }))
  expect(values.bindings).toHaveLength(1); expect(values.bindings[0]).toMatchObject({ platform: 'feishu', appId: 'fixture-feishu-app', enabled: false, hasCredential: true })
  expect(JSON.stringify(values)).not.toContain('channel-ui-fixture-secret')
  await runtime.reviewCheckpoint('员工飞书绑定-真实本地保存')
})
Then('Lark独立配置且渠道草稿受原未保存守卫保护', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '渠道', exact: true })
  await pane.getByRole('combobox', { name: '平台', exact: true }).click()
  await page.getByRole('option', { name: 'Lark', exact: true }).click()
  await pane.getByRole('textbox', { name: 'App ID', exact: true }).fill('fixture-lark-app')
  await pane.getByLabel('App Secret', { exact: true }).fill('lark-ui-fixture-secret')
  await pane.getByRole('textbox', { name: '授权用户 ID', exact: true }).fill('ou_fixture_owner')
  await pane.getByRole('button', { name: '添加绑定', exact: true }).click()
  await expect(pane).toContainText('fixture-lark-app')
  const bindings = await page.evaluate(() => window.boai.request('listChannelBindings', { agentId: 'researcher' }))
  expect(bindings.map(binding => binding.platform)).toEqual(['feishu', 'lark'])
  expect(bindings.every(binding => !binding.enabled)).toBe(true)
  await pane.getByRole('textbox', { name: '绑定名称', exact: true }).fill('尚未保存的渠道')
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(pane.getByRole('textbox', { name: '绑定名称', exact: true })).toHaveValue('尚未保存的渠道')
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await page.getByRole('button', { name: '放弃并退出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '系统文件', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '渠道', exact: true }).click()
  await expect(pane.getByRole('textbox', { name: '绑定名称', exact: true })).not.toHaveValue('尚未保存的渠道')
  await expect(page.getByRole('tab', { name: '渠道', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish() })
  await runtime.reviewCheckpoint('飞书与Lark独立配置-草稿保护')
})
