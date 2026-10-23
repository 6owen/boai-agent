/*
 * [INPUT]: 中文升级保护场景及原Desktop fixture。
 * [OUTPUT]: 活动维护/持久意图的真实Main拒绝与原数据恢复业务断言。
 * [POS]: Electron BDD升级保护步骤；进程和文件细节归support/profile-maintenance。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { ProfileMaintenanceFixture } from '../support/profile-maintenance'

export const test = base.extend<{ maintenance: { fixture?: ProfileMaintenanceFixture } }>({ maintenance: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('升级保护已准备{string}配置的{string}状态', async ({ runtime, maintenance }, scope: string, state: string) => {
  maintenance.fixture = await ProfileMaintenanceFixture.create(runtime, scope, state)
})
When('尝试重新启动维护中的配置', async ({ maintenance }) => { await maintenance.fixture!.attempt() })
Then('启动被拒绝且原数据恢复后可以正常打开', async ({ maintenance }) => { await maintenance.fixture!.verifyAndRestore() })
