/*
 * [INPUT]: 隔离已提交旧历史与阅读位置回执/核对传输故障。
 * [OUTPUT]: 按消息区核对文案定位提示；原锚点提交保留，错误不覆盖标题或带出路径，失败核对保持提示、成功清除；查阅不创建工作或运行模型。
 * [POS]: 阅读错误展示与恢复的Electron BDD；传输故障在support，业务与SQLite保持真实。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
import { readingAnchorReplyFault, readingRecords, seedReadingHistory } from '../support/reading'

const { Then } = createBdd(test)
Then('阅读位置回执失联后可在消息区核对且不产生业务调用', async ({ runtime }) => {
  await runtime.start()
  const setup = await runtime.page.evaluate(async () => {
    const group = await window.boai.request('createConversation', { kind: 'group', title: '阅读状态核对', agentIds: ['researcher'] })
    const other = await window.boai.request('createConversation', { kind: 'group', title: '独立历史', agentIds: ['researcher'] })
    return { group, other, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  })
  await runtime.close(); await seedReadingHistory(setup.dataPath, setup.group, setup.other, 20); await runtime.start()
  const page = runtime.page, fault = await readingAnchorReplyFault(runtime, setup.group.id)
  try {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
    await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^阅读状态核对/ }).click()
    const panel = page.locator('.chat-panel:visible'), messages = panel.locator('.messages'), button = panel.getByRole('button', { name: '核对阅读状态', exact: true })
    await messages.hover(); await page.mouse.wheel(0, -160)
    await expect.poll(async () => (await fault.inspect()).committed).toBe(true)
    await expect(button).toBeVisible()
    const banner = messages.getByRole('alert').filter({ hasText: '核对阅读状态' })
    await expect(banner).toContainText('暂时无法核对阅读位置，请稍后重试。')
    await expect(panel).not.toContainText('/private/reading-fixture')
    await expect(panel).not.toContainText('ENOENT')
    await expect(panel.locator('.chat-header')).not.toContainText('核对阅读状态')
    await messages.evaluate(element => element.scrollTo({ top: 0 }))
    await expect.poll(async () => {
      const title = await panel.locator('.chat-header').boundingBox(), error = await banner.boundingBox()
      return Boolean(title && error && error.y >= title.y + title.height && error.x >= title.x && error.x + error.width <= title.x + title.width)
    }).toBe(true)
    const committed = await readingRecords(setup.dataPath)
    expect(committed.reading.find(value => value.conversationId === setup.group.id)?.anchor).toBeDefined()
    expect(committed.works).toEqual([]); expect(committed.runs).toEqual([])
    await runtime.reviewData('真实锚点已提交而核对回执失联', { state: committed, fault: await fault.inspect() })
    await runtime.reviewCheckpoint('阅读错误位于消息区且标题完整')
    await button.click()
    await expect(banner).toContainText('暂时无法核对阅读状态，请稍后重试。')
    expect((await readingRecords(setup.dataPath)).reading).toEqual(committed.reading)
    const beforeCheck = await fault.inspect()
    await fault.allowLookup(); await button.click()
    await expect(button).toHaveCount(0)
    await expect(panel).not.toContainText('已核对阅读状态')
    const after = await readingRecords(setup.dataPath)
    expect(after).toEqual(committed)
    expect((await fault.inspect()).saves).toBe(beforeCheck.saves)
    await runtime.reviewData('明确核对只读取已提交事实且清除错误', { beforeCheck, after, fault: await fault.inspect() })
    await runtime.reviewCheckpoint('阅读核对成功后原聊天正常')
    expect(runtime.errors).toEqual([])
  } finally { await fault.dispose() }
})
