/*
 * [INPUT]: 真实页面中的原生文本框或 ProseMirror 消息编辑器。
 * [OUTPUT]: 当前可见正文，用于同一业务断言兼容单聊与群聊编辑器。
 * [POS]: 桌面 BDD 文本读取，不替换产品编辑行为。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Locator } from '@playwright/test'
export const messageDraft = (input: Locator) => input.evaluate(element => element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? '').replace(/\u200b/g, ''))
