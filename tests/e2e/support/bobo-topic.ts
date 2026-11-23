/*
 * [INPUT]: 当前会话列表和 bobo 的显示名称。
 * [OUTPUT]: 通过 bobo 行右键菜单打开新话题草稿。
 * [POS]: 本机与 API 场景共用的真实会话导航。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Page } from '@playwright/test'

export async function openBoboTopic(page: Page, name = 'bobo') {
  await page.getByRole('button', { name: `${name} 的主聊天`, exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '新话题', exact: true }).click()
}
