/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: Explicit installed LibreOffice executable and migrated source kernel.
 * [OUTPUT]: Real editable three-slide PPTX, same-revision PNGs, material manifest and source hashes; escaped fixture newlines; no model/quality grade.
 * [POS]: Isolated local kernel probe, not E2E, daily data or an employee tool.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const [renderer] = process.argv.slice(2)
if (!renderer || process.argv.length !== 3) throw new Error('Usage: node scripts/probe-presentation-kernel.mjs /absolute/path/to/soffice')
const output = resolve(`.local/presentation-kernel-${Date.now()}`)
await mkdir(output, { recursive: true })
await cp('packages/runtime/src/modules/presentations/alma', join(output, 'alma'), { recursive: true })
const files = await readdir('packages/runtime/src/modules/presentations', { recursive: true }), hashes = {}
for (const name of files.filter(name => /\.(ts|mjs|mts|json)$/.test(name))) hashes[name] = createHash('sha256').update(await readFile(join('packages/runtime/src/modules/presentations', name))).digest('hex')
await writeFile(join(output, 'source.json'), JSON.stringify({ renderer: resolve(renderer), sourceHashes: hashes, modelRequests: 0 }, null, 2) + '\n')
const code = `
import { PresentationProjects } from './packages/runtime/src/modules/presentations/presentation-project.ts';
import { presentationWorker } from './packages/runtime/src/modules/presentations/worker-client.ts';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const output=${JSON.stringify(output)}, renderer=${JSON.stringify(resolve(renderer))};
const project=new PresentationProjects(join(output,'projects'));let current;
const title=(text)=>({id:'title',type:'text',x:0.8,y:0.5,w:11.5,h:0.8,fontSize:36,text});
try {
 current=await project.create({title:'BOAI Presentation Kernel',theme:{name:'Evidence',headFontFace:'Arial',bodyFontFace:'Arial',background:'FFFFFF',foreground:'172033',accent:'2057B6'},story:{audience:'Project reviewers',purpose:'Verify original editable content',coreMessage:'Native contents survive incremental revisions',narrative:['Purpose','Data','Decision']},design:{visualDirection:'Clear editorial typography',imageDirection:'Native charts only',density:'balanced'}});
 for(const slide of [
 {id:'intro',role:'hero',layoutKey:'type-hero',transition:{type:'fade'},speakerNotes:'Controlled fixture. No claims about real business outcomes.',elements:[{id:'title',type:'text',x:0.8,y:1.4,w:11.5,h:1.4,fontSize:44,text:'Editable slides, durable revisions'},{id:'body',type:'text',x:0.8,y:3.3,w:10.5,h:1.4,fontSize:24,text:'BOAI compiles real PowerPoint objects and preserves earlier revisions.'}]},
 {id:'evidence',role:'data',layoutKey:'chart-evidence',speakerNotes:'Synthetic values: A=7, B=11. Source: fixture only.',elements:[title('Original values remain editable'),{id:'values',type:'chart',x:0.8,y:1.8,w:7,h:4.6,chartType:'bar',categories:['A','B'],series:[{name:'Fixture',values:[7,11]}]},{id:'caption',type:'text',x:8.5,y:2.1,w:3.8,h:2,fontSize:22,text:'Synthetic data\\nA: 7\\nB: 11'}]},
 {id:'closing',role:'summary',layoutKey:'type-closing',elements:[title('Rendering is not visual approval'),{id:'body',type:'text',x:0.8,y:2,w:11.2,h:2.2,fontSize:28,text:'The kernel creates PNGs from the actual PPTX revision. Dedicated visual review and employee tools are still pending.'}]}
 ]) {current=await project.upsert(current.spec.id,current.spec.revision,slide);process.stdout.write('revision '+current.spec.revision+'\\n');}
 const rendered=await project.render(current.spec.id,renderer);
 const material=await presentationWorker('material',{input:{filePath:current.filePath,outputRoot:join(output,'material')}});
 const images=[];for(const file of rendered.images){const bytes=await readFile(file);images.push({path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(join(output,'result.json'),JSON.stringify({spec:current.spec,filePath:current.filePath,fileHash:current.fileHash,validation:current.validation,rendered:{...rendered,images},material,modelRequests:0,quality:'not-reviewed'},null,2)+'\\n');
} catch(error) {await writeFile(join(output,'failure.json'),JSON.stringify({error:String(error),lastRevision:current?.spec.revision,presentationId:current?.spec.id}));throw error;}
`
await build({ stdin: { contents: code, resolveDir: process.cwd() }, outfile: join(output, 'probe.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
process.stdout.write(`Evidence: ${output}\n`)
const child = spawn(process.execPath, [join(output, 'probe.mjs')], { stdio: 'inherit' })
process.exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)))
