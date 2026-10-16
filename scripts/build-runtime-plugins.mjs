/*
 * [INPUT]: Shared manifest truth, Runtime API and first-party protocol adapters.
 * [OUTPUT]: Self-contained module and declaration packages plus schema/types; no npm install hooks.
 * [POS]: Independent runtime plugin packaging, also called by the desktop host build.
 * [PROTOCOL]: Update scripts/.folder.md and runtime developer guide on changes.
 */
import { build } from 'esbuild'
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
export async function buildRuntimePlugins() {
 const directory='dist/runtime/plugins'
 await build({entryPoints:['src/runtime/adapters/plugins/runner.ts','src/runtime/adapters/plugins/pi.ts','src/runtime/adapters/plugins/acp.ts','src/shared/plugins/runtime-catalog.ts'],outdir:directory,outbase:'src',entryNames:'[name]',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node22',legalComments:'eof'})
 const {bundledRuntimePlugins,runtimeManifestSchema}=await import(pathToFileURL(resolve(directory,'runtime-catalog.mjs')).href+`?build=${Date.now()}`)
 await copyFile('src/shared/plugins/runtime-api.ts',join(directory,'runtime-api.ts'))
 await copyFile('node_modules/@agentclientprotocol/sdk/LICENSE',join(directory,'ACP-SDK-LICENSE.txt'))
 await copyFile('node_modules/zod/LICENSE',join(directory,'ZOD-LICENSE.txt'))
 const sdk=resolve('dist/runtime-plugin-sdk');await mkdir(sdk,{recursive:true})
 await copyFile('src/shared/plugins/runtime-api.ts',join(sdk,'runtime-api.ts'))
 await writeFile(join(sdk,'manifest.schema.json'),JSON.stringify(z.toJSONSchema(runtimeManifestSchema),null,2))
 for(const manifest of bundledRuntimePlugins){
  const target=resolve('dist/runtime-plugin-packages',manifest.contributions[0].providerId);await mkdir(target,{recursive:true})
  await writeFile(join(target,'manifest.json'),JSON.stringify(manifest,null,2))
  await writeFile(join(target,'LICENSE.txt'),'BOAI first-party runtime adapter. Distributed under the terms of the BOAI application. Third-party dependencies retain their own licenses.\n')
  const driver=manifest.contributions[0].driver
  if(driver.kind==='module')await copyFile(join(directory,driver.entry),join(target,driver.entry))
 }
}
export default buildRuntimePlugins
if(process.argv[1]?.endsWith('build-runtime-plugins.mjs'))await buildRuntimePlugins()
