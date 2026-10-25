/*
 * [INPUT]: 基础组件/生产 MessageCard/Sonner 的中文场景、Electron fixture 与现有产品 API；复制使用键盘激活，避免测试页相邻控件遮挡鼠标。
 * [OUTPUT]: 六种表单控件共用 secondary 表面但仅保留内侧边缘、无底部外侧阴影，普通 Button 保留外侧阴影；聚焦/展开保持中性、校验仍单层红边及组合无双框；ChatComposer 文本/按钮聚焦保持无外侧阴影的中性边缘和32px圆角/独立背景，禁用发送按钮不抑制文本焦点；透明内层只接受 none 或透明零尺寸阴影及比较截图；明暗表单/聊天输入截图后保存清理前审阅检查点；复制短错误和 Sonner 四状态/共用Button secondary细边缘与小阴影的中性卡片/32px圆形状态图标/真实折叠/固定左右控件/中性纯 X与悬停明暗截图。
 * [POS]: tests/e2e/steps/ui.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { createServer } from 'vite'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

type Scenario = {
  loadComponentFixture?: Awaited<ReturnType<typeof loadComponentFixture>>
  exerciseOverlayFocus?: Awaited<ReturnType<typeof exerciseOverlayFocus>>
  exerciseComponentControls?: Awaited<ReturnType<typeof exerciseComponentControls>>
  exerciseMessageCopyError?: Awaited<ReturnType<typeof exerciseMessageCopyError>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function loadComponentFixture(runtime: Desktop) {
  test.skip(Boolean(process.env.BOAI_TEST_PACKAGED_PATH), 'Development-only component fixture; packaged business flows have separate coverage.')
  const server = await createServer({
    configFile: resolve('vite.config.ts'),
    root: resolve('tests/fixtures/ui'),
    server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [resolve('.')] } },
  })
  runtime.defer(() => server.close())
  const root = runtime.root
  let app: ElectronApplication | undefined

  await server.listen()
  const address = server.httpServer!.address() as { port: number }
  app = await runtime.start({ dataDir: root, rendererURL: `http://127.0.0.1:${address.port}` })
  const page = await app.firstWindow(),
    errors: string[] = runtime.errors

  const modules = (await readdir('apps/electron/src/renderer/components/ui')).filter((file) => file.endsWith('.tsx'))
  await expect(page.locator('main')).toHaveAttribute('data-module-count', String(modules.length))
  await page.evaluate(async () => {
    const state = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'light' }, expectedRevision: state.revision })
  })
  return { app, page, errors }
}

async function exerciseOverlayFocus(previous: Awaited<ReturnType<typeof loadComponentFixture>>) {
  let { app, page, errors } = previous
  const trigger = page.getByRole('button', { name: '打开对话框', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '对话框标题' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await expect(dialog).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(dialog.locator('.app-icon').first()).toHaveCSS('mask-image', /data:image\/svg\+xml/)
  const iconSize = await dialog
    .locator('.app-icon')
    .first()
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(iconSize).toBeGreaterThan(0)
  expect(iconSize).toBeLessThanOrEqual(18)
  await page.getByRole('button', { name: '嵌套浮层', exact: true }).click()
  await expect(page.getByText('嵌套浮层标题', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('嵌套浮层标题', { exact: true })).not.toBeVisible()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveCSS('outline-style', 'none')
  await expect(trigger).toHaveCSS('outline-width', '0px')
  return { page, errors, trigger, dialog }
}

async function exerciseComponentControls(previous: Awaited<ReturnType<typeof exerciseOverlayFocus>>) {
  let { page, errors, trigger, dialog } = previous
  await page.getByRole('combobox', { name: '显示模式' }).click()
  await page.locator('[data-slot=select-content]:visible').getByRole('option', { name: '深色', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '显示模式' })).toContainText('深色')
  await page.getByRole('switch', { name: '通知开关' }).click()
  await expect(page.getByRole('switch', { name: '通知开关' })).toBeChecked()
  await page.getByRole('button', { name: '打开菜单' }).click()
  await page.getByRole('menuitem', { name: '执行操作' }).click()
  await expect(page.getByText('操作完成', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '展开详情' }).click()
  await expect(page.getByText('基础组件支持键盘操作。')).toBeVisible()
  await page.getByRole('button', { name: '查看提示' }).hover()
  await expect(page.locator('[data-slot=tooltip-content]')).toBeVisible()
  await expect(page.locator('[data-slot=tooltip-content]')).toContainText('快捷操作提示')
  await page.mouse.move(0, 0)
  return { page, errors, trigger, dialog }
}

async function verifyDarkOverlay(previous: Awaited<ReturnType<typeof exerciseComponentControls>>) {
  let { page, errors, trigger, dialog } = previous
  await page.evaluate(async () => {
    const state = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: state.revision })
  })
  await trigger.click()
  await expect(dialog).toHaveCSS('background-color', 'rgb(33, 33, 33)')
  await expect(dialog).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(page.locator('body>[data-base-ui-portal]')).not.toHaveCount(0)
  expect(errors).toEqual([])
}

async function formSurface(element: Locator) {
  return element.evaluate(element => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, gradient: style.backgroundImage, shadow: style.boxShadow, border: style.borderWidth, radius: style.borderRadius, color: style.color }
  })
}

async function verifyFormSurfaces(previous: Awaited<ReturnType<typeof loadComponentFixture>>, runtime: Desktop) {
  const { page, errors } = previous
  const section = page.locator('#form-surfaces'), reference = section.locator('#surface-reference')
  const controls = [
    { outer: 'surface-input', focus: 'surface-input' },
    { outer: 'surface-textarea', focus: 'surface-textarea' },
    { outer: 'surface-group', focus: 'surface-group-input' },
    { outer: 'surface-chips', focus: 'surface-chips-input' },
    { outer: 'surface-select', focus: 'surface-select' },
    { outer: 'surface-native', focus: 'surface-native' },
  ]
  const blur = async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
    await page.mouse.move(0, 0)
  }
  const verifyInner = async (inner: Locator) => {
    await expect(inner).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(inner).toHaveCSS('background-image', 'none')
    // Tailwind serializes shadow-none/ring-0 as transparent zero-sized layers.
    const transparentZeroShadow = String.raw`(?:inset )?rgba\(\d+, \d+, \d+, 0\) 0px 0px 0px 0px(?: inset)?`
    await expect(inner).toHaveCSS('box-shadow', new RegExp(`^(?:none|${transparentZeroShadow}(?:, ${transparentZeroShadow})*)$`))
    await expect(inner).toHaveCSS('border-width', '0px')
    await expect(inner).toHaveCSS('outline-width', '0px')
  }
  const verifyInputShadow = async (control: Locator) => {
    const { shadow } = await formSurface(control)
    // Split between shadow layers, preserving commas inside rgb()/rgba().
    for (const layer of shadow.split(/,(?![^()]*\))/)) expect(layer).toMatch(/\binset\b/)
  }
  for (const mode of ['light', 'dark'] as const) {
    await page.evaluate(async mode => {
      const state = await window.boai.request('getAppearance', undefined)
      await window.boai.request('updateAppearance', { patch: { mode }, expectedRevision: state.revision })
    }, mode)
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
    await section.scrollIntoViewIfNeeded()
    await blur()
    const expected = await section.evaluate(element => {
      const sample = document.createElement('div')
      element.appendChild(sample)
      Object.assign(sample.style, { backgroundColor: 'var(--card)', color: 'var(--foreground)', border: '0', borderRadius: 'var(--radius-control)', boxShadow: 'var(--shadow-control)' })
      const read = () => {
        const style = getComputedStyle(sample)
        return { background: style.backgroundColor, gradient: style.backgroundImage, shadow: style.boxShadow, border: style.borderWidth, radius: style.borderRadius, color: style.color }
      }
      sample.style.backgroundImage = 'linear-gradient(transparent,transparent),linear-gradient(to bottom,transparent,var(--soft-shade))'
      const buttonNormal = read()
      sample.style.backgroundImage = 'linear-gradient(var(--soft-hover),var(--soft-hover)),linear-gradient(to bottom,transparent,var(--soft-shade))'
      const buttonHover = read()
      sample.style.boxShadow = 'var(--shadow-input)'
      const hover = read()
      sample.style.backgroundImage = 'linear-gradient(transparent,transparent),linear-gradient(to bottom,transparent,var(--soft-shade))'
      const normal = read()
      sample.style.boxShadow = 'inset 0 0 0 1px var(--destructive),var(--shadow-input)'
      const invalid = read()
      Object.assign(sample.style, { backgroundColor: 'var(--surface-composer)', backgroundImage: 'linear-gradient(to bottom,var(--soft-surface-tint),transparent)', borderRadius: 'var(--radius-composer)', boxShadow: 'var(--shadow-input)' })
      const composer = read()
      sample.remove()
      return { normal, hover, invalid, composer, buttonNormal, buttonHover }
    })
    await expect.poll(() => formSurface(reference)).toEqual(expected.buttonNormal)
    const buttonShadow = (await formSurface(reference)).shadow
    expect(buttonShadow).not.toBe('none')
    expect(buttonShadow.split(/,(?![^()]*\))/).some(layer => !/\binset\b/.test(layer))).toBe(true)
    await reference.hover()
    await expect.poll(() => formSurface(reference)).toEqual(expected.buttonHover)
    expect(expected.hover.gradient).not.toBe(expected.normal.gradient)
    expect(expected.invalid.shadow).not.toBe(expected.normal.shadow)
    await blur()
    for (const control of controls) {
      const outer = section.locator(`#${control.outer}`), input = section.locator(`#${control.focus}`)
      await expect.poll(() => formSurface(outer)).toEqual(expected.normal)
      await verifyInputShadow(outer)
      await outer.hover()
      await expect.poll(() => formSurface(outer)).toEqual(expected.hover)
      await page.mouse.move(0, 0)
      await input.focus()
      await expect(input).toBeFocused()
      await expect.poll(() => formSurface(outer)).toEqual(expected.normal)
      await expect(outer).toHaveCSS('outline-width', '0px')
      if (control.outer !== control.focus) await verifyInner(input)
      await blur()
    }
    const select = section.locator('#surface-select')
    await select.hover()
    await page.mouse.down()
    await expect(select).toHaveCSS('transform', 'none')
    await page.mouse.up()
    await expect(page.locator('[data-slot=select-content]:visible')).toBeVisible()
    await page.mouse.move(0, 0)
    await expect.poll(() => formSurface(select)).toEqual(expected.normal)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-slot=select-content]:visible')).toHaveCount(0)
    await blur()
    for (const [outerId, focusId] of [['surface-invalid', 'surface-invalid'], ['surface-invalid-group', 'surface-invalid-child']]) {
      const outer = section.locator(`#${outerId}`), input = section.locator(`#${focusId}`)
      await expect.poll(() => formSurface(outer)).toEqual(expected.invalid)
      await input.focus()
      await expect.poll(() => formSurface(outer)).toEqual(expected.invalid)
      if (outerId !== focusId) await verifyInner(input)
      await blur()
    }
    for (const id of ['surface-disabled', 'surface-disabled-group', 'surface-readonly', 'surface-readonly-group']) {
      const outer = section.locator(`#${id}`), normal = await formSurface(outer)
      expect(normal.gradient).toBe(expected.normal.gradient)
      expect(normal.shadow).toBe(expected.normal.shadow)
      expect(normal.border).toBe('0px')
      await outer.hover({ force: true })
      await expect.poll(() => formSurface(outer)).toEqual(normal)
      await blur()
    }
    for (const id of ['surface-group-input', 'surface-chips-input', 'surface-invalid-child', 'surface-disabled-child', 'surface-readonly-child']) await verifyInner(section.locator(`#${id}`))
    const screenshot = test.info().outputPath(`form-controls-${mode}.png`)
    await section.screenshot({ path: screenshot, animations: 'disabled' })
    await test.info().attach(`form-controls-${mode}`, { path: screenshot, contentType: 'image/png' })
    await runtime.reviewCheckpoint(`${mode} 表单输入仅保留内侧边缘，普通按钮保留外侧阴影`)
    const composer = page.locator('#surface-composer'), composerInput = composer.locator('.chat-composer-input')
    await composer.scrollIntoViewIfNeeded()
    await expect.poll(() => formSurface(composer)).toEqual(expected.composer)
    await verifyInputShadow(composer)
    await expect(composer).toHaveCSS('border-radius', '32px')
    await expect(composer.getByRole('button', { name: '发送验收消息', exact: true })).toBeDisabled()
    await verifyInner(composerInput)
    await composerInput.focus()
    await expect(composerInput).toBeFocused()
    await expect.poll(() => formSurface(composer)).toEqual(expected.composer)
    await verifyInner(composerInput)
    await blur()
    await expect.poll(() => formSurface(composer)).toEqual(expected.composer)
    await page.getByRole('button', { name: '工作目录', exact: true }).focus()
    await expect.poll(() => formSurface(composer)).toEqual(expected.composer)
    await blur()
    const composerScreenshot = test.info().outputPath(`composer-${mode}.png`)
    await composer.screenshot({ path: composerScreenshot, animations: 'disabled' })
    await test.info().attach(`composer-${mode}`, { path: composerScreenshot, contentType: 'image/png' })
    await runtime.reviewCheckpoint(`${mode} 聊天输入保持大圆角与独立背景，无底部外侧阴影`)
    await section.scrollIntoViewIfNeeded()
  }
  expect(errors).toEqual([])
}

async function exerciseMessageCopyError(previous: Awaited<ReturnType<typeof loadComponentFixture>>) {
  const { page, errors } = previous
  const message = page.locator('#toast-error-message')
  const errorText = "Failed to execute 'writeText' on 'Clipboard': Write permission denied."
  await page.evaluate(errorText => {
    const message = document.getElementById('toast-error-message')!
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => {
      message.dataset.copyAttempts = String(Number(message.dataset.copyAttempts ?? '0') + 1)
      throw new DOMException(errorText, 'NotAllowedError')
    } })
  }, errorText)
  const errorToast = page.locator('[data-sonner-toast][data-type=error]')
  for (const attempt of [1, 2]) {
    await message.hover()
    const copy = message.getByRole('button', { name: '复制 Arvin 的消息' })
    await copy.focus()
    await expect(copy).toBeFocused()
    await copy.press('Enter')
    await expect(message).toHaveAttribute('data-copy-attempts', String(attempt))
    await expect(errorToast).toHaveCount(1)
    await expect(errorToast.locator('[data-title]')).toHaveText('复制失败：未获得剪贴板权限。')
    await expect(errorToast).toBeVisible()
    await expect(errorToast.locator('[data-title]')).toHaveCSS('font-size', '12px')
    const titleSize = await errorToast.locator('[data-title]').evaluate(element => ({ height: element.getBoundingClientRect().height, lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight) }))
    expect(titleSize.height).toBeLessThanOrEqual(titleSize.lineHeight + 1)
    await expect(message.locator('.banner,[role=alert]')).toHaveCount(0)
    await expect(message.locator('.message-card')).toContainText('能给我生成一个日记的 markdown 模板吗')
    if (attempt === 1) {
      await errorToast.getByRole('button', { name: '关闭提示' }).click()
      await expect(errorToast).toHaveCount(0)
    }
  }
  return { page, errors, errorToast }
}

const toastStates = [
  { type: 'error', button: '错误提示', token: 'destructive', backgroundToken: 'destructive-background' },
  { type: 'success', button: '成功提示', token: 'success', backgroundToken: 'success-background' },
  { type: 'warning', button: '警告提示', token: 'warning', backgroundToken: 'warning-background' },
  { type: 'info', button: '信息提示', token: 'foreground', backgroundToken: 'selection' },
] as const
type ToastType = typeof toastStates[number]['type']

async function verifyToastLayout(toast: Locator) {
  await expect(toast.locator('[data-icon]')).toHaveCSS('width', '32px')
  await expect(toast.locator('[data-icon]')).toHaveCSS('flex-shrink', '0')
  await expect(toast.locator('[data-content]')).toHaveCSS('flex-grow', '1')
  await expect(toast.locator('[data-content]')).toHaveCSS('min-width', '0px')
  await expect(toast.locator('[data-close-button]')).toHaveCSS('width', '20px')
  await expect(toast.locator('[data-close-button]')).toHaveCSS('height', '20px')
  await expect(toast.locator('[data-close-button]')).toHaveCSS('flex-shrink', '0')
  const layout = await toast.evaluate(element => {
    const bounds = (node: Element) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, centerY: (rect.top + rect.bottom) / 2 } }
    const content = element.querySelector('[data-content]')!
    return { card: bounds(element), icon: bounds(element.querySelector('[data-icon]')!), content: bounds(content), close: bounds(element.querySelector('[data-close-button]')!), contentWidth: content.clientWidth, contentScrollWidth: content.scrollWidth }
  })
  expect(layout.icon.left).toBeGreaterThan(layout.card.left)
  expect(layout.content.left).toBeGreaterThanOrEqual(layout.icon.right - 0.5)
  expect(layout.close.left).toBeGreaterThanOrEqual(layout.content.right - 0.5)
  expect(layout.close.right).toBeLessThan(layout.card.right)
  expect(layout.close.top).toBeGreaterThan(layout.card.top)
  expect(layout.close.bottom).toBeLessThan(layout.card.bottom)
  expect(Math.abs(layout.icon.centerY - layout.card.centerY)).toBeLessThanOrEqual(1)
  expect(Math.abs(layout.close.centerY - layout.card.centerY)).toBeLessThanOrEqual(1)
  expect(layout.contentScrollWidth).toBeLessThanOrEqual(layout.contentWidth + 1)
}

async function verifyToastTheme(page: Page, toast: Locator, type: ToastType, contentVisible = true) {
  const state = toastStates.find(state => state.type === type)!
  const theme = await page.evaluate(({ token, backgroundToken }) => {
    const sample = document.createElement('div')
    Object.assign(sample.style, { backgroundColor: 'var(--card)', color: 'var(--foreground)', border: '0', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-control)', fontFamily: 'var(--font-ui-family)' })
    document.body.append(sample)
    const style = getComputedStyle(sample)
    const result = { background: style.backgroundColor, color: style.color, radius: style.borderTopLeftRadius, shadow: style.boxShadow, font: style.fontFamily, statusColor: '', iconBackground: '', closeRadius: '', closeHoverBackground: '' }
    sample.style.color = `var(--${token})`
    sample.style.backgroundColor = `var(--${backgroundToken})`
    result.statusColor = getComputedStyle(sample).color
    result.iconBackground = getComputedStyle(sample).backgroundColor
    sample.style.backgroundColor = 'var(--accent)'
    sample.style.borderRadius = 'var(--radius-control)'
    const closeStyle = getComputedStyle(sample)
    result.closeRadius = closeStyle.borderTopLeftRadius
    result.closeHoverBackground = closeStyle.backgroundColor
    sample.remove()
    return result
  }, state)
  await expect(toast).toHaveCSS('background-color', theme.background)
  await expect(toast).toHaveCSS('color', theme.color)
  await expect(toast).toHaveCSS('border-top-width', '0px')
  await expect(toast).toHaveCSS('border-top-left-radius', theme.radius)
  await expect(toast).toHaveCSS('box-shadow', theme.shadow)
  await expect(toast).toHaveCSS('font-family', theme.font)
  await expect(toast).toHaveCSS('font-size', '12px')
  await expect(toast).toHaveCSS('padding', '12px 14px')
  await expect(toast).toHaveCSS('gap', '12px')
  await expect(toast).toHaveCSS('opacity', '1')
  await expect(toast.locator('[data-content]')).toHaveCSS('opacity', contentVisible ? '1' : '0')
  await expect(toast.locator('[data-title]')).toHaveCSS('color', theme.color)
  await expect(toast.locator('[data-title]')).toHaveCSS('font-weight', '500')
  await expect(toast.locator('[data-title]')).toHaveCSS('line-height', '16.8px')
  const close = toast.locator('[data-close-button]')
  await expect(close).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(close).toHaveCSS('background-image', 'none')
  await expect(close).toHaveCSS('border-top-width', '0px')
  await expect(close).toHaveCSS('border-top-style', 'none')
  await expect(close).toHaveCSS('box-shadow', 'none')
  await expect(close).toHaveCSS('border-top-left-radius', theme.closeRadius)
  await expect(toast.locator('[data-icon]')).toHaveCSS('color', theme.statusColor)
  await expect(toast.locator('[data-icon]')).toHaveCSS('background-color', theme.iconBackground)
  await expect(close).toHaveCSS('color', theme.color)
  await expect(close.locator('.app-icon')).toHaveCSS('width', '14px')
  await expect(close.locator('.app-icon')).toHaveCSS('height', '14px')
  if (await toast.locator('[data-description]').count()) await expect(toast.locator('[data-description]')).toHaveCSS('font-size', '11px')
  await verifyToastLayout(toast)
  return theme
}

async function captureToastPreview(page: Page, name: string, { preserveHover = false }: { preserveHover?: boolean } = {}) {
  if (!preserveHover) await page.mouse.move(0, 0)
  await page.locator('[data-sonner-toaster]').evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
  })
  const clip = await page.locator('[data-sonner-toast]').evaluateAll(elements => {
    const bounds = elements.map(element => element.getBoundingClientRect())
    const x = Math.max(0, Math.floor(Math.min(...bounds.map(bound => bound.left)) - 24))
    const y = Math.max(0, Math.floor(Math.min(...bounds.map(bound => bound.top)) - 24))
    const right = Math.min(innerWidth, Math.ceil(Math.max(...bounds.map(bound => bound.right)) + 24))
    const bottom = Math.min(innerHeight, Math.ceil(Math.max(...bounds.map(bound => bound.bottom)) + 24))
    return { x, y, width: right - x, height: bottom - y }
  })
  const main = page.locator('main')
  const visibility = await main.evaluate(element => { const previous = element.style.visibility; element.style.visibility = 'hidden'; return previous })
  try {
    if (preserveHover) {
      const close = page.locator('[data-sonner-toast][data-front=true]').getByRole('button', { name: '关闭提示' })
      await close.hover()
      const state = await close.evaluate(async element => {
        await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
        return { hovered: element.matches(':hover'), background: getComputedStyle(element).backgroundColor }
      })
      expect(state.hovered).toBe(true)
      expect(state.background).not.toBe('rgba(0, 0, 0, 0)')
      expect(state.background).not.toBe('transparent')
    }
    const screenshot = test.info().outputPath(`${name}.png`)
    await page.screenshot({ path: screenshot, clip, animations: preserveHover ? 'allow' : 'disabled' })
    await test.info().attach(name, { path: screenshot, contentType: 'image/png' })
  } finally {
    await main.evaluate((element, previous) => { element.style.visibility = previous }, visibility)
  }
}

async function verifyReactiveToasts(previous: Awaited<ReturnType<typeof exerciseMessageCopyError>>) {
  const { page, errors, errorToast } = previous
  const toaster = page.locator('[data-sonner-toaster]')
  await expect(toaster).toHaveCount(1)
  await expect(toaster).toHaveAttribute('data-x-position', 'center')
  await expect(toaster).toHaveAttribute('data-y-position', 'top')
  await expect(toaster).toHaveAttribute('data-sonner-theme', 'light')
  const lightError = await verifyToastTheme(page, errorToast, 'error')
  await errorToast.evaluate(element => element.setAttribute('data-existing-toast', 'error'))
  await page.evaluate(async () => {
    const state = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'dark', fontFamily: 'system' }, expectedRevision: state.revision })
  })
  await expect(toaster).toHaveAttribute('data-sonner-theme', 'dark')
  await expect(errorToast).toHaveAttribute('data-existing-toast', 'error')
  const darkError = await verifyToastTheme(page, errorToast, 'error')
  expect(darkError.background).not.toBe(lightError.background)
  expect(darkError.color).not.toBe(lightError.color)
  expect(darkError.statusColor).not.toBe(lightError.statusColor)
  expect(darkError.font).not.toBe(lightError.font)
  expect(darkError.closeHoverBackground).not.toBe(lightError.closeHoverBackground)
  await errorToast.getByRole('button', { name: '关闭提示' }).click()
  await expect(errorToast).toHaveCount(0)
  await page.getByRole('button', { name: '打开菜单' }).click()
  await page.getByRole('menuitem', { name: '执行操作' }).click()
  const successToast = page.locator('[data-sonner-toast][data-type=success]')
  await expect(successToast).toContainText('操作完成')
  await expect(successToast).toBeVisible()
  const darkSuccess = await verifyToastTheme(page, successToast, 'success')
  const { statusColor: darkErrorStatus, iconBackground: darkErrorIcon, ...darkErrorSurface } = darkError
  const { statusColor: darkSuccessStatus, iconBackground: darkSuccessIcon, ...darkSuccessSurface } = darkSuccess
  expect(darkSuccessSurface).toEqual(darkErrorSurface)
  expect(darkSuccessStatus).not.toBe(darkErrorStatus)
  expect(darkSuccessIcon).not.toBe(darkErrorIcon)
  await successToast.evaluate(element => element.setAttribute('data-existing-toast', 'success'))
  await page.evaluate(async () => {
    const state = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'light', fontFamily: 'geist' }, expectedRevision: state.revision })
  })
  await expect(toaster).toHaveAttribute('data-sonner-theme', 'light')
  await expect(successToast).toHaveAttribute('data-existing-toast', 'success')
  const { statusColor: lightSuccessStatus, iconBackground: lightSuccessIcon, ...lightSuccessSurface } = await verifyToastTheme(page, successToast, 'success')
  const { statusColor: lightErrorStatus, iconBackground: lightErrorIcon, ...lightErrorSurface } = lightError
  expect(lightSuccessSurface).toEqual(lightErrorSurface)
  expect(lightSuccessStatus).not.toBe(lightErrorStatus)
  expect(lightSuccessIcon).not.toBe(lightErrorIcon)
  await successToast.getByRole('button', { name: '关闭提示' }).click()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  for (const mode of ['light', 'dark'] as const) {
    await page.evaluate(async mode => {
      const state = await window.boai.request('getAppearance', undefined)
      await window.boai.request('updateAppearance', { patch: { mode }, expectedRevision: state.revision })
    }, mode)
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
    for (const state of toastStates) {
      await page.getByRole('button', { name: state.button, exact: true }).click()
      const preview = page.locator(`[data-sonner-toast][data-type=${state.type}]`)
      await expect(preview).toBeVisible()
      await expect(toaster).toHaveAttribute('data-sonner-theme', mode)
      const theme = await verifyToastTheme(page, preview, state.type)
      const close = preview.getByRole('button', { name: '关闭提示' })
      await close.hover()
      await expect(close).toHaveCSS('background-color', theme.closeHoverBackground)
      await expect(close).toHaveCSS('background-image', 'none')
      await expect(close).toHaveCSS('color', theme.color)
      if (state.type === 'error') await captureToastPreview(page, `sonner-hover-${mode}`, { preserveHover: true })
      await page.mouse.move(0, 0)
      await expect(close).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(close).toHaveCSS('color', theme.color)
      await preview.getByRole('button', { name: '关闭提示' }).click()
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    }
    await page.getByRole('button', { name: '预览所有提示', exact: true }).click()
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(4)
    for (const state of toastStates) {
      const preview = page.locator(`[data-sonner-toast][data-type=${state.type}]`)
      await expect(preview).toBeVisible()
      await verifyToastTheme(page, preview, state.type)
    }
    await captureToastPreview(page, `sonner-${mode}`)
    for (const state of toastStates) {
      await page.locator(`[data-sonner-toast][data-type=${state.type}]`).getByRole('button', { name: '关闭提示' }).click()
    }
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    await page.getByRole('button', { name: '预览重叠错误', exact: true }).click()
    const stacked = page.locator('[data-sonner-toast][data-type=error]')
    await expect(stacked).toHaveCount(3)
    await page.mouse.move(0, 0)
    for (const index of [0, 1, 2]) {
      const layer = page.locator(`[data-sonner-toast][data-type=error][data-index="${index}"]`)
      await expect(layer).toHaveAttribute('data-expanded', 'false')
      await expect(layer).toHaveAttribute('data-front', String(index === 0))
      await expect(layer.locator('[data-title]')).toHaveText('复制失败：未获得剪贴板权限。')
      await verifyToastTheme(page, layer, 'error', index === 0)
    }
    const backgrounds = await stacked.evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor))
    expect(new Set(backgrounds).size).toBe(1)
    await captureToastPreview(page, `sonner-collapsed-${mode}`)
    for (const remaining of [2, 1, 0]) {
      await page.locator('[data-sonner-toast][data-front=true]').getByRole('button', { name: '关闭提示' }).click()
      await expect(stacked).toHaveCount(remaining)
    }
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    await page.getByRole('button', { name: '预览长错误', exact: true }).click()
    const longError = page.locator('[data-sonner-toast][data-type=error]')
    await expect(longError).toBeVisible()
    await expect(longError.locator('[data-title]')).toContainText('VeryLongContinuousResourceIdentifierWithoutWhitespace')
    const longTheme = await verifyToastTheme(page, longError, 'error')
    const titleSize = await longError.locator('[data-title]').evaluate(element => ({ height: element.getBoundingClientRect().height, lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight) }))
    expect(titleSize.height).toBeGreaterThan(titleSize.lineHeight * 2)
    await longError.getByRole('button', { name: '关闭提示' }).hover()
    await expect(longError.locator('[data-close-button]')).toHaveCSS('background-color', longTheme.closeHoverBackground)
    await expect(longError.locator('[data-close-button]')).toHaveCSS('background-image', 'none')
    await expect(longError.locator('[data-close-button]')).toHaveCSS('color', longTheme.color)
    await page.mouse.move(0, 0)
    await expect(longError.locator('[data-close-button]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await captureToastPreview(page, `sonner-long-${mode}`)
    await longError.getByRole('button', { name: '关闭提示' }).click()
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  }
  expect(errors).toEqual([])
}

Given('基础组件测试页在真实桌面加载所有模块', async ({ runtime, scenario }) => {
  scenario.loadComponentFixture = await loadComponentFixture(runtime)
})

When('打开嵌套浮层再逐层关闭', async ({ scenario }) => {
  scenario.exerciseOverlayFocus = await exerciseOverlayFocus(scenario.loadComponentFixture!)
})

Then('选择开关菜单折叠与提示组件能够交互', async ({ scenario }) => {
  scenario.exerciseComponentControls = await exerciseComponentControls(scenario.exerciseOverlayFocus!)
})

Then('深色对话框正确显示在独立浮层容器', async ({ scenario }) => {
  await verifyDarkOverlay(scenario.exerciseComponentControls!)
})

When('消息复制因剪贴板权限失败并再次重试', async ({ scenario }) => {
  scenario.exerciseMessageCopyError = await exerciseMessageCopyError(scenario.loadComponentFixture!)
})

Then('Sonner 提示长短正文保持左右固定控件且折叠堆叠保持主题背景', async ({ scenario }) => {
  await verifyReactiveToasts(scenario.exerciseMessageCopyError!)
})

Then('六种表单控件在明暗主题共用按钮表面并保留校验与组合边界', async ({ scenario, runtime }) => {
  await verifyFormSurfaces(scenario.loadComponentFixture!, runtime)
})
