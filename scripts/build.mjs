import { copyFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { build as buildRenderer } from 'vite'

export async function buildHost() {
  await Promise.all([
    build({ entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', '@libsql/client'], sourcemap: true }),
    build({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] }),
    build({ entryPoints: ['src/runtime/worker.ts'], outfile: 'dist/runtime/worker.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: true }),
  ])
}
if (process.argv[1]?.endsWith('build.mjs')) {
  await buildHost()
  await buildRenderer()
  await copyFile('src/shared/appearance/BASE46-LICENSE.txt', 'dist/renderer/BASE46-LICENSE.txt')
}
