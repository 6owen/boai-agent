/*
 * [INPUT]: 隔离桌面与 CI 选定的导航、悬停及可见元素。
 * [OUTPUT]: 会话置顶目标使用已有隔离员工和群聊，预置头像展示。
 * [OUTPUT]: 截取目标状态和独立主界面各一张 PNG。
 * [PROTOCOL]: 变化同步 Header、所属 .folder.md 和 UI_TEST_CI.md。
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
import { prepareGroupChat } from '../support/group-chat'
import type { Conversation } from '@boai/shared/domain'
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
  const home = runtime.page.locator('.conversation-layout .conversation-stage')
  await expect(home.getByRole('img', { name: '等你开聊的小伙伴' })).toBeVisible()
  await capture(runtime.page, 'global.png')
})

Then('打开本次 PR 的目标并保存一张截图', async ({ runtime }) => {
  const target: { clicks: string[]; hover?: string; visible: string } = JSON.parse(
    process.env.BOAI_SCREENSHOT_TARGET || '{"clicks":[],"visible":"nav[aria-label=主导航]"}',
  )
  await prepareGroupChat(runtime, { seedBeforeLaunch: true, emulateViewport: false,
    seedAdditional: async (store, setup) => {
      if (target.visible === '.conversation-pin-grid') {
        const rooms = [setup.direct, setup.group]
        await store.write(rooms.map((room: Conversation, order) => ({ collection: 'conversations', id: room.id,
          value: { ...room, list: { ...room.list, pinned: true, order } },
        })))
      }
      await seedScheduleUi(store, setup.direct.id)
    },
  })
  for (const selector of target.clicks) await runtime.page.locator(selector).click()
  if (target.hover) await runtime.page.locator(target.hover).hover()
  const visible = runtime.page.locator(target.visible)
  await expect(visible).toBeVisible()
  if (!target.hover) await visible.scrollIntoViewIfNeeded()
  await expect(visible).toBeInViewport()
  await capture(runtime.page, 'preview.png')
})
