/*
 * [OUTPUT]: 新员工计划通过明确归属选择；已有聊天/监控沿原目标设置。
 * [INPUT]: 定时任务生产页面与 Base UI 选择/浮层控件。
 * [OUTPUT]: 复用的语义选择、总览导航、操作菜单与时间预览入口。
 * [POS]: 桌面自动化回归支撑，不改变产品状态或绕过 UI 业务操作。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
export async function selectScheduleOption(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
export async function openSchedule(page: Page, name: string) {
  await page.getByRole('button', { name: '查看全部任务', exact: true }).click()
  await page.locator('.schedule-overview-plan:visible').filter({ hasText: name }).click()
}
export async function scheduleAction(page: Page, action: string) {
  await page.locator('.page-heading:visible').getByRole('button', { name: /^操作 / }).click()
  await page.getByRole('menuitem', { name: action, exact: true }).click()
}
export async function previewSchedule(page: Page) {
  await page.getByRole('button', { name: '时间', exact: true }).click()
  await page.getByText('查看后续时间', { exact: true }).click()
  await expect(page.locator('.automation-setting-popover li')).toHaveCount(5)
  await page.keyboard.press('Escape')
}
export async function scheduleTarget(page: Page, target: 'employee' | 'conversation', label: string) {
  if (target === 'employee' && await page.getByRole('combobox', { name: '自动化归属', exact: true }).count()) { await selectScheduleOption(page, '自动化归属', `员工 · ${label}`); return }
  await page.getByRole('button', { name: '运行于', exact: true }).click()
  await selectScheduleOption(page, '聊天方式', target === 'employee' ? '新任务聊天' : '指定聊天')
  await selectScheduleOption(page, target === 'employee' ? '执行员工' : '目标会话', label)
  await page.keyboard.press('Escape')
}
