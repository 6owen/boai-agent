/*
 * [INPUT]: 真实预览正文Locator。
 * [OUTPUT]: 从正文建立实际DOM选区并触发原鼠标选择处理，替代已移除的标题修改入口。
 * [POS]: 文件预览BDD共用选择动作，不调用或替换业务IPC。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { expect, type Locator } from '@playwright/test'

export async function selectPreviewText(text: Locator) {
  await expect(text).toBeVisible()
  await text.evaluate(element => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()!
    selection.removeAllRanges(); selection.addRange(range)
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
}

export async function selectPreviewLine(view: Locator) {
  await expect(view.locator('[data-file-preview-kind]')).toBeVisible()
  const source = view.getByRole('button', { name: '显示源码', exact: true })
  if (await source.count()) await source.click()
  await selectPreviewText(view.locator('[data-file-line] .shiki-line-content').first())
}
