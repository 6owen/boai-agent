/*
 * [OUTPUT]: 2026-11-24 第三阶段：官方 Workspace 文本及搜索夹具，保留实际业务权限边界；CLI 消费官方文本协议。
 * [INPUT]: Official Workspace read_file text in controlled integration tests.
 * [OUTPUT]: Exact numbered text lines for content assertions; rejects legacy objects.
 * [POS]: Test-only native tool format helper, not a production protocol adapter.
 * [PROTOCOL]: Changes update tests/fixtures/.folder.md.
 */
export function workspaceFileText(result: unknown): string {
  if (typeof result !== 'string') throw new Error('Expected the official Workspace text result')
  const lines = result.split('\n').filter(line => /^\s*\d+→/.test(line))
  if (!lines.length) throw new Error(`Missing official numbered content: ${result}`)
  return lines.map(line => line.replace(/^\s*\d+→/, '')).join('\n')
}
