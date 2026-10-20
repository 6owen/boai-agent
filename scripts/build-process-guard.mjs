/*
 * [INPUT]: Directly migrated Rovai macOS/Linux process identity modules and Cargo.lock.
 * [OUTPUT]: Host-native process guard and PTY transport in dist/native; source hash avoids rebuilding unchanged inputs.
 * [POS]: Shared build/dev/Vitest setup; no native Agent or model invocation.
 * [PROTOCOL]: Update scripts/.folder.md and process-guard/.folder.md.
 */
import { readFile, mkdir, copyFile, writeFile, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
export default async function buildProcessGuard(){
 if(!['darwin','linux'].includes(process.platform))return
 const source=join(root,'src/runtime/adapters/process-guard'),output=join(root,'dist/native'),target=join(root,'.local/native-process-guard-target')
 const hash=async()=>{const h=createHash('sha256');h.update(process.platform+process.arch);for(const file of ['Cargo.toml','Cargo.lock','main.rs','managed_process.rs','terminal.rs','macos.rs','linux.rs'])h.update(await readFile(join(source,file)));return h.digest('hex')}
 const stamp=await hash()
 try{await access(join(output,'boai-process-guard'));if((await readFile(join(output,'source.sha256'),'utf8')).trim()===stamp)return}catch{}
 await mkdir(output,{recursive:true})
 await new Promise((done,reject)=>{const child=spawn('cargo',['build','--release','--manifest-path',join(source,'Cargo.toml'),'--target-dir',target],{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?done():reject(Error('Native process guard build failed: '+code)))})
 await copyFile(join(target,'release/boai-process-guard'),join(output,'boai-process-guard'))
 await copyFile(join(source,'LICENSE'),join(output,'LICENSE'))
 await writeFile(join(output,'source.sha256'),await hash())
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildProcessGuard()
