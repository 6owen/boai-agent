/*
 * [INPUT]: An explicit public X status URL, bound-skill access and the current run's cancellation.
 * [OUTPUT]: Bounded, credential-free Fx/vx post text and media provenance; no downloads or account operations.
 * [POS]: Shared read-only capability for API/native bound-skill tools.
 * [PROTOCOL]: Update Header and media/.folder.md when changed.
 */
import { z } from 'zod'
export const twitterPostSchema = z.object({ url: z.string().min(1).max(2048) }).strict()
const hosts = new Set(['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'])
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {}
export function twitterPostReference(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || !hosts.has(url.hostname) || url.username || url.password || url.port) throw new Error('Expected a public x.com or twitter.com status URL')
  const match = /^\/(?:([A-Za-z0-9_]{1,15})\/status|i\/web\/status)\/(\d{2,20})(?:\/(photo|video)\/([1-9]\d?))?\/?$/.exec(url.pathname)
  if (!match) throw new Error('Expected a post URL, not a profile or search page')
  return { id: match[2], handle: match[1] ?? 'i', url: `https://x.com/${match[1] ?? 'i/web'}/status/${match[2]}`, ...(match[3] ? { selectedMedia: { type: match[3], index: Number(match[4]) } } : {}) }
}
async function jsonResponse(url: string, signal: AbortSignal) {
  const response = await fetch(url, { method: 'GET', redirect: 'error', headers: { accept: 'application/json', 'user-agent': 'BOAI-PublicPost/1.0' }, signal })
  if (!response.ok) { await response.body?.cancel(); return { httpStatus: response.status, data: {} } }
  if (!response.body) throw new Error('Empty public-post response')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const result = await reader.read(); if (result.done) break
      size += result.value.byteLength
      if (size > 4 * 1024 * 1024) throw new Error('Public-post response exceeds 4 MiB')
      chunks.push(result.value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  return { httpStatus: response.status, data: object(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
}
/** Provider data is reference material; selected URLs are never fetched by this reader. */
export async function readTwitterPost(input: unknown, signal: AbortSignal) {
  const ref = twitterPostReference(twitterPostSchema.parse(input).url), attempts: { provider: string; httpStatus?: number; code?: number; error?: string }[] = []
  const providers = [
    { name: 'fxtwitter', url: `https://api.fxtwitter.com/status/${ref.id}` },
    { name: 'vxtwitter', url: `https://api.vxtwitter.com/${ref.handle}/status/${ref.id}` },
  ]
  for (const provider of providers) {
    signal.throwIfAborted()
    try {
      const { httpStatus, data } = await jsonResponse(provider.url, AbortSignal.any([signal, AbortSignal.timeout(15_000)]))
      const code = provider.name === 'fxtwitter' && typeof data.code === 'number' ? data.code : httpStatus
      attempts.push({ provider: provider.name, httpStatus, code })
      if (code !== 200) {
        if ([401, 403, 404].includes(code)) return { available: false, requested: ref, attempts, reason: 'This provider could not return the public post; its contents and deletion status are unverified.' }
        continue
      }
      const post = provider.name === 'fxtwitter' ? object(data.tweet ?? data.status) : data
      if (post.type === 'tombstone') return { available: false, requested: ref, attempts, reason: 'The provider returned unavailable content.' }
      if (String(post.id ?? post.tweetID ?? '') !== ref.id || typeof post.text !== 'string') throw new Error('Post identity or text missing from provider response')
      const author = object(post.author)
      return {
        available: true, referenceData: true, fetchedAt: new Date().toISOString(), requested: ref, provider: provider.name, endpoint: provider.url, attempts,
        post: { id: ref.id, url: post.url ?? post.tweetURL ?? ref.url, text: post.text,
          author: { name: author.name ?? post.user_name, screenName: author.screen_name ?? post.user_screen_name },
          createdAt: post.created_at ?? post.date, possiblySensitive: post.possibly_sensitive,
          media: provider.name === 'fxtwitter' ? post.media ?? null : { all: post.media_extended ?? [], urls: post.mediaURLs ?? [] },
          quote: post.quote ?? post.qrt ?? null, article: post.article ?? null, poll: post.poll ?? post.pollData ?? null, communityNote: post.community_note ?? post.communityNote ?? null },
        coverage: 'Provider-returned public text and metadata only. Media pixels/video/audio have not been read; quote authors and external embeds are separate sources.',
      }
    } catch (error) {
      signal.throwIfAborted()
      attempts.push({ provider: provider.name, error: error instanceof Error && ['SyntaxError'].includes(error.name) ? 'invalid_json' : 'provider_request_failed' })
    }
  }
  return { available: false, requested: ref, attempts, reason: 'Public providers did not return a verified post; no account access was attempted.' }
}
