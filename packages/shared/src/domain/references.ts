/*
 * [INPUT]: Explicit BOAI object identities and saved reference text.
 * [OUTPUT]: Canonical internal reference URIs, bounded extraction and read-only cards.
 * [POS]: Shared reference contract; a URI carries no authorization or executable path.
 * [PROTOCOL]: Update Header and domain/.folder.md on change.
 */
export const referenceKinds = ['employee', 'conversation', 'message', 'memory', 'skill', 'prompt', 'task', 'plan'] as const
export type ReferenceKind = typeof referenceKinds[number]
export interface ReferenceScope { agentId: string; conversationId: string }
export interface ReferenceObject { uri: string; kind: ReferenceKind; id: string; title: string; body: string; revision: string; updatedAt?: string }
export type ReferenceCard = Omit<ReferenceObject, 'body'> & { summary: string; characters: number }
export interface ReferenceResolution { card: ReferenceCard; body?: string; offset?: number; nextOffset?: number }
export function referenceUri(kind: ReferenceKind, id: string) { return `boai://ref/${kind}/${encodeURIComponent(id)}` }
export function parseReferenceUri(value: string): { kind: ReferenceKind; id: string } | undefined {
  const match = /^boai:\/\/ref\/([a-z]+)\/([^/?#]+)$/.exec(value)
  if (!match || !referenceKinds.includes(match[1] as ReferenceKind)) return
  try {
    const id = decodeURIComponent(match[2]), kind = match[1] as ReferenceKind
    if (!id || id.length > 200 || /[\u0000-\u001f\u007f]/.test(id) || referenceUri(kind, id) !== value) return
    return { kind, id }
  } catch { return }
}
export function referenceUris(text: string, limit = 50): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(/boai:\/\/ref\/[a-z]+\/[^\s<>()[\]"'`，。；！？]+/g)) {
    if (parseReferenceUri(match[0])) found.add(match[0])
    if (found.size >= limit) break
  }
  return [...found]
}
export function referenceCard(value: ReferenceObject): ReferenceCard {
  const { body, ...card } = value
  return { ...card, summary: body.slice(0, 240), characters: body.length }
}
