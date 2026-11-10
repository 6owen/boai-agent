/*
 * [INPUT]: Actual package/candidate configuration and electron-builder's dependency file matcher.
 * [OUTPUT]: Mac ARM/Intel retain their launchers, helpers, checksums and runtime assets while excluding debug/development files and foreign binaries.
 * [POS]: Packaging filter regression; no Electron launch, external model or personal data.
 * [PROTOCOL]: Update Header and tests/.folder.md when this file changes.
 */
import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
// @ts-expect-error Node candidate builder has no declaration file.
import { personalMacConfiguration } from '../scripts/release-build.mjs'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(createRequire(require.resolve('electron-builder')).resolve('app-builder-lib'))
const { getNodeModuleFileMatcher, getMainFileMatchers } = builderRequire('./fileMatcher.js')
const { doMergeConfigs } = builderRequire('./util/config/config.js')

it.each(['arm64', 'x64'])('Mac %s package and candidate filters preserve runnable files and exclude development/foreign payloads', async arch => {
  const root = resolve('.')
  const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const candidate = personalMacConfiguration(metadata, { output: '/fixture/output', version: metadata.version, sha: 'a'.repeat(40) })
  const fileStat = await stat(join(root, 'package.json'))
  const directoryStat = await stat(root)
  const macro = (value: string) => value.replaceAll('${arch}', arch)
  for (const original of [metadata.build, candidate]) {
    // Use the builder's real normalization: mac.files can otherwise add a second,
    // permissive matcher alongside the root fileset and admit the whole checkout.
    const config = doMergeConfigs([structuredClone(original)])
    const filter = getNodeModuleFileMatcher(root, '/fixture/output', macro, config.mac, { config, debugLogger: { isEnabled: false } }).createFilter()
    const accepts = (path: string) => filter(join(root, path), fileStat)
    for (const tool of ['agent-browser', 'agent-desktop']) {
      for (const prefix of ['node_modules/', 'node_modules/parent/node_modules/']) {
        const bin = `${prefix}${tool}/bin/`
        expect(accepts(`${bin}${tool}-darwin-${arch}`)).toBe(true)
        expect(accepts(`${bin}${tool}-darwin-${arch}.sha256`)).toBe(true)
        for (const foreign of ['linux-arm64', 'linux-x64', 'win32-x64.exe', `darwin-${arch === 'arm64' ? 'x64' : 'arm64'}`]) {
          expect(accepts(`${bin}${tool}-${foreign}`), `${bin}${tool}-${foreign}`).toBe(false)
          expect(accepts(`${bin}${tool}-${foreign}.sha256`)).toBe(false)
        }
      }
    }
    for (const name of ['agent-desktop-macos-helper-darwin-' + arch, 'agent-desktop-macos-helper-darwin-' + arch + '.sha256', 'agent-desktop', '../lib/platform.js']) {
      expect(accepts('node_modules/agent-desktop/bin/' + name)).toBe(true)
    }
    expect(accepts(`node_modules/agent-desktop/bin/agent-desktop-macos-helper-darwin-${arch === 'arm64' ? 'x64' : 'arm64'}`)).toBe(false)
    expect(accepts('node_modules/agent-desktop/bin/agent-desktop-linux-clipboard-owner-linux-arm64')).toBe(false)
    for (const path of [
      'node_modules/agent-browser/bin/agent-browser.js', 'node_modules/agent-browser/skills/agent-browser/SKILL.md',
      'node_modules/@mastra/core/dist/index.js', 'node_modules/@libsql/darwin-' + arch + '/index.node',
      'node_modules/sherpa-onnx-darwin-' + arch + '/libonnxruntime.dylib', 'node_modules/playwright-core/lib/coreBundle.js',
      'node_modules/@extend-ai/react-xlsx/dist/duke_sheets_wasm_bg.wasm', 'node_modules/example/LICENSE', 'node_modules/example/NOTICE.md',
    ]) expect(accepts(path), path).toBe(true)
    for (const path of [
      'node_modules/@mastra/core/dist/index.js.map', 'node_modules/example/index.d.ts', 'node_modules/example/index.d.mts', 'node_modules/example/index.d.cts',
      ...['test', 'tests', '__tests__', 'docs', 'examples', 'coverage'].map(name => `node_modules/parent/node_modules/example/${name}/fixture.js`),
    ]) expect(accepts(path), path).toBe(false)
    expect(filter(join(root, 'node_modules/example/docs'), directoryStat)).toBe(false)

    const info = { config, projectDir: root, buildResourcesDir: 'resources', debugLogger: { isEnabled: false } }
    const appFilters = getMainFileMatchers(root, '/fixture/output', macro, config.mac, { info }, '/fixture/output', false).map((matcher: { createFilter: () => (path: string, info: typeof fileStat) => boolean }) => matcher.createFilter())
    const appFilter = (path: string, info: typeof fileStat) => appFilters.some((filter: (path: string, info: typeof fileStat) => boolean) => filter(path, info))
    for (const path of ['dist/main/main.cjs', 'dist/runtime/worker.mjs', 'dist/native/boai-process-guard', 'dist/renderer/assets/font.woff2', 'dist/agent-skills/example/docs/guide.md']) {
      expect(appFilter(join(root, path), fileStat), path).toBe(true)
    }
    for (const path of ['dist/runtime/worker.mjs.map', 'dist/releases/old.dmg', '.local/profile/database.sqlite', 'tests/example.test.ts', 'ai-docs/notes.md', 'apps/electron/src/main.ts', 'AGENTS.md']) {
      expect(appFilter(join(root, path), fileStat), path).toBe(false)
    }
  }
})
