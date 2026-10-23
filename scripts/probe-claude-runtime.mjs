/*
 * [INPUT]: 显式--real、原BoAI数据目录/连接ID、本机Claude路径和新输出目录。
 * [OUTPUT]: 独立Electron实际Claude+DeepSeek无工具、--tools私有读写或--employee共同阶段，冻结本地源码；不读取个人登录或记录密钥。
 * [POS]: 第13组Claude底层真实探测；不替代员工UI、Work和Claude模型验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { build } from 'esbuild'
import electronPath from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
if(!process.argv.includes('--real') || !process.env.BOAI_TEST_API_DATA_DIR || !process.env.BOAI_TEST_API_CONNECTION_ID || !process.env.BOAI_CLAUDE_PROGRAM || !process.env.BOAI_CLAUDE_REAL_OUTPUT)throw new Error('需要显式真实开关、已保存连接、本机程序和新输出目录')
const out=resolve(process.env.BOAI_CLAUDE_REAL_OUTPUT)
await mkdir(out)
const root=await mkdtemp(join(tmpdir(),'boai-claude-real-')),entry=join(out,'host.cjs')
const built=await build({entryPoints:['tests/fixtures/claude-real.ts'],outfile:entry,bundle:true,packages:'external',platform:'node',format:'cjs',target:'node22',logLevel:'silent',metafile:true})
const sources=[...Object.keys(built.metafile.inputs),'scripts/probe-claude-runtime.mjs','package.json','pnpm-lock.yaml']
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])))
await writeFile(join(out,'source.json'),JSON.stringify({createdAt:new Date().toISOString(),sourceHashes,bundleHash:createHash('sha256').update(await readFile(entry)).digest('hex')},null,2)+'\n')
const env={};for(const key of ['PATH','HOME','USERPROFILE','LANG','LC_ALL','TMPDIR','TMP','TEMP'])if(process.env[key])env[key]=process.env[key]
let code
try {
  code=await new Promise((done,reject)=>{
    const child=spawn(electronPath,[entry,root,resolve(process.env.BOAI_TEST_API_DATA_DIR),process.env.BOAI_TEST_API_CONNECTION_ID,process.env.BOAI_CLAUDE_PROGRAM,join(out,'result.json'),process.argv.includes('--employee')?'employee':process.argv.includes('--tools')?'tools':'no-tools'],{env,stdio:'ignore'})
    // The adapter owns cancellation and waits for its detached descendants. Do not
    // kill just the Electron parent and erase files while a model process survives.
    child.once('error',()=>reject(new Error('无法启动独立真实验证进程')))
    child.once('close',value=>done(value))
  })
  const evidence=JSON.parse(await readFile(join(out,'result.json'),'utf8'))
  for(const [path,expected] of Object.entries(sourceHashes))if(createHash('sha256').update(await readFile(path)).digest('hex')!==expected)throw new Error('验证期间源码变化，不能确认本批版本')
  console.log(JSON.stringify({passed:evidence.passed,steps:evidence.steps.map(step=>({kind:step.kind,usage:step.usage})),error:evidence.error,evidence:join(out,'result.json')}))
  process.exitCode=code===0&&evidence.passed?0:1
} finally {if(typeof code==='number')await rm(root,{recursive:true,force:true})}
