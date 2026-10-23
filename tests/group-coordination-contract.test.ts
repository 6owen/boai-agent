/*
 * [INPUT]: 普通API群顺序解释、冻结成员、显式字数限制与Unicode聊天文本。
 * [OUTPUT]: 开发自迭代的固定业务回归：完整成员排列、精确限字计数、无工具与不代答边界。
 * [POS]: tests/group-coordination-contract.test.ts，不调用模型，不替代完整群聊桌面/语义验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { orderedResponseInstruction, replyCharacterCount, validateGroupInterpretation } from '../src/runtime/modules/collaboration/group-coordination'

it('counts a Chinese reply by Unicode code points while excluding all whitespace', () => {
  expect(replyCharacterCount('甲 乙\n丙\t丁　戊')).toBe(5)
  expect(replyCharacterCount('完成😀！')).toBe(4)
})
it('counts punctuation and digits so a limit cannot be evaded with formatting', () => {
  expect(replyCharacterCount('1. 已完成；2. 待确认。')).toBe(12)
  expect(replyCharacterCount(' \n\t　')).toBe(0)
})
it('resolves an unspecified sequence using the frozen eligible roster', () => {
  expect(validateGroupInterpretation({ mode: 'ordered', instruction: '根据前一个已完成回复继续', agentIds: null }, ['a', 'b', 'c'])).toMatchObject({ agentIds: ['a', 'b', 'c'] })
})
it('rejects missing, duplicated and foreign employees instead of changing collaboration membership', () => {
  for (const agentIds of [['a', 'b'], ['a', 'a', 'c'], ['a', 'b', 'foreign']]) expect(() => validateGroupInterpretation({ mode: 'ordered', instruction: '依次回复', agentIds }, ['a', 'b', 'c'])).toThrow()
})
it('preserves explicit limits and rejects an invalid limit without creating a new allowance', () => {
  expect(validateGroupInterpretation({ mode: 'ordered', instruction: '每人不超过80字', agentIds: null, maxReplyCharacters: 80 }, ['a', 'b'])).toMatchObject({ maxReplyCharacters: 80 })
  for (const maxReplyCharacters of [0, -1, 1.5, 10001]) expect(() => validateGroupInterpretation({ mode: 'ordered', instruction: '依次回复', agentIds: null, maxReplyCharacters }, ['a', 'b'])).toThrow()
})
it('does not inject ordered-conversation instructions into independent work', () => {
  expect(orderedResponseInstruction(undefined)).toBe('')
  expect(validateGroupInterpretation({ mode: 'independent' }, ['a', 'b'])).toEqual({ mode: 'independent' })
})
