/*
 * [OUTPUT]: File explorer UI triggers recording while its filesystem host remains backend-only.
 * [INPUT]: Real UI detector, preview entry and Actions definitions.
 * [OUTPUT]: Actual recording exit status, partial evidence, current-head publication and video/body preservation; no GUI or model calls.
 * [POS]: Magpie preview integration regressions, no model calls.
 * [PROTOCOL]: Update tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
// @ts-expect-error Upstream-derived plain Node module.
import { isUiFile, videoAttachment, withBlock } from '../.github/ui-preview/publish.mjs'
// @ts-expect-error Shared plain Node result rules.
import { previewOutcome, recordingSummary, validatePlan } from '../.github/ui-preview/result.mjs'

const sha = 'abcdef123'.padEnd(40, '0')
const manifest = () => ({
  version: 1, sourceSha: sha, plannedScenes: 1, errors: [] as string[], video: null as string | null,
  scenes: [{ title: 'Files', start: 'chat', plannedSteps: 1, completedSteps: 1, failedSteps: 0, status: 'complete', shots: [{ file: 'files.png', caption: 'Files view' }] }],
})

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
  for (const job of ['detect', 'record', 'publish']) expect(workflow.jobs[job].steps[0].with.ref).toBe('${{ github.sha }}')
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
  vi.stubEnv('SHA', sha)
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
    await writeFile(join(dir, 'files.png'), 'fixture')
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ ...manifest(), video: 'preview.mp4' }))
    vi.mocked(execFileSync).mockImplementation((command) => {
      if (command === 'gh') throw new Error('Attachment rejected')
      return ''
    })
    const request = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('?state=open')) return new Response(JSON.stringify([{ number: 60 }]))
      if (init.method === 'PATCH') return new Response('{}')
      return new Response(JSON.stringify({ state: 'open', body: 'Author text', head: { sha } }))
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

it('requires all planned scenes and steps, even when screenshots exist', () => {
  expect(previewOutcome(manifest())).toBe('complete')
  expect(previewOutcome({ ...manifest(), plannedScenes: 2 })).toBe('partial')
  expect(previewOutcome({ ...manifest(), errors: ['click failed'] })).toBe('partial')
  expect(previewOutcome(manifest(), 'failure')).toBe('partial')
  expect(previewOutcome({ ...manifest(), scenes: [] })).toBe('failed')
  expect(previewOutcome({ ...manifest(), leak: true })).toBe('failed')
  expect(previewOutcome({ scenes: [], errors: [], skipped: 'no visible UI change found in the diff' })).toBe('skipped')
  expect(recordingSummary({ ...manifest(), plannedScenes: 2 })).toContain('1/2 个场景完成')
})

it('rejects empty UI plans, invented pages and scenes with no screenshot', () => {
  expect(() => validatePlan({ ui_change: true, scenes: [] })).toThrow('1–5')
  expect(() => validatePlan({ ui_change: true, scenes: [{ start: 'agents', steps: [{ do: 'shot' }] }] })).toThrow('未知录制页面')
  expect(() => validatePlan({ ui_change: true, scenes: [{ start: 'chat', steps: [{ do: 'click' }] }] })).toThrow('至少一张截图')
  expect(() => validatePlan({ ui_change: false, scenes: [] })).not.toThrow()
})

it.each(['new-head', 'closed'])('does not publish %s evidence or replace current PR text', async kind => {
  const { publish, setBlock } = await publisher()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ state: kind === 'closed' ? 'closed' : 'open', body: 'New author edits', head: { sha: kind === 'new-head' ? 'f'.repeat(40) : sha } }))))
  await publish()
  expect(await setBlock('old recording', undefined, sha)).toBe(false)
  expect(execFileSync).not.toHaveBeenCalled()
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true)
})

it('shows partial screenshots and fails publication rather than claiming completion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'boai-preview-partial-'))
  try {
    const { publish } = await publisher()
    vi.stubEnv('OUT_DIR', dir)
    vi.stubEnv('RECORD_RESULT', 'failure')
    await writeFile(join(dir, 'files.png'), 'fixture')
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ ...manifest(), plannedScenes: 2, errors: ['could not open contacts'] }))
    const request = vi.fn(async (url: string, init: RequestInit) => new Response(JSON.stringify(url.includes('?state=open') ? [{ number: 60 }] : init.method === 'PATCH' ? {} : { state: 'open', head: { sha }, body: 'Author text' })))
    vi.stubGlobal('fetch', request)
    await expect(publish()).rejects.toThrow('partial')
    const patch = request.mock.calls.find(([, init]) => init.method === 'PATCH')!
    const body = JSON.parse(patch[1].body as string).body
    expect(body).toContain('录制：部分完成')
    expect(body).toContain('1/2 个场景完成')
    expect(body).toContain('files.png')
    expect(body).toContain('Author text')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

it.each(['wrong-sha', 'missing-image'])('refuses %s artifacts and clears the recording placeholder', async kind => {
  const dir = await mkdtemp(join(tmpdir(), 'boai-preview-invalid-'))
  try {
    const { publish } = await publisher()
    vi.stubEnv('OUT_DIR', dir)
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ ...manifest(), sourceSha: kind === 'wrong-sha' ? 'f'.repeat(40) : sha }))
    const request = vi.fn(async (_url: string, init: RequestInit) => new Response(JSON.stringify(init.method === 'PATCH' ? {} : { state: 'open', head: { sha }, body: 'Author text' })))
    vi.stubGlobal('fetch', request)
    await expect(publish()).rejects.toThrow(kind === 'wrong-sha' ? 'source SHA' : 'screenshot')
    const patch = request.mock.calls.find(([, init]) => init.method === 'PATCH')!
    expect(JSON.parse(patch[1].body as string).body).toContain('录制：失败')
    expect(execFileSync).not.toHaveBeenCalled()
  } finally { await rm(dir, { recursive: true, force: true }) }
})

it('replaces an old preview when the current diff no longer contains UI changes', async () => {
  const { detect } = await publisher()
  vi.stubEnv('GITHUB_OUTPUT', '')
  const body = 'Author text\n<!-- boai-ui-preview:begin -->\nold recording\n<!-- boai-ui-preview:end -->\nReview notes'
  const request = vi.fn(async (url: string, init: RequestInit) => new Response(JSON.stringify(url.includes('/files?') ? [] : init.method === 'PATCH' ? {} : { state: 'open', head: { sha }, labels: [], body })))
  vi.stubGlobal('fetch', request)
  await detect()
  const patch = request.mock.calls.find(([, init]) => init.method === 'PATCH')!
  const next = JSON.parse(patch[1].body as string).body
  expect(next).toContain('没有 UI 变更')
  expect(next).not.toContain('old recording')
  expect(next).not.toContain('真实运行')
  expect(next).toContain('Review notes')
})

it.each([false, true])('the recorder exits truthfully with a controlled non-GUI adapter (partial=%s)', async partial => {
  const root = await mkdtemp(join(tmpdir(), 'boai-recorder-protocol-'))
  try {
    const output = join(root, 'out'), adapter = join(root, 'adapter.mjs'), plan = join(root, 'plan.json'), diff = join(root, 'diff.txt')
    await mkdir(output)
    await writeFile(adapter, `import fs from 'node:fs/promises'; import path from 'node:path';
export async function createApp() {
  const page = { waitForLoadState: async()=>{}, waitForFunction: async()=>{}, evaluate: async fn => String(fn).includes('devicePixelRatio') ? 1 : 'fixture outline', screenshot: async ({path:file})=>fs.writeFile(file,'controlled fixture'), video:()=>({path:async()=>path.join(process.env.OUT_DIR,'unused.webm')}) };
  return {page,start:async()=>{},close:async()=>{},dispose:async()=>{},navigate:async where=>{if(${partial} && where==='contacts') throw new Error('controlled navigation failure')}};
}`)
    const scenes = [{ title: 'Chat', start: 'chat', steps: [{ do: 'shot', name: 'chat', caption: 'Chat' }] }]
    if (partial) scenes.push({ title: 'Contacts', start: 'contacts', steps: [{ do: 'shot', name: 'contacts', caption: 'Contacts' }] })
    await writeFile(plan, JSON.stringify({ ui_change: true, scenes }))
    await writeFile(diff, 'controlled recorder protocol fixture')
    const child = spawnSync(process.execPath, ['.github/ui-preview/record.mjs'], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, SRC_DIR: process.cwd(), OUT_DIR: output, PLAN_FILE: plan, DIFF_FILE: diff, BOAI_PREVIEW_ADAPTER: adapter, SOURCE_SHA: sha, SECRETS: '' } })
    const recorded = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
    expect(child.error).toBeUndefined()
    expect(child.status, child.stderr).toBe(partial ? 1 : 0)
    expect(recorded.status).toBe(partial ? 'partial' : 'complete')
    expect(recorded.sourceSha).toBe(sha)
    expect(recorded.scenes[0]).toMatchObject({ plannedSteps: 1, completedSteps: 1, failedSteps: 0, status: 'complete' })
  } finally { await rm(root, { recursive: true, force: true }) }
})
