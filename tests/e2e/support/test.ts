/*
 * [INPUT]: playwright-bdd 场景生命周期和 Desktop 宿主。
 * [OUTPUT]: 每场景隔离的 runtime fixture；业务步骤可扩展自己的类型化状态。
 * [POS]: Electron BDD 的 fixture 根，不创建额外浏览器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { test as base } from 'playwright-bdd'
import { Desktop } from './desktop'

export const test = base.extend<{ runtime: Desktop }>({
  runtime: async ({}, use, info) => {
    const desktop = await Desktop.create(info)
    try {
      await use(desktop)
    } finally {
      await desktop.dispose()
    }
  },
})
