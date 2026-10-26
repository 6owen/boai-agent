/*
 * [INPUT]: Four fixed VI0 fixture results and the limits frozen before the run.
 * [OUTPUT]: Speech content, silence, process exit and performance acceptance without starting a model.
 * [POS]: Pure acceptance contract for voice-input-vi0.mjs and its regression tests.
 * [PROTOCOL]: Update this Header and scripts/diagnostics/.folder.md when this file changes.
 */
export function passesVoiceProbe(results, limits) {
  const expected = [[10, false], [30, false], [120, false], [10, true]]
  if (!Array.isArray(results) || results.length !== expected.length || !expected.every(([seconds, silence]) => results.filter(value => value.seconds === seconds && value.silence === silence).length === 1)) return false
  return results.every(value => {
    if (value.ok !== true || value.exitCode !== 0 || typeof value.text !== 'string') return false
    if (!Number.isFinite(value.wallMs) || value.wallMs < 0 || value.wallMs > limits.coldMs[value.seconds] || !Number.isFinite(value.maxRssBytes) || value.maxRssBytes < 0 || value.maxRssBytes > limits.rssBytes || !Number.isFinite(value.heartbeatP95Ms) || value.heartbeatP95Ms < 0 || value.heartbeatP95Ms > limits.heartbeatMs) return false
    if (value.silence) return value.text.trim() === ''
    // The clip can end mid-repeat; require its complete core phrase at least once.
    // Accept normal ASR punctuation, full-width digits and Chinese amount notation.
    const text = value.text.normalize('NFKC').replace(/\s/gu, '').replace(/(?<=\d),(?=\d{3}(?:\D|$))/gu, '').replace(/[^\p{L}\p{N}.,]/gu, '')
    return text.includes('检查') && text.includes('报告') && /预算(?:是|为)?(?:1234|一千[二两]百三十四)元/u.test(text)
  })
}
