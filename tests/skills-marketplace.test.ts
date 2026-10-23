/*
 * [INPUT]: 旧项目 provider fixture、实际商店响应形状与可控请求。
 * [OUTPUT]: 三家身份/分页映射、校验、缓存隔离、取消与未知状态回归。
 * [POS]: Skills 商店离线模块测试；默认测试不联网。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it, vi } from 'vitest'
import { SkillMarketplace } from '../src/runtime/modules/resources/skill-marketplace'
import { getSkillMarketplaceDetail, listSkillMarketplace } from '../src/runtime/modules/resources/marketplace-providers'

type FetchInput = Parameters<typeof fetch>[0]

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Skill marketplace provider adapters', () => {
  it('loads the native paginated skills.sh leaderboard view', async () => {
    const fetchImpl = (async (input: FetchInput) => {
      expect(String(input)).toBe('https://skills.sh/api/skills/trending/2')
      return jsonResponse({
        skills: [
          { skillId: 'alpha', source: 'owner/repo', installs: 20, isOfficial: true },
          { skillId: 'beta', source: 'owner/repo', installs: 10 },
        ],
        page: 2,
        total: 450,
        hasMore: true,
      })
    }) as typeof fetch

    const result = await listSkillMarketplace(
      { provider: 'skills-sh', sort: 'trending', page: 2 },
      fetchImpl,
    )

    expect(result.items.map(item => item.id)).toEqual(['owner/repo/alpha', 'owner/repo/beta'])
    expect(result.items[0]?.verified).toBe(true)
    expect(result.items[0]?.install).toEqual({ kind: 'git', source: 'owner/repo', slug: 'alpha' })
    expect(result).toMatchObject({ total: 450, hasMore: true, nextPage: 3 })
  })

  it('forwards ClawHub cursors for infinite loading', async () => {
    const fetchImpl = (async (input: FetchInput) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('cursor')).toBe('next-page')
      return jsonResponse({
        items: [{ slug: 'second-page', displayName: 'Second page' }],
        nextCursor: 'third-page',
      })
    }) as typeof fetch

    const result = await listSkillMarketplace(
      { provider: 'clawhub', cursor: 'next-page', limit: 40 },
      fetchImpl,
    )

    expect(result.items[0]?.slug).toBe('second-page')
    expect(result).toMatchObject({ hasMore: true, nextCursor: 'third-page' })
  })

  it('resolves a ClawHub owner before building its detail and download target', async () => {
    const fetchImpl = (async (input: FetchInput) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/v1/search') {
        return jsonResponse({
          results: [{
            slug: 'self-improving-agent',
            ownerHandle: 'pskoett',
            displayName: 'Self-improving agent',
            downloads: 18_000,
          }],
        })
      }
      expect(url.searchParams.get('ownerHandle')).toBe('pskoett')
      return jsonResponse({
        skill: {
          slug: 'self-improving-agent',
          displayName: 'Self-improving agent',
          description: '# Skill content',
          stats: { downloads: 18_000 },
        },
        owner: { handle: 'pskoett' },
        latestVersion: { version: '4.0.2' },
      })
    }) as typeof fetch

    const item = await getSkillMarketplaceDetail(
      { provider: 'clawhub', id: 'self-improving-agent' },
      fetchImpl,
    )

    expect(item.owner).toBe('pskoett')
    expect(item.content).toBe('# Skill content')
    expect(item.install?.source).toContain('ownerHandle=pskoett')
  })

  it('loads Tencent SkillHub metadata, SKILL.md, and security reports', async () => {
    const fetchImpl = (async (input: FetchInput) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/file')) {
        expect(url.searchParams.get('path')).toBe('SKILL.md')
        return new Response('# Tencent SkillHub content', { status: 200 })
      }
      return jsonResponse({
        skill: {
          displayName: 'Useful skill',
          summary_zh: '一个有用的 Skill',
          sourceUrl: 'https://skillhub.cn/skills/useful-skill',
          stats: { downloads: 42 },
        },
        owner: { handle: 'owner', displayName: 'Owner' },
        namespace: { canonicalName: '@owner/useful-skill' },
        latestVersion: { version: '1.2.3' },
        securityReports: {
          virustotal: { status: 'benign', statusText: 'No threats found' },
        },
      })
    }) as typeof fetch

    const item = await getSkillMarketplaceDetail(
      { provider: 'skillhub', id: '@owner/useful-skill' },
      fetchImpl,
    )

    expect(item.id).toBe('@owner/useful-skill')
    expect(item.content).toBe('# Tencent SkillHub content')
    expect(item.securityReports).toEqual([
      { provider: 'virustotal', status: 'benign', statusText: 'No threats found', reportUrl: undefined },
    ])
    expect(item.install?.source).toContain('slug=useful-skill')
  })
})

it('validates native search and sort capabilities before making a request', () => {
  const http = vi.fn(), marketplace = new SkillMarketplace(http)
  expect(() => marketplace.list({ provider: 'skills-sh', query: 'a' })).toThrow('至少')
  expect(() => marketplace.list({ provider: 'skills-sh', sort: 'downloads' })).toThrow('排序')
  expect(() => marketplace.list({ provider: 'clawhub', page: 2 })).toThrow('游标')
  expect(() => marketplace.list({ provider: 'skillhub', query: 'test', page: 1 })).toThrow('搜索')
  expect(http).not.toHaveBeenCalled()
})

it('retains ClawHub owners in list identities and leaves missing safety signals unknown', async () => {
  const http = vi.fn(async (input: FetchInput) => jsonResponse(String(input).includes('/skills/alpha') ? {
    skill: { slug: 'alpha', description: null }, owner: { handle: 'alice' }, moderation: null,
  } : { items: [{ slug: 'alpha', ownerHandle: 'alice', description: null }, { slug: 'alpha', ownerHandle: 'bob' }], nextCursor: null }))
  const marketplace = new SkillMarketplace(http)
  const result = await marketplace.list({ provider: 'clawhub' })
  expect(result.value.items.map(item => item.id)).toEqual(['alice/alpha', 'bob/alpha'])
  const detail = await marketplace.detail({ provider: 'clawhub', id: 'alice/alpha' })
  expect(detail.value.suspicious).toBeUndefined()
  expect(detail.value.verified).toBeUndefined()
  expect(detail.value.downloads).toBeUndefined()
})

it('SkillHub converts zero-based pages and sorts only the returned page while preserving unknown counts', async () => {
  const marketplace = new SkillMarketplace(async input => {
    expect(new URL(String(input)).searchParams.get('page')).toBe('3')
    return jsonResponse({ data: { total: 100, skills: [{ slug: 'a' }, { slug: 'b', downloads: 10 }] } })
  })
  const result = await marketplace.list({ provider: 'skillhub', page: 2, limit: 2, sort: 'downloads' })
  expect(result.value.items.map(item => item.slug)).toEqual(['b', 'a'])
  expect(result.value.items[1].downloads).toBeUndefined()
  expect(result.value.nextPage).toBe(3)
})

it('malformed envelopes and fields fail visibly, rather than masquerading as an empty store', async () => {
  for (const body of [{}, { skills: 'unavailable' }, { skills: [{ slug: 42 }] }]) {
    await expect(new SkillMarketplace(async () => jsonResponse(body)).list({ provider: 'skills-sh' })).rejects.toThrow('格式已变化')
  }
})

it('duplicate page requests share work, callers cannot mutate cached objects, and expired failures expose stale data', async () => {
  const http = vi.fn(async () => jsonResponse({ skills: [{ skillId: 'alpha', source: 'alice/repo' }] }))
  const marketplace = new SkillMarketplace(http)
  const [first, second] = await Promise.all([marketplace.list({ provider: 'skills-sh' }), marketplace.list({ provider: 'skills-sh' })])
  expect(http).toHaveBeenCalledTimes(1)
  first.value.items[0].name = 'mutated'
  expect(second.value.items[0].name).toBe('alpha')
  marketplace.invalidate('skills-sh')
  http.mockRejectedValueOnce(new Error('offline'))
  expect(await marketplace.list({ provider: 'skills-sh' })).toMatchObject({ stale: true, error: 'offline', value: { items: [{ name: 'alpha' }] } })
  expect((await marketplace.list({ provider: 'clawhub' }).catch(error => error.message))).toContain('格式已变化')
  await marketplace.close()
})

it('invalidated in-flight responses cannot repopulate current cache', async () => {
  let finish!: (value: Response) => void
  const http = vi.fn< typeof fetch >().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(jsonResponse({ skills: [{ slug: 'new', source: 'alice/repo' }] }))
  const marketplace = new SkillMarketplace(http)
  const old = marketplace.list({ provider: 'skills-sh' })
  marketplace.invalidate('skills-sh')
  const current = await marketplace.list({ provider: 'skills-sh' })
  finish(jsonResponse({ skills: [{ slug: 'old', source: 'alice/repo' }] }))
  await old
  expect((await marketplace.list({ provider: 'skills-sh' })).value.items).toEqual(current.value.items)
  expect(http).toHaveBeenCalledTimes(2)
})

it('redirects and oversized responses are rejected; close cancels active requests', async () => {
  const http: typeof fetch = async (_, options) => {
    expect(options?.redirect).toBe('error')
    return new Response('too large', { headers: { 'content-length': String(5 * 1024 * 1024) } })
  }
  await expect(new SkillMarketplace(http).list({ provider: 'skills-sh' })).rejects.toThrow('大小限制')
  const marketplace = new SkillMarketplace(async (_, options) => new Promise((_, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })))
  const query = marketplace.list({ provider: 'skills-sh' })
  const assertion = expect(query).rejects.toThrow('cancelled')
  await marketplace.close(); await assertion
})

it('does not choose the most popular owner for an ambiguous legacy ClawHub slug', async () => {
  const marketplace = new SkillMarketplace(async () => jsonResponse({ results: [{ slug: 'alpha', ownerHandle: 'alice', downloads: 100 }, { slug: 'alpha', ownerHandle: 'bob', downloads: 1 }] }))
  await expect(marketplace.detail({ provider: 'clawhub', id: 'alpha' })).rejects.toThrow('来源不明确')
})
