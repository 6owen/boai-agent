/*
 * [INPUT]: Public-provider protocol responses and original bound-skill/native tool adapters.
 * [OUTPUT]: URL/identity/format/size/cancellation/access checks and public-reply observation failures.
 * [POS]: Controlled local tests; no account access or claims about live provider availability.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTwitterPost, twitterPostReference } from '../src/runtime/modules/media/twitter-post'
import { createNativeProducts } from '../src/runtime/adapters/native-products'
import { createBoundSkillOperations } from '../src/runtime/modules/resources/bound-skill-tools'
import type { EngineContext } from '../src/runtime/contracts'
import type { ConversationDetail } from '../src/shared/domain'
import { personalityTurnFailure } from './evaluation/personality-result'
const signal = () => new AbortController().signal
const fx = { code: 200, tweet: { id: '20', text: 'Actual text', url: 'https://x.com/jack/status/20', author: { name: 'Jack', screen_name: 'jack' }, media: { all: [{ type: 'photo', url: 'https://pbs.twimg.com/media/photo.jpg' }] } } }
const roots: string[] = []
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))) })
it.each(['https://x.com/jack/status/20?s=1#abc','https://twitter.com/jack/status/20/photo/1','https://mobile.twitter.com/i/web/status/20'])('normalizes a real status reference: %s', url => { expect(twitterPostReference(url).id).toBe('20') })
it.each(['https://x.com.evil.test/jack/status/20','https://x.com@evil.test/jack/status/20','https://user@x.com/jack/status/20','https://x.com/jack','file:///jack/status/20','https://x.com:9000/jack/status/20'])('rejects invalid URLs before networking: %s', async url => { const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(readTwitterPost({ url }, signal())).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled() })
it('returns complete text and media metadata without downloading or using credentials', async () => {
  const full = 'x'.repeat(18000), fetch = vi.fn(async (_url: unknown, _options?: unknown) => new Response(JSON.stringify({ ...fx, tweet: { ...fx.tweet, text: full } })))
  vi.stubGlobal('fetch', fetch)
  const r = await readTwitterPost({ url: 'https://x.com/jack/status/20' }, signal())
  expect(r).toMatchObject({ available: true, referenceData: true, post: { text: full, id: '20', media: fx.tweet.media } })
  expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0]?.[0]).toBe('https://api.fxtwitter.com/status/20')
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', redirect: 'error' })
  expect(JSON.stringify(fetch.mock.calls)).not.toMatch(/authorization|cookie/i)
})
it('reads the distinct vx fallback format with matching identity after Fx failure', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('unavailable', { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ tweetID: '20', text: 'vx text', user_name: 'J', user_screen_name: 'jack', mediaURLs: ['https://pbs.twimg.com/example.jpg'], media_extended: [{ type: 'image', url: 'https://pbs.twimg.com/example.jpg' }] })))
  vi.stubGlobal('fetch', fetch)
  expect(await readTwitterPost({ url: 'https://x.com/jack/status/20' }, signal())).toMatchObject({ available: true, provider: 'vxtwitter', post: { text: 'vx text', author: { name: 'J', screenName: 'jack' }, media: { urls: ['https://pbs.twimg.com/example.jpg'] } } })
  expect(fetch).toHaveBeenCalledTimes(2)
})
it.each([404,403])('does not turn a JSON error %s into an empty successful post or retry account access', async code => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ code, message: 'not available' }))); vi.stubGlobal('fetch', fetch)
  expect(await readTwitterPost({ url: 'https://x.com/jack/status/20' }, signal())).toMatchObject({ available: false, attempts: [{ code }] });expect(fetch).toHaveBeenCalledOnce()
})
it('never accepts a mismatched post ID, and caps fallback at one request', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ...fx, tweet: { ...fx.tweet, id: '21' } })));vi.stubGlobal('fetch', fetch)
  expect(await readTwitterPost({ url: 'https://x.com/jack/status/20' }, signal())).toMatchObject({ available: false });expect(fetch).toHaveBeenCalledTimes(2)
})
it('rejects oversized content and honors cancellation without fallback', async () => {
  const fetch = vi.fn(async () => new Response('x'.repeat(4*1024*1024+1)));vi.stubGlobal('fetch', fetch)
  expect(await readTwitterPost({ url: 'https://x.com/jack/status/20' }, signal())).toMatchObject({ available: false });expect(fetch).toHaveBeenCalledTimes(2)
  const cancel = new AbortController();cancel.abort();fetch.mockClear()
  await expect(readTwitterPost({ url: 'https://x.com/jack/status/20' }, cancel.signal)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled()
})
it('only offers the reader for the bound skill and rechecks access after actual retrieval', async () => {
  const root = await mkdtemp(join(tmpdir(),'boai-post-'));roots.push(root);await mkdir(join(root,'skill'));await writeFile(join(root,'skill/SKILL.md'),'---\nname: boai-twitter-media\ndescription: Public media\n---\nRead the supplied link.')
  let allowed = true
  const context = { agent: { id: 'a', skillIds: ['skill'], knowledgeIds: [] }, conversation: { id: 'c', kind: 'direct' }, resources: [{ id: 'skill', kind: 'skill', name: 'boai-twitter-media', path: join(root,'skill') }], signal: signal(), assertSkillAccess: async () => { if (!allowed) throw new Error('revoked') } } as unknown as EngineContext
  expect(createBoundSkillOperations({ ...context, agent: { ...context.agent, skillIds: [] } })).toEqual([])
  const op = createBoundSkillOperations(context).find(t => t.name === 'read_twitter_post')!
  vi.stubGlobal('fetch',vi.fn(async () => { allowed=false;return new Response(JSON.stringify(fx)) }))
  await expect(op.execute({ url:'https://x.com/jack/status/20' })).rejects.toThrow('revoked')
})
it('does not certify a completed run with a withheld or absent public answer', () => {
  const detail = { messages: [{ id:'u',senderType:'user',content:'Read the post' }], runs: [{ triggerMessageId:'u',status:'completed',draft:{status:'withheld'} }], turns: [] } as unknown as ConversationDetail
  expect(personalityTurnFailure(detail)).toBe('reply_withheld')
  detail.runs=[];expect(personalityTurnFailure(detail)).toBe('public_reply_missing')
  detail.messages.push({id:'a',senderType:'agent',content:'Actual answer'} as never);expect(personalityTurnFailure(detail)).toBeUndefined()
})

it('native conversation uses the same read-only reader without a Work or command permission', async () => {
  const root = await mkdtemp(join(tmpdir(),'boai-post-native-'));roots.push(root);await writeFile(join(root,'SKILL.md'),'---\nname: boai-twitter-media\ndescription: Public media\n---\nRead actual posts.')
  const context = { agent: { id:'a',skillIds:['s'],knowledgeIds:[],allowCommands:false }, conversation: { id:'c',kind:'direct' }, resources: [{ id:'s',kind:'skill',name:'boai-twitter-media',path:root }], messages:[],signal:signal(),onTool:async()=>{} } as unknown as EngineContext
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(fx))))
  const product=createNativeProducts(context)
  try { expect(await product.tools.find(t=>t.name==='read_twitter_post')!.execute({url:'https://x.com/jack/status/20'},'read-public')).toMatchObject({available:true,post:{text:'Actual text'}});expect(context.work).toBeUndefined() } finally { await product.dispose() }
})
