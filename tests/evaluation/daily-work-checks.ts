/*
 * [INPUT]: Actual original/revised Markdown, including numbered headings and a retained footer.
 * [OUTPUT]: Strict preservation outside the requested heading/pending section; a footer after a new section is not deleted by the grader.
 * [POS]: Pure daily-work evidence checks; no model or application startup.
 * [PROTOCOL]: Update Header and evaluation/.folder.md on change.
 */
const pendingHeading = /^#{2,6}\s+(?:[一二三四五六七八九十百0-9]+[.、．]\s*)?待确认事项\s*$/m
const withoutTitle = (text: string) => text.replace(/^# [^\n]*\n?/m, '').trim()
const withoutPending = (text: string) => text.replace(/^#{2,6}\s+(?:[一二三四五六七八九十百0-9]+[.、．]\s*)?待确认事项\s*\n[\s\S]*?(?=^#{1,6}\s|$(?![\s\S]))/gm, '').trim()
export function dailyWorkPreservesUnchangedText(original: string, revised: string) {
  const before = withoutTitle(original), after = withoutTitle(revised)
  if (pendingHeading.test(before)) return withoutPending(before) === withoutPending(after)
  let prefix = 0, suffix = 0
  while (prefix < before.length && before[prefix] === after[prefix]) prefix++
  while (suffix < before.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++
  if (prefix + suffix !== before.length) return false
  const inserted = after.slice(prefix, after.length - suffix).trim()
  return pendingHeading.test(inserted.split('\n')[0]) && !/^#{1,6}\s/m.test(before.slice(prefix))
}
