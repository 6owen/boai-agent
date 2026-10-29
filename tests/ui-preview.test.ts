/*
 * [OUTPUT]: File explorer UI triggers recording while its filesystem host remains backend-only.
 * [INPUT]: Real UI detector, preview entry and Actions definitions.
 * [OUTPUT]: UI detection, native video upload/body preservation and isolated publish credentials; no model calls.
 * [POS]: Magpie preview integration regressions, no model calls.
 * [PROTOCOL]: Update tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
// @ts-expect-error Upstream-derived plain Node module.
import { isUiFile, videoAttachment, withBlock } from '../.github/ui-preview/publish.mjs'

vi.mock('node:child_process', async (original) => ({
  ...await original<typeof import('node:child_process')>(), execFileSync: vi.fn(),
}))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks() })

it('detects BOAI pages and shared styling without recording backend-only changes', () => {
  for (const file of ['apps/electron/src/renderer/app.tsx', 'packages/ui/src/dialog.tsx', 'packages/tokens/src/colors.css', 'packages/file-explorer-plugin/src/explorer.tsx', 'packages/file-explorer-plugin/src/explorer.css', 'vite.config.ts']) expect(isUiFile(file)).toBe(true)
  for (const file of ['packages/runtime/src/app-service.ts', 'packages/file-explorer-plugin/src/host.ts', 'README.md', 'tests/ui-preview.test.ts']) expect(isUiFile(file)).toBe(false)
})
it('missing model credentials stop before launching the app or claiming a preview', () => {
  const env = { ...process.env }; delete env.DEEPSEEK_API_KEY; delete env.PLAN_FILE
  const child = spawnSync(process.execPath, ['.github/ui-preview/run.mjs'], { env, encoding: 'utf8' })
  expect(child.status).not.toBe(0)
  expect(child.stderr).toContain('Set DEEPSEEK_API_KEY')
})
it('keeps untrusted PR execution apart from the trusted writer and engineering gate', async () => {
  const workflow = parse(await readFile('.github/workflows/ui-preview.yml', 'utf8'))
  expect(workflow.permissions).toEqual({})
  expect(workflow.jobs.record.permissions).toEqual({ contents: 'read' })
  expect(workflow.jobs.publish.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' })
  expect(workflow.jobs.record.environment).toBe('ui-preview')
  expect(workflow.jobs.publish.environment).toBe('ui-preview-publish')
  expect(JSON.stringify(workflow.jobs.record)).not.toContain('UI_PREVIEW_UPLOAD_TOKEN')
  const publisher = workflow.jobs.publish.steps.find((step: { env?: Record<string, string> }) => step.env?.UI_PREVIEW_UPLOAD_TOKEN)
  expect(publisher.env.UI_PREVIEW_UPLOAD_TOKEN).toBe('${{ secrets.UI_PREVIEW_UPLOAD_TOKEN }}')
  const writer = workflow.jobs.publish.steps.map((step: { run?: string }) => step.run || '').join('\n')
  expect(writer).not.toContain('pnpm')
  expect(writer).toContain('publish.mjs publish')
  const test = parse(await readFile('.github/workflows/test.yml', 'utf8'))
  expect(test.jobs.required.needs).toEqual(['test'])
  expect(test.jobs.test.steps.some((step: { run?: string }) => step.run === 'pnpm test')).toBe(true)
  expect(JSON.stringify(test.jobs.required)).not.toMatch(/baseline|candidate|ui-regression/)
})

it('replaces only the generated block and preserves author text on both sides', () => {
  const begin = '<!-- boai-ui-preview:begin -->', end = '<!-- boai-ui-preview:end -->'
  const next = `${begin}\nnew video\n${end}`
  expect(withBlock(`author\n${begin}\nold download\n${end}\nreview notes`, next))
    .toBe(`author\n${next}\nreview notes`)
})

it('uploads only the recorded file, refusing paths and symlinks from a PR artifact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'boai video '))
  try {
    await writeFile(join(dir, 'preview.mp4'), 'fixture')
    const video = await videoAttachment(dir, 'preview.mp4')
    expect(video).toEqual({ file: join(dir, 'preview.mp4'), markdown: `![](<${join(dir, 'preview.mp4')}>)` })
    for (const file of ['../secret.mp4', '/etc/passwd', 'preview.mp4#alt', 'file.webm']) {
      await expect(videoAttachment(dir, file)).rejects.toThrow('expected preview.mp4')
    }
    await rm(join(dir, 'preview.mp4'))
    await symlink(join(dir, 'other.mp4'), join(dir, 'preview.mp4'))
    await expect(videoAttachment(dir, 'preview.mp4')).rejects.toThrow('regular file')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

async function publisher() {
  vi.resetModules()
  vi.stubEnv('GITHUB_REPOSITORY', '6owen/boai-agent')
  vi.stubEnv('PR', '60')
  vi.stubEnv('GITHUB_TOKEN', 'actions-fixture')
  // @ts-expect-error Upstream-derived plain Node module.
  return import('../.github/ui-preview/publish.mjs')
}

it('uses gh attachment upload with a standalone video reference and the latest PR body', async () => {
  const { setBlock } = await publisher()
  vi.stubEnv('UI_PREVIEW_UPLOAD_TOKEN', 'upload-fixture')
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body: 'Latest author edits' })))
  vi.stubGlobal('fetch', request)
  await setBlock('![](<out/preview.mp4>)\n\nScreenshots remain below', 'out/preview.mp4')
  expect(execFileSync).toHaveBeenCalledWith('gh', [
    'pr', 'edit', '60', '--repo', '6owen/boai-agent', '--body-file', '-', '--attach', 'out/preview.mp4',
  ], expect.objectContaining({
    input: 'Latest author edits\n\n<!-- boai-ui-preview:begin -->\n![](<out/preview.mp4>)\n\nScreenshots remain below\n<!-- boai-ui-preview:end -->',
    env: expect.objectContaining({ GH_TOKEN: 'upload-fixture', GITHUB_TOKEN: 'upload-fixture' }),
  }))
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer actions-fixture')
})

it('does not substitute the Actions token when native video upload is unconfigured', async () => {
  const { setBlock } = await publisher()
  vi.stubEnv('UI_PREVIEW_UPLOAD_TOKEN', '')
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body: 'Author text' })))
  vi.stubGlobal('fetch', request)
  await expect(setBlock('video', 'out/preview.mp4')).rejects.toThrow('ui-preview-publish')
  expect(execFileSync).not.toHaveBeenCalled()
  expect(request).toHaveBeenCalledTimes(1)
})

it('publishes screenshot-only previews without an upload token or CLI invocation', async () => {
  const { setBlock } = await publisher()
  vi.stubEnv('UI_PREVIEW_UPLOAD_TOKEN', '')
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ body: 'Author text' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({})))
  vi.stubGlobal('fetch', request)
  await setBlock('Screenshot')
  expect(execFileSync).not.toHaveBeenCalled()
  expect(request.mock.calls[1][1].method).toBe('PATCH')
  expect(JSON.parse(request.mock.calls[1][1].body).body).toContain('Author text\n\n<!-- boai-ui-preview:begin -->\nScreenshot')
})

it('keeps screenshots and a truthful download warning when the video uploader fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'boai-preview-failure-'))
  try {
    const { publish } = await publisher()
    vi.stubEnv('OUT_DIR', dir)
    vi.stubEnv('UI_PREVIEW_UPLOAD_TOKEN', 'upload-fixture')
    await writeFile(join(dir, 'preview.mp4'), 'fixture')
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({
      video: 'preview.mp4', scenes: [{ title: 'Files', shots: [{ file: 'files.png', caption: 'Files view' }] }],
    }))
    vi.mocked(execFileSync).mockImplementation((command) => {
      if (command === 'gh') throw new Error('Attachment rejected')
      return ''
    })
    const request = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('?state=open')) return new Response(JSON.stringify([{ number: 60 }]))
      if (init.method === 'PATCH') return new Response('{}')
      return new Response(JSON.stringify({ body: 'Author text', head: { sha: 'abcdef123' } }))
    })
    vi.stubGlobal('fetch', request)
    await expect(publish()).rejects.toThrow('Attachment rejected')
    const patch = request.mock.calls.find(([, init]) => init.method === 'PATCH')!
    const body = JSON.parse(patch[1].body as string).body
    expect(body).toContain('Author text')
    expect(body).toContain('视频附件发布失败')
    expect(body).toContain('[直接下载 mp4]')
    expect(body).toContain('files.png')
    expect(body).not.toContain('可直接播放')
    expect(body).not.toContain(dir)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
