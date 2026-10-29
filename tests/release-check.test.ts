/*
 * [INPUT]: Clean source identities and GitHub Test attempts for main/PR/failure races.
 * [OUTPUT]: Only the latest successful main push of the exact source can qualify publication.
 * [POS]: Read-only release gate regressions; no GitHub writes or app installation.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Node CLI has no declaration file.
import { verifyReleaseIdentity, checkRelease } from '../scripts/release-check.mjs'
const sha = 'a'.repeat(40), metadata = { version: '0.2.4', build: { buildVersion: '0.2.4', appId: 'com.boai.agent', productName: 'BoAI Agent' } }
const run = { id: 7, run_number: 3, run_attempt: 1, repository: { full_name: '6owen/boai-agent' }, head_branch: 'main', head_sha: sha, event: 'push', path: '.github/workflows/test.yml', status: 'completed', conclusion: 'success' }
const proof = { version: '0.2.4', sha, current: { sha, dirty: false }, metadata, mainSha: sha, run }
it('qualifies the exact successful main Test, independently of retired local CI', () => expect(verifyReleaseIdentity(proof)).toMatchObject({ tag: 'v0.2.4', sha, validation: { source: 'github-actions', runId: 7, attempt: 1 } }))
it.each([
  { version: 'v0.2.4' }, { version: '01.2.4' }, { version: '0.2.4-beta.1' }, { sha: 'short' }, { mainSha: 'b'.repeat(40) },
  { current: { sha, dirty: true } }, { metadata: { ...metadata, version: '0.2.3' } },
  { metadata: { ...metadata, build: { ...metadata.build, buildVersion: '0.2.3' } } },
])('rejects source/version mismatch: %j', patch => expect(() => verifyReleaseIdentity({ ...proof, ...patch })).toThrow())
it.each([
  { head_branch: 'feature' }, { head_sha: 'b'.repeat(40) }, { event: 'pull_request' }, { event: 'workflow_dispatch' }, { path: '.github/workflows/ui-preview.yml' },
  { repository: { full_name: 'fork/boai-agent' } }, { status: 'in_progress', conclusion: null }, { conclusion: 'failure' }, { conclusion: 'cancelled' }, { id: 0 }, { run_attempt: 0 },
])('rejects unrelated or unsuccessful Test: %j', patch => expect(() => verifyReleaseIdentity({ ...proof, run: { ...run, ...patch } })).toThrow('最新Test'))
it.each(['success', 'pending', 'retry', 'source-change'])('rechecks latest remote attempt and source without selecting an old green: %s', async mode => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-release-check-'))
  await writeFile(join(directory, 'package.json'), JSON.stringify(metadata))
  let reads = 0
  const api = (path: string) => {
    if (path === 'git/ref/heads/main') { reads++; return { object: { sha } } }
    if (path.startsWith('actions/workflows/')) return { workflow_runs: [{ ...run, id: 1, run_number: 1 }, run] }
    if (path === 'actions/runs/7') return { ...run, ...(mode === 'pending' ? { status: 'in_progress', conclusion: null } : mode === 'retry' && reads === 2 ? { run_attempt: 2 } : {}) }
    throw Error(`Unexpected request: ${path}`)
  }
  const git = (...args: string[]) => args[0] === 'rev-parse' ? sha : mode === 'source-change' && reads > 1 ? ' M package.json' : ''
  try {
    const result = checkRelease('0.2.4', sha, { directory, api, git })
    if (mode === 'success') await expect(result).resolves.toMatchObject({ validation: { runId: 7, attempt: 1 } })
    else await expect(result).rejects.toThrow()
  } finally { await rm(directory, { recursive: true, force: true }) }
})
