/*
 * [INPUT]: Fixed synthetic speech/silence results and the original VI0 performance limits.
 * [OUTPUT]: Empty or wrong recognition cannot pass; fixed content variants and original failure gates remain covered.
 * [POS]: Pure VI0 result regression; no engine, downloads, microphone or Electron process.
 * [PROTOCOL]: Update this Header and tests/.folder.md when this file changes.
 */
import { expect, test } from 'vitest'
// @ts-expect-error Plain Node ESM probe helper intentionally has no declaration file.
import { passesVoiceProbe } from '../scripts/diagnostics/voice-input-result.mjs'

const limits = { coldMs: { 10: 5000, 30: 8000, 120: 20000 }, rssBytes: 1536 * 1024 * 1024, heartbeatMs: 200, wallMs: 30000 }
const speech = '请帮我检查这份报告。预算是1234元，明天下午三点之前完成。'
function results(text = speech) {
  return [[10, false], [30, false], [120, false], [10, true]].map(([seconds, silence]) => ({ seconds, silence, text: silence ? '' : text, ok: true, exitCode: 0, wallMs: 1000, maxRssBytes: 512 * 1024 * 1024, heartbeatP95Ms: 15 }))
}

test('an engine returning empty text for every clip cannot pass', () => {
  expect(passesVoiceProbe(results(''), limits)).toBe(false)
})

test.each(['1234', '１２３４', '1,234', '一千二百三十四', '一千两百三十四'])('recognizes the fixed core phrase with amount %s', amount => {
  expect(passesVoiceProbe(results(speech.replace('1234', amount)), limits)).toBe(true)
})

test.each(['请帮我检查这份报告。', '预算是1234元。', speech.replace('1234', '1235'), speech.replace('1234', '12345'), speech.replace('1234', '123.4'), speech.replace('1234', '12,34')])('rejects missing keywords or wrong amount: %s', text => {
  expect(passesVoiceProbe(results(text), limits)).toBe(false)
})

test('silence must remain empty even when the three speech clips are correct', () => {
  const samples = results(); samples[3].text = '我.'
  expect(passesVoiceProbe(samples, limits)).toBe(false)
})

test.each([
  { ok: false }, { exitCode: 1 }, { wallMs: 5001 }, { maxRssBytes: limits.rssBytes + 1 }, { heartbeatP95Ms: 201 },
])('original process and performance failures remain rejected: %j', failure => {
  const samples = results(); Object.assign(samples[0], failure)
  expect(passesVoiceProbe(samples, limits)).toBe(false)
})

test('all four distinct fixtures are required', () => {
  expect(passesVoiceProbe([], limits)).toBe(false)
  expect(passesVoiceProbe(results().slice(0, 3), limits)).toBe(false)
  const samples = results(); samples[2] = samples[1]
  expect(passesVoiceProbe(samples, limits)).toBe(false)
})
