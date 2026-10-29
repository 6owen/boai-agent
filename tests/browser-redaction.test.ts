/*
 * [OUTPUT]: 浏览器参数可读性覆盖导航/快照/检索与填写脱敏，不修改真实调用。
 * [INPUT]: Directly migrated Craft command redactor and BOAI durable media/audit projection.
 * [OUTPUT]: Successful, rejected, serialized and repeated browser inputs keep values out of durable records without mutating execution arguments.
 * [POS]: Password/input boundary regression; real field refusal is checked by CDP and Electron cases.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { expect, it } from 'vitest'
import { browserToolObservation, redactBrowserCommand, redactBrowserToolInput } from '../packages/runtime/src/adapters/mastra/browser-tool-redaction'
import { summarizeMedia } from '../packages/runtime/src/modules/browser/media'

it('keeps readable browser operations without persisting field values or malformed payloads', () => {
  for(const command of ['snapshot','screenshot --png','navigate https://example.com/weather','find 南京']) {
    expect(browserToolObservation({command})).toEqual({command})
    expect(browserToolObservation(JSON.stringify({command}))).toEqual({command})
  }
  for(const command of ['fill @e1 "private-value"','type "private-value"','select @e2 "private-value"','fill @e1 "private-value']) {
    const input={command};const observation=browserToolObservation(input)
    expect(JSON.stringify(observation)).not.toContain('private-value')
    expect(input.command).toBe(command)
  }
})

it('uses the upstream parser to redact quoted fill and typed text while preserving targets', () => {
  const secret = 'private-value with spaces'
  const input = { command: `fill @e7 ${JSON.stringify(secret)}` }
  expect(redactBrowserToolInput(input, ['@e7'])).toEqual({ command: `fill @e7 [password: ${secret.length} characters]` })
  expect(input.command).toContain(secret)
  expect(redactBrowserCommand(input.command)).toBe(`fill @e7 "[input: ${secret.length} characters]"`)
  expect(redactBrowserCommand('type "private-value"')).not.toContain('private-value')
  expect(redactBrowserCommand('fill @e7 "private-value')).not.toContain('private-value')
  expect(redactBrowserCommand('snapshot')).toBe('snapshot')
})
it('redacts nested native arguments, serialized tool history and API trace spans before durable storage', () => {
  const secret = 'PASSWORD_SHOULD_NEVER_REACH_AUDIT'
  const raw = { name: 'browser_tool', input: { command: `fill @e3 "${secret}"` }, history: [{ function: { name: 'browser_tool', arguments: JSON.stringify({ command: `type "${secret}"` }) } }] }
  const observed = summarizeMedia(raw)
  expect(JSON.stringify(observed)).not.toContain(secret)
  expect(JSON.stringify(raw)).toContain(secret)
  // Existing audit placeholders must not grow/reinterpret after nested summarization.
  expect(summarizeMedia(observed)).toEqual(observed)
})
