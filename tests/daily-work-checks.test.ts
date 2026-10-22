/*
 * [INPUT]: Revision evidence corruption patterns and valid insertions beside an existing footer.
 * [OUTPUT]: Rejects unrequested deletions, rewrites and renumbering without misclassifying retained footers or Chinese headings.
 * [POS]: Daily-work grader regression; no product/model startup.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { expect, it } from 'vitest'
import { dailyWorkPreservesUnchangedText } from './evaluation/daily-work-checks'
const original = '# 原标题\n\n## 一、数据\n\n真实数据。\n\n## 二、来源\n\n真实来源。\n\n> 原有尾注。\n'
const revised = original.replace('# 原标题', '# 新标题').replace('> 原有尾注。', '## 三、待确认事项\n\n预算未知。\n\n> 原有尾注。')
it('accepts a requested insertion with Chinese numbering before a preserved footer', () => expect(dailyWorkPreservesUnchangedText(original, revised)).toBe(true))
it('rejects deletion of an unrelated original paragraph', () => expect(dailyWorkPreservesUnchangedText(original, revised.replace('真实数据。\n\n', ''))).toBe(false))
it('rejects unrelated prose changes', () => expect(dailyWorkPreservesUnchangedText(original, revised.replace('真实数据。', '未经确认的新结论。'))).toBe(false))
it('rejects unrelated section renumbering', () => expect(dailyWorkPreservesUnchangedText(original, revised.replace('二、来源', '三、来源'))).toBe(false))
it('rejects insertion of the requested section ahead of another original section', () => expect(dailyWorkPreservesUnchangedText(original, original.replace('## 二、来源', '## 待确认事项\n\n预算未知。\n\n## 二、来源'))).toBe(false))
it('accepts updating an existing requested section while retaining the following section', () => {
  const before = '# 标题\n\n## 待确认事项\n\n旧说明\n\n## 来源\n\n原来源'
  expect(dailyWorkPreservesUnchangedText(before, before.replace('旧说明', '预算、邀请人数与根因未知'))).toBe(true)
  expect(dailyWorkPreservesUnchangedText(before, before.replace('旧说明', '预算未知').replace('原来源', '改动来源'))).toBe(false)
})
