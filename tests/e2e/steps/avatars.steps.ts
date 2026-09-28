/*
 * [INPUT]: 员工头像上传与跨页面持久化的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 员工头像上传与跨页面持久化的真实桌面业务步骤与断言。
 * [POS]: tests/e2e/steps/avatars.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page, type ElectronApplication } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type Scenario = {
  launchAvatarScenario?: Awaited<ReturnType<typeof launchAvatarScenario>>
  rejectInvalidAvatar?: Awaited<ReturnType<typeof rejectInvalidAvatar>>
  saveUploadedAvatar?: Awaited<ReturnType<typeof saveUploadedAvatar>>
  verifyMemberAppearance?: Awaited<ReturnType<typeof verifyMemberAppearance>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function launchAvatarScenario(runtime: Desktop) {
  const root = runtime.root
  let app: ElectronApplication | undefined, page!: Page
  const errors: string[] = runtime.errors
  const launch = async () => {
    app = await runtime.start({ dataDir: root })
    page = await app.firstWindow()
    await expect(page.locator('.app-shell')).toBeVisible()
  }

  await launch()
  app = runtime.app
  page = runtime.page
  return { runtime, app, page, errors, launch }
}

async function rejectInvalidAvatar(previous: Awaited<ReturnType<typeof launchAvatarScenario>>) {
  let { runtime, app, page, errors, launch } = previous
  const create = async (name: string) => {
    await page.getByRole('button', { name: '新建', exact: true }).click()
    await page.getByRole('menuitem', { name, exact: true }).click()
  }
  await create('新建员工')
  const dialog = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await expect(dialog.getByRole('heading')).toHaveCSS('font-size', '16px')
  await expect(dialog).not.toContainText('先介绍这位同事')
  await dialog.getByRole('button', { name: '更换员工头像' }).click()
  const presets = page.getByRole('group', { name: '内置头像' })
  await expect(presets.getByRole('button')).toHaveCount(12)
  await expect
    .poll(() =>
      presets
        .locator('img')
        .evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true)
  await presets.getByRole('button', { name: '小兔子', exact: true }).click()
  const preview = dialog.locator('.creation-avatar img')
  const rabbit = await preview.getAttribute('src')
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('头像设计师')
  await dialog.getByRole('textbox', { name: '角色', exact: true }).fill('让同事更好辨认')
  await dialog.getByRole('button', { name: '更换员工头像' }).click()
  const invalidChoosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '上传本地图片', exact: true }).click()
  await (await invalidChoosing).setFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not a real image') })
  await expect(page.getByRole('alert')).toContainText('无法读取这张图片')
  await expect(page.getByRole('button', { name: '上传本地图片', exact: true })).toBeFocused()
  await expect(preview).toHaveAttribute('src', rabbit!)
  await page.keyboard.press('Escape')
  await expect(presets).toBeHidden()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '更换员工头像' }).click()
  return { runtime, app, page, errors, launch, create, dialog, preview, rabbit }
}

async function saveUploadedAvatar(previous: Awaited<ReturnType<typeof rejectInvalidAvatar>>) {
  let { runtime, app, page, errors, launch, create, dialog, preview, rabbit } = previous
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 40
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#f5c3ad'
    ctx.fillRect(0, 0, 80, 40)
    ctx.fillStyle = '#644b86'
    ctx.fillRect(24, 12, 32, 16)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '上传本地图片', exact: true }).click()
  await (await choosing).setFiles({ name: 'my-avatar.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') })
  await expect(preview).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect(preview).not.toHaveAttribute('src', rabbit!)
  const uploaded = await preview.getAttribute('src')
  await dialog.getByRole('button', { name: '创建员工', exact: true }).click()
  await expect(dialog).toBeHidden()
  const row = page.locator('.conversation-item').filter({ hasText: '头像设计师' })
  await expect(row.locator('img')).toHaveAttribute('src', uploaded!)
  await expect(page.locator('.chat-empty img')).toHaveAttribute('src', uploaded!)
  const employee = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find((a) => a.name === '头像设计师')!)
  expect(employee.avatar).toEqual({ kind: 'image', dataUrl: uploaded })
  await page.getByRole('button', { name: '权限批准', exact: true }).click()
  await page.getByRole('menuitemradio', { name: /^请求批准/ }).click()
  await expect
    .poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find((a) => a.id === employee.id)?.allowCommands)
    .toBe(true)
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find((a) => a.id === employee.id)?.avatar).toEqual(
    employee.avatar,
  )
  return { runtime, app, page, errors, launch, create, dialog, preview, uploaded, row, employee }
}

async function verifyMemberAppearance(previous: Awaited<ReturnType<typeof saveUploadedAvatar>>) {
  let { runtime, app, page, errors, launch, create, dialog, preview, uploaded, row, employee } = previous
  await row.hover()
  const metrics = await row.evaluate((element) => {
    const s = getComputedStyle(element),
      title = getComputedStyle(element.querySelector('.conversation-title')!),
      subtitle = getComputedStyle(element.querySelector('.conversation-preview')!)
    return {
      height: element.getBoundingClientRect().height,
      padding: s.padding,
      gap: s.gap,
      radius: s.borderRadius,
      title: title.fontSize,
      subtitle: subtitle.fontSize,
      avatar: element.querySelector('.avatar')!.getBoundingClientRect().width,
    }
  })
  const hover = await row.evaluate((element) => getComputedStyle(element).backgroundColor)
  await create('新建群聊')
  const group = page.getByRole('dialog', { name: '发起群聊', exact: true })
  await expect(group.getByRole('heading')).toHaveCSS('font-size', '16px')
  const member = group.locator('label.creation-member').filter({ hasText: '头像设计师' })
  await expect(member.locator('img')).toHaveAttribute('src', uploaded!)
  await expect
    .poll(() =>
      member.evaluate((element) => {
        const s = getComputedStyle(element),
          title = getComputedStyle(element.querySelector('.conversation-title')!),
          subtitle = getComputedStyle(element.querySelector('.conversation-preview')!)
        return {
          height: element.getBoundingClientRect().height,
          padding: s.padding,
          gap: s.gap,
          radius: s.borderRadius,
          title: title.fontSize,
          subtitle: subtitle.fontSize,
          avatar: element.querySelector('.avatar')!.getBoundingClientRect().width,
        }
      }),
    )
    .toEqual(metrics)
  // Use an unselected conversation's hover token; selected rows retain their selection surface.
  await member.hover()
  await expect(member).toHaveCSS(
    'background-color',
    await page.evaluate(() => {
      const el = document.createElement('div')
      el.style.background = 'var(--accent)'
      document.body.append(el)
      const color = getComputedStyle(el).backgroundColor
      el.remove()
      return color
    }),
  )
  expect(hover).not.toBe('rgba(0, 0, 0, 0)')
  await member.getByRole('checkbox').check()
  await group.getByRole('button', { name: '取消', exact: true }).click()
  const leave = page.getByRole('alertdialog')
  await expect(leave.getByRole('button', { name: '继续编辑', exact: true })).toBeVisible()
  await expect(leave.getByRole('button', { name: '保存并退出', exact: true })).toBeVisible()
  await leave.getByRole('button', { name: '放弃并退出', exact: true }).click()
  return { runtime, app, page, errors, launch, uploaded, employee, group }
}

async function verifyPersistedAvatar(previous: Awaited<ReturnType<typeof verifyMemberAppearance>>) {
  let { runtime, app, page, errors, launch, uploaded, employee, group } = previous
  await runtime.close()
  await launch()
  app = runtime.app
  page = runtime.page
  await expect(page!.locator('.conversation-item').filter({ hasText: '头像设计师' }).locator('img')).toHaveAttribute('src', uploaded!)
  await page!.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录' }).click()
  await page!.getByRole('group', { name: '联系人', exact: true }).getByRole('button', { name: '头像设计师', exact: true }).click()
  await expect(page!.locator('.contact-profile-heading img')).toHaveAttribute('src', uploaded!)
  await page!.getByRole('button', { name: '编辑配置' }).click()
  await page!.getByRole('button', { name: '更换员工头像' }).click()
  await page!.getByRole('group', { name: '内置头像' }).getByRole('button', { name: '小狐狸', exact: true }).click()
  await page!.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page!.locator('.contact-profile-heading img')).not.toHaveAttribute('src', uploaded!)
  expect((await page!.evaluate(() => window.boai.request('snapshot', undefined))).agents.find((a) => a.id === employee.id)?.avatar).toEqual({
    kind: 'preset',
    id: 'fox',
  })
  expect(errors).toEqual([])
}

Given('员工头像场景使用独立桌面', async ({ runtime, scenario }) => {
  scenario.launchAvatarScenario = await launchAvatarScenario(runtime)
})

When('选择预设头像并尝试上传损坏图片', async ({ scenario }) => {
  scenario.rejectInvalidAvatar = await rejectInvalidAvatar(scenario.launchAvatarScenario!)
})

Then('有效图片保存为员工头像且配置修改不覆盖头像', async ({ scenario }) => {
  scenario.saveUploadedAvatar = await saveUploadedAvatar(scenario.rejectInvalidAvatar!)
})

Then('群成员列表与会话列表具有一致尺寸和头像', async ({ scenario }) => {
  scenario.verifyMemberAppearance = await verifyMemberAppearance(scenario.saveUploadedAvatar!)
})

Then('重启后头像跨页面保留并可换回预设', async ({ scenario }) => {
  await verifyPersistedAvatar(scenario.verifyMemberAppearance!)
})
