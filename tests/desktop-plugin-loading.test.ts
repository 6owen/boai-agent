/*
 * [INPUT]: Isolated plugin settings and an instrumented guide asset.
 * [OUTPUT]: Ordinary tools and disabled reads load zero guide assets; an enabled read loads the actual descriptor once.
 * [POS]: Backend module-loading contract, without a desktop process.
 * [PROTOCOL]: Update this header and tests/.folder.md when this contract changes.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { DESKTOP_PLUGIN_ID } from '@boai/shared/plugins/desktop-tools'
import { PluginSettingsStore } from '../apps/electron/src/main/plugin-settings'
import type { EngineContext } from '../packages/runtime/src/contracts'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { DesktopPluginService } from '../packages/runtime/src/modules/desktop-plugin/service'
import { createBoundSkillOperations } from '../packages/runtime/src/modules/resources/bound-skill-tools'

const guideLoads = vi.hoisted(() => ({ count: 0 }))
vi.mock('@boai/desktop-plugin/skill', async importOriginal => {
  guideLoads.count++
  return importOriginal()
})

it('loads guide bytes only when an enabled employee asks for the plugin skill', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-guide-loading-'))
  const settings = new PluginSettingsStore(join(root, 'application-plugins.json'), () => {})
  const service = new DesktopPluginService(new ProductStore(join(root, 'unused.sqlite')), join(root, 'v2'), action => action())
  const context = {
    signal: new AbortController().signal, agent: { skillIds: [], knowledgeIds: [] },
    conversation: { kind: 'direct' }, resources: [],
  } as unknown as EngineContext
  try {
    await settings.init()
    await settings.update({ id: DESKTOP_PLUGIN_ID, enabled: false, expectedRevision: settings.snapshot().revision })
    expect(createBoundSkillOperations(context)).toEqual([])
    expect(await service.skill(context)).toBeUndefined()
    expect(guideLoads.count).toBe(0)
    await settings.update({ id: DESKTOP_PLUGIN_ID, enabled: true, expectedRevision: settings.snapshot().revision })
    const first = await service.skill(context)
    expect(first?.resourceId).toBe('plugin:boai.desktop.agent-desktop:boai-agent-desktop')
    expect(first?.resourceId).toBe(`plugin:${first?.pluginId}:${first?.name}`)
    expect(await service.skill(context)).toEqual(first)
    expect(guideLoads.count).toBe(1)
  } finally {
    await service.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('keeps the guide asset lazy in the Node ESM bundle used by the runtime worker', async () => {
  const entry = fileURLToPath(new URL('../packages/runtime/src/modules/desktop-plugin/service.ts', import.meta.url))
  const result = await build({ entryPoints: [entry], platform: 'node', target: 'node22', format: 'esm',
    bundle: true, packages: 'external', write: false, metafile: true })
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports)
  expect(imports.filter(item => item.path === '@boai/desktop-plugin/skill').map(item => item.kind)).toEqual(['dynamic-import'])
})
