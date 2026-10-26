/*
 * [INPUT]: 内置浏览器入口和typed桌面API。
 * [OUTPUT]: 入口只有一个打开动作，没有归属选择/登录资料设置；不可用桥不制造请求。
 * [POS]: 内置浏览器入口静态UI边界，真实点击与固定窗口由Electron BDD验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, test } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { HeaderBrowser } from '../apps/electron/src/renderer/components/app-shell/header-browser'

test('the built-in browser entry is one direct action with no ownership or account settings', () => {
  const html = renderToStaticMarkup(createElement(HeaderBrowser, { api: {} as DesktopApi }))
  expect(html.match(/<button\b/g)).toHaveLength(1)
  expect(html).toContain('打开内置浏览器')
  expect(html).not.toMatch(/员工|会话|登录资料|dialog|disabled=""/)
})
test('the unavailable desktop bridge disables the built-in browser action', () => {
  const html = renderToStaticMarkup(createElement(HeaderBrowser, { api: undefined }))
  expect(html).toContain('disabled=""')
})
