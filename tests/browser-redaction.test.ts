/*
 * [INPUT]: Directly migrated Craft command redactor and BOAI durable media/audit projection.
 * [OUTPUT]: Successful, rejected, serialized and repeated browser inputs keep values out of durable records without mutating execution arguments.
 * [POS]: Password/input boundary regression; real field refusal is checked by CDP and Electron cases.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { expect, it } from 'vitest'
import { redactBrowserCommand, redactBrowserToolInput } from '../packages/runtime/src/adapters/mastra/browser-tool-redaction'
import { summarizeMedia } from '../packages/runtime/src/modules/browser/media'

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
