/*
 * [INPUT]: 本机技能中文场景、真实 Electron IPC 与隔离目录。
 * [OUTPUT]: 图标侧栏/会话式两栏、扫描/外部编辑后刷新详情、搜索/收藏/分组编辑/全局拖拽及可见分组键盘排序/重启和显式导入不授权的业务断言。
 * [POS]: 本机 Skills 桌面步骤。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import { startLocalSkills, selectSkillsSection } from '../support/local-skills'
export const test = base.extend<{ localSkills: { source?: string; document?: string } }>({ localSkills: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('本机已有全局技能和插件但尚未向 BoAI 导入', async ({ runtime, localSkills }) => {
  const fixture = await startLocalSkills(runtime); localSkills.source = fixture.global; localSkills.document = fixture.document
})
When('从侧栏打开技能管理', async ({ runtime }) => {
  await selectSkillsSection(runtime.page, '全部技能')
})
Then('会话式两栏显示本机技能来源和正文且没有授予员工权限', async ({ runtime, localSkills }) => {
  const page = runtime.page, nav = page.getByRole('navigation', { name: '主导航' })
  await expect(page.getByRole('heading', { name: 'Agents SDK', exact: true })).toBeVisible()
  await nav.getByRole('button', { name: '技能', exact: true }).click()
  for (const name of ['全部技能', '自己', '统计']) await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '检查更新', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '安装记录', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/local-skills-popover.png' })
  await page.keyboard.press('Escape')
  await expect(nav.getByRole('button', { name: '技能', exact: true })).toBeFocused()
  await nav.getByRole('button', { name: '技能商城', exact: true }).click()
  for (const name of ['skills.sh', 'ClawHub', '腾讯 SkillHub']) await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(nav).toHaveCSS('width', '52px')
  await expect(page.getByRole('button', { name: /agents-sdk Build AI/ })).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Agents SDK', exact: true })).toBeVisible()
  await expect(page.getByText('全局 (~/.agents/skills/)', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'agents-sdk 的操作', exact: true }).click()
  const reveal = page.getByRole('menuitem', { name: '在文件夹中显示', exact: true })
  await expect(reveal).toBeVisible()
  await expect(page.getByRole('menu', { name: 'agents-sdk 的操作', exact: true })).toHaveCSS('width', '224px')
  await expect(reveal).toHaveCSS('white-space', 'nowrap')
  await page.keyboard.press('Escape')
  const boxes = await Promise.all([nav, page.locator('.skills-list-pane'), page.locator('.skills-detail-pane')].map(locator => locator.boundingBox()))
  expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x + 1); expect(boxes[1]!.x + boxes[1]!.width).toBeLessThan(boxes[2]!.x)
  await expect(page.locator('.skills-list-pane .list-heading')).toHaveCSS('height', '52px')
  await expect(page.locator('.skills-detail-pane .chat-header')).toHaveCSS('height', '52px')
  await expect(page.getByRole('textbox', { name: '搜索本机技能' })).toBeVisible()
  const separator = page.getByRole('separator', { name: '调整技能列表宽度' })
  const initialWidth = Number(await separator.getAttribute('aria-valuenow'))
  await separator.focus(); await page.keyboard.press('ArrowRight')
  await expect(separator).toHaveAttribute('aria-valuenow', String(initialWidth + 10))
  await page.keyboard.press('ArrowLeft')
  await writeFile(join(localSkills.source!, 'SKILL.md'), `${localSkills.document}\n\n外部保存后的新说明。\n`)
  await page.getByRole('button', { name: '重新扫描技能', exact: true }).click()
  await expect(page.getByText('外部保存后的新说明。', { exact: true })).toBeVisible()
  await writeFile(join(localSkills.source!, 'SKILL.md'), localSkills.document!)
  await page.getByRole('button', { name: '重新扫描技能', exact: true }).click()
  await expect(page.getByText('外部保存后的新说明。', { exact: true })).toHaveCount(0)
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toEqual([]); expect(snapshot.agents.every(agent => !agent.skillIds.length)).toBe(true)
  await page.screenshot({ path: 'test-results/local-skills-layout.png' })
})
When('搜索插件技能并加入自己的分组', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('textbox', { name: '搜索本机技能' }).fill('express')
  await expect(page.getByRole('heading', { name: 'Express Modular', exact: true })).toBeVisible()
  await expect(page.getByText('插件 (kata-code)', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '加入自己', exact: true }).click()
  await selectSkillsSection(page, '自己')
  await page.getByRole('button', { name: '技能分组', exact: true }).click()
  await page.getByRole('button', { name: '新建分组', exact: true }).click()
  await page.getByRole('textbox', { name: '分组名称' }).fill('自己开发')
  await page.getByRole('button', { name: '保存分组', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /express-modular kata-code/ }).dragTo(page.getByRole('button', { name: /自己开发.*0/ }))
  await expect(page.locator('.skills-list-group').filter({ has: page.getByRole('button', { name: /自己开发/ }) }).getByRole('button', { name: /express-modular kata-code/ })).toBeVisible()
})
Then('重启后技能收藏和分组仍可访问', async ({ runtime }) => {
  await runtime.restart(); const page = runtime.page
  await selectSkillsSection(page, '自己')
  await expect(page.getByRole('heading', { name: 'Express Modular', exact: true })).toBeVisible()
  await expect(page.getByLabel('express-modular 的分组', { exact: true })).toHaveValue((await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).groups[0].id)
})
When('将本机技能预览后导入 BoAI', async ({ runtime }) => {
  const page = runtime.page
  await selectSkillsSection(page, '全部技能')
  await page.getByRole('button', { name: /agents-sdk Build AI/ }).click()
  await page.getByRole('button', { name: '导入到 BoAI', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入 Skills' })
  await dialog.getByRole('button', { name: '预览此技能' }).click()
  await expect(dialog.getByRole('checkbox', { name: '选择 agents-sdk' })).toBeChecked()
  await dialog.getByRole('button', { name: '安装所选 · 1' }).click()
  await expect(dialog.getByText('已安装', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
})
Then('原文件保持不变且导入副本未自动绑定员工', async ({ runtime, localSkills }) => {
  expect(await readFile(join(localSkills.source!, 'SKILL.md'), 'utf8')).toBe(localSkills.document)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toHaveLength(1); expect(snapshot.agents.every(agent => !agent.skillIds.length)).toBe(true)
  expect(snapshot.resources[0].path).not.toBe(localSkills.source)
  expect(runtime.errors).toEqual([])
})

When('收藏两个技能并在原位置编辑分组', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '加入自己', exact: true }).click()
  await page.getByRole('button', { name: /express-modular kata-code/ }).click()
  await page.getByRole('button', { name: '加入自己', exact: true }).click()
  await selectSkillsSection(page, '自己')
  await page.getByRole('button', { name: '技能分组', exact: true }).click()
  await page.getByRole('button', { name: '新建分组', exact: true }).click()
  const input = page.getByRole('textbox', { name: '分组名称' })
  await input.fill('不保存的分组')
  const boxes = await Promise.all([input, page.getByRole('button', { name: '保存分组' }), page.getByRole('button', { name: '取消', exact: true })].map(item => item.boundingBox()))
  expect(boxes[0]!.x + boxes[0]!.width).toBeLessThan(boxes[1]!.x)
  expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(5)
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x)
  await page.screenshot({ path: 'test-results/skill-group-create.png' })
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect((await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).groups).toEqual([])
  for (const name of ['日常', '开发']) {
    await page.getByRole('button', { name: '新建分组', exact: true }).click()
    await input.fill(name); await page.getByRole('button', { name: '保存分组' }).click()
    await expect(page.getByRole('group', { name: `分组 ${name}`, exact: true })).toBeVisible()
  }
  const group = page.getByRole('group', { name: '分组 开发', exact: true })
  const titleBox = (await group.locator('.skill-group-name').boundingBox())!
  await group.hover(); await page.getByRole('button', { name: '重命名 开发', exact: true }).click()
  await expect(group.locator('.skill-group-name')).toHaveCount(0)
  await expect(group.getByRole('textbox', { name: '分组名称' })).toBeVisible()
  expect(Math.abs((await input.boundingBox())!.y - titleBox.y)).toBeLessThan(10)
  await input.fill('自己开发'); await page.screenshot({ path: 'test-results/skill-group-rename.png' })
  await page.getByRole('button', { name: '保存分组' }).click()
  await expect(page.getByRole('group', { name: '分组 自己开发', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^(上移|下移) / })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/skill-groups-inline.png' })
})

Then('分组与技能使用会话落点提示进行排序和跨组移动', async ({ runtime }) => {
  const page = runtime.page
  const drag = async (from: import('@playwright/test').Locator, to: import('@playwright/test').Locator, placement: 'before' | 'inside') => {
    const a = (await from.boundingBox())!, b = (await to.boundingBox())!
    await page.mouse.move(a.x + 35, a.y + a.height / 2); await page.mouse.down()
    await page.mouse.move(b.x + 35, b.y + (placement === 'before' ? 4 : b.height / 2), { steps: 10 })
    await page.mouse.move(b.x + 36, b.y + (placement === 'before' ? 4 : b.height / 2))
    await expect(page.locator(`[data-drop=${placement}]`)).toBeVisible()
    await expect(page.locator('.drag-list-dragging')).toHaveCSS('opacity', '0.35')
    await page.screenshot({ path: `test-results/skills-drag-${placement}.png` })
    await page.mouse.up()
    await expect(page.locator('[data-drop]')).toHaveCount(0)
  }
  const dev = page.getByRole('group', { name: '分组 自己开发', exact: true }), daily = page.getByRole('group', { name: '分组 日常', exact: true })
  await drag(dev, daily, 'before')
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).groups.map(group => group.name)).toEqual(['自己开发', '日常'])
  await dev.focus(); await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).groups.map(group => group.name)).toEqual(['日常', '自己开发'])
  await dev.focus(); await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).groups.map(group => group.name)).toEqual(['自己开发', '日常'])
  await page.keyboard.press('Escape')
  const heading = page.getByRole('button', { name: /日常.*0/ })
  await heading.click(); await expect(heading).toHaveAttribute('aria-expanded', 'false')
  await page.mouse.move(900, 200)
  await expect(heading).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(heading.locator('.app-icon')).toHaveCSS('opacity', '0')
  await drag(page.getByRole('button', { name: /agents-sdk Build AI/ }), heading, 'inside')
  const dailyHeading = page.getByRole('button', { name: /日常.*1/ })
  await expect(dailyHeading).toHaveAttribute('aria-expanded', 'false'); await dailyHeading.click()
  const sdk = page.getByRole('button', { name: /agents-sdk Build AI/ }), express = page.getByRole('button', { name: /express-modular kata-code/ })
  await drag(express, sdk, 'before')
  const rows = page.getByRole('group', { name: '日常技能', exact: true }).locator('.conversation-title')
  await expect(rows).toHaveText(['express-modular', 'agents-sdk'])
  await express.focus(); await page.keyboard.press('Alt+ArrowDown')
  await expect(rows).toHaveText(['agents-sdk', 'express-modular'])
  await drag(express, page.getByRole('button', { name: /自己开发.*0/ }), 'inside')
  await expect(page.getByRole('group', { name: '自己开发技能', exact: true }).locator('.conversation-title')).toHaveText(['express-modular'])
  // Visual group order differs from the stored favorite order: move to the next visible row.
  await express.focus(); await page.keyboard.press('Alt+ArrowDown')
  await expect(rows).toHaveText(['agents-sdk', 'express-modular'])
  await page.screenshot({ path: 'test-results/skills-own-groups.png' })
})

Then('重启后分组顺序和技能顺序保持且没有新增授权', async ({ runtime }) => {
  await runtime.restart(); const page = runtime.page
  await selectSkillsSection(page, '自己')
  await expect(page.getByRole('group', { name: '日常技能', exact: true }).locator('.conversation-title')).toHaveText(['agents-sdk', 'express-modular'])
  const collections = await page.evaluate(() => window.boai.request('getSkillCollections', undefined))
  expect(collections.groups.map(group => group.name)).toEqual(['自己开发', '日常'])
  expect(Object.values(collections.groupByResourceId)).toEqual([collections.groups[1].id, collections.groups[1].id])
  expect(collections.favoriteResourceIds).toHaveLength(2)
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toEqual([]); expect(snapshot.agents.every(agent => !agent.skillIds.length)).toBe(true)
  expect(runtime.errors).toEqual([])
})
