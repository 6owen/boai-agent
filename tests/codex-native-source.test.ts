/*
 * [INPUT]: Isolated configuration and the production Codex conversation with a controlled thread-start boundary.
 * [OUTPUT]: Expected first-use trust remains usable; concurrent source/permission changes cannot submit a user turn.
 * [POS]: Native first-use source regression, complementary to the opt-in installed-Codex loop.
 * [PROTOCOL]: Update Header and tests/.folder.md with source-fence coverage.
 */
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test, vi } from 'vitest'
import type { EngineContext } from '../packages/runtime/src/contracts'
import { CodexClient } from '../packages/runtime/src/adapters/codex/client'
import { runCodexConversation } from '../packages/runtime/src/adapters/codex/conversation'
import { codexNativeSourceIdentity } from '../packages/runtime/src/adapters/codex/native-source'
import { codexProjectTrustTarget } from '../packages/runtime/src/adapters/codex/project-trust'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-codex-first-'))); roots.push(root)
  const config = join(root, 'config'), cwd = join(root, 'project', 'work'), project = join(root, 'project')
  await mkdir(config); await mkdir(cwd, { recursive: true }); await mkdir(join(project, '.git')); await writeFile(join(project, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  vi.stubEnv('HOME', root); vi.stubEnv('CODEX_HOME', config)
  const path = join(config, 'config.toml'), original = 'model="original"\n[model_providers.native]\nbase_url="http://127.0.0.1:1234/v1"\n'
  await writeFile(path, original)
  const context = { agent: { modelId: '', nativeOptions: { codexSandbox: 'workspace-write' } }, runtimeProfile: { useExistingLogin: true, verified: { name: 'Codex', version: '0.162.1' } }, runtimeDirectory: { cwd, privateHome: join(root, 'private') }, signal: new AbortController().signal, onDelta: async () => {} } as unknown as EngineContext
  const trust = `\n[projects.${JSON.stringify(project)}]\ntrust_level="trusted"\n`
  const calls: string[] = [], fingerprints: (string | undefined)[] = []
  const run = async (change: () => Promise<void>, options: { resume?: boolean; sandbox?: string; afterSession?: () => Promise<void> } = {}) => {
    context.nativeSourceFingerprint = await codexNativeSourceIdentity(context)
    vi.spyOn(CodexClient, 'start').mockImplementation(async input => {
      const client = {
        request: async (method: string) => { calls.push(method); if (method.startsWith('thread/')) { await change(); return { thread: { id: 'thread-1' }, sandbox: { type: options.sandbox ?? 'workspaceWrite' } } }; return { turn: { id: 'turn-1' } } },
        wait: async (done: Promise<void>) => { await input.onNotification?.('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } }); await done },
        drain: async () => {}, close: async () => {},
      }
      return { client } as unknown as Awaited<ReturnType<typeof CodexClient.start>>
    })
    await runCodexConversation(context, { instructions: '', prompt: 'first user message', images: [], tools: [], ...(options.resume ? { threadId: 'thread-1' } : {}), onSession: async (_, fingerprint) => { fingerprints.push(fingerprint); await options.afterSession?.() }, onSubmitted: async () => {} })
  }
  return { root, config, cwd, project, path, original, trust, context, calls, fingerprints, run }
}

test.each(['existing config', 'absent config'])('accepts only the implied trust insertion with %s and records the exact new source', async mode => {
  const f = await fixture()
  if (mode === 'absent config') await rm(f.path)
  await f.run(() => writeFile(f.path, (mode === 'absent config' ? '' : f.original) + f.trust))
  expect(f.calls).toEqual(['thread/start', 'turn/start'])
  expect(f.fingerprints).toEqual([await codexNativeSourceIdentity(f.context)])
})
test.each(['model', 'provider URL', 'environment', 'project config', 'unrelated trust', 'MCP', 'untrusted decision', 'read-only permission', 'resumed thread', 'after session'])('rejects %s drift before sending user input', async kind => {
  const f = await fixture()
  if (kind === 'untrusted decision') await writeFile(f.path, f.original + f.trust.replace('trusted', 'untrusted'))
  const change = async () => {
    let text = f.original + f.trust
    if (kind === 'model') text = text.replace('"original"', '"changed"')
    if (kind === 'provider URL') text = text.replace(':1234', ':9999')
    if (kind === 'unrelated trust') text += '\n[projects."/unrelated"]\ntrust_level="trusted"\n'
    if (kind === 'MCP') text += '\n[mcp_servers.extra]\ncommand="unexpected"\n'
    if (kind === 'environment') vi.stubEnv('BOAI_SYNTHETIC_SOURCE_TEST', 'changed')
    if (kind === 'project config') { await mkdir(join(f.project, '.codex')); await writeFile(join(f.project, '.codex/config.toml'), 'model="changed"') }
    await writeFile(f.path, text)
  }
  await expect(f.run(change, { resume: kind === 'resumed thread', sandbox: kind === 'read-only permission' ? 'readOnly' : undefined,
    afterSession: kind === 'after session' ? () => writeFile(f.path, f.original.replace('"original"', '"changed"') + f.trust) : undefined,
  })).rejects.toThrow(/原生配置/)
  expect(f.calls).not.toContain('turn/start')
})
test('unchanged source with a resumed thread remains byte-exact', async () => {
  const f = await fixture(); await f.run(async () => {}, { resume: true })
  expect(f.calls).toEqual(['thread/resume', 'turn/start']); expect(await readFile(f.path, 'utf8')).toBe(f.original)
})
test('resolves only validated main-checkout trust for a linked worktree', async () => {
  const f = await fixture(), linked = join(f.root, 'linked'), metadata = join(f.project, '.git/worktrees/linked')
  await mkdir(join(linked, 'sub'), { recursive: true }); await mkdir(metadata, { recursive: true })
  await writeFile(join(linked, '.git'), `gitdir: ${metadata}\n`)
  await writeFile(join(metadata, 'gitdir'), join(linked, '.git')); await writeFile(join(metadata, 'commondir'), '../..')
  expect(await codexProjectTrustTarget(join(linked, 'sub'))).toBe(f.project)
  await writeFile(join(metadata, 'gitdir'), join(f.root, 'other/.git'))
  expect(await codexProjectTrustTarget(join(linked, 'sub'))).toBe(join(linked, 'sub'))
})
