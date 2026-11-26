/*
 * [INPUT]: 场景隔离的真实 Electron main IPC 与指定员工身份。
 * [OUTPUT]: 共用加号子菜单与键入 @ 的真实交互定位。
 * [OUTPUT]: 仅拒绝下一次权限保存的故障注入，其余请求经过原生产 handler。
 * [POS]: 输入框权限持久化 BDD 支撑；不进入产品构建。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Page } from '@playwright/test'
import type { Desktop } from './desktop'
import { messageDraft } from './editor-controls'

export async function rejectNextPermissionSave(runtime: Desktop, agentId: string) {
  await runtime.app.evaluate(({ ipcMain }, id) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    let rejected = false
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (!rejected && payload.method === 'saveAgent' && payload.input.id === id && payload.input.allowCommands === true) {
        rejected = true
        throw new Error('验收：权限保存失败，未提交')
      }
      return original(event, payload)
    })
  }, agentId)
}

export async function openComposerSubmenu(page: Page, name: '技能' | '数据源' | '提示词' | '快捷命令') {
  await page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).hover()
  return page.getByRole('menu', { name, exact: true })
}

export async function openComposerMentions(page: Page) {
  const editor = page.getByRole('textbox', { name: '消息内容', exact: true })
  const text = await messageDraft(editor)
  await editor.press('End')
  if (text && !/\s$/u.test(text)) await editor.press('Space')
  await editor.press('@')
}
