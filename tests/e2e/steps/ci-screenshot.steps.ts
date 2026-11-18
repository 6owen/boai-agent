/* [OUTPUT]: 两种截图复用隔离桌面，每种各输出一张 PNG。 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
import { prepareGroupChat } from '../support/group-chat'
import { seedScheduleUi } from '../support/schedule-ui'

const { Then } = createBdd(test)
async function capture(page: Page, name: string) {
  const directory = process.env.BOAI_SCREENSHOT_DIR || test.info().outputDir
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: join(directory, name), animations: 'disabled' })
}

Then('启动隔离应用并保存一张主界面截图', async ({ runtime }) => {
  await runtime.start()
  await expect(runtime.page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await capture(runtime.page, 'global.png')
})

Then('打开本次 PR 的目标并保存一张截图', async ({ runtime }) => {
  const target: { clicks: string[]; visible: string } = JSON.parse(
    process.env.BOAI_SCREENSHOT_TARGET || '{"clicks":[],"visible":"nav[aria-label=主导航]"}',
  )
  await prepareGroupChat(runtime, { seedBeforeLaunch: true, emulateViewport: false,
    seedAdditional: (store, setup) => seedScheduleUi(store, setup.direct.id),
  })
  for (const selector of target.clicks) await runtime.page.locator(selector).click()
  await expect(runtime.page.locator(target.visible)).toBeVisible()
  await capture(runtime.page, 'preview.png')
})
