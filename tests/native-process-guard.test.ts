/*
 * [INPUT]: Production native supervisor, directly migrated Rovai ownership ledger and isolated real OS children.
 * [OUTPUT]: Detached-child cancellation, parent loss, stale-owner recovery and unrelated-process isolation.
 * [POS]: Actual subprocess regression; no Agent fixture or model response substitutes for process exit.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeProcessGuard, recoverNativeProcesses } from '../src/runtime/adapters/native-process-guard'
import { NATIVE_PROCESS_SUPERVISOR } from '../src/runtime/adapters/native-process-supervisor'
const cleanups: (()=>Promise<void>)[]=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup()})
const alive=(pid:number)=>{try{process.kill(pid,0);return true}catch{return false}}
describe.skipIf(process.platform!=='darwin')('Rovai native process ownership',()=>{
 async function setup(supervisor=false){
  const root=await mkdtemp(join(tmpdir(),'boai-native-owner-')),session=join(root,'agents','employee','workspace','sessions','chat'),ledger=join(session,'.codex-private','owned-processes'),pidFile=join(root,'child.pid')
  let guard:ChildProcess,stderr='',pid=0
  cleanups.push(async()=>{if(guard.exitCode===null&&guard.signalCode===null)guard.kill('SIGTERM');await recoverNativeProcesses(root,'codex');if(pid&&alive(pid))try{process.kill(pid,'SIGKILL')}catch{};await rm(root,{recursive:true,force:true})})
  const program=`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid));setInterval(()=>{},1000)`
  guard=supervisor?spawn(process.execPath,['-e',NATIVE_PROCESS_SUPERVISOR],{detached:true,stdio:['pipe','pipe','pipe','ipc']}):spawn(nativeProcessGuard(),['--ledger',ledger,process.execPath,'-e',program],{stdio:['pipe','pipe','pipe']})
  guard.stderr?.on('data',chunk=>{stderr+=chunk.toString()})
  // A deliberately SIGKILLed guard leaves children holding stdout; recovery must
  // wait for the owner PID, not for all inherited pipes to close before cleanup.
  const exited=new Promise<void>(resolve=>guard.once('exit',()=>resolve()))
  if(supervisor)guard.send!({command:process.execPath,args:['-e',program],node:true,stdin:'',interactive:true,guard:nativeProcessGuard(),ledger})
  await expect.poll(async()=>{try{pid=Number(await readFile(pidFile,'utf8'));const files=(await readdir(ledger)).filter(file=>file.endsWith('.json'));return (await Promise.all(files.map(file=>readFile(join(ledger,file),'utf8')))).some(text=>Object.values(JSON.parse(text).processes).some((row:any)=>row.pid===pid))}catch{return false}},{timeout:10000,message:stderr}).toBe(true)
  return {root,ledger,pid,guard,exited,get stderr(){return stderr}}
 }
 it('does not finish cancellation until a detached native descendant has exited',async()=>{
  const f=await setup();expect(alive(f.pid)).toBe(true);f.guard.kill('SIGTERM');await f.exited
  await expect.poll(()=>alive(f.pid),{timeout:3000,message:f.stderr}).toBe(false)
  expect((await readdir(f.ledger)).filter(file=>file.endsWith('.json'))).toEqual([])
 })
 it('cleans the native tree when the IPC owner disappears',async()=>{
  const f=await setup(true);f.guard.disconnect();await f.exited
  await expect.poll(()=>alive(f.pid),{timeout:3000,message:f.stderr}).toBe(false)
 })
 it('recovers a killed owner without killing a separate active execution or replaying work',async()=>{
  const abandoned=await setup(),active=await setup();abandoned.guard.kill('SIGKILL');await abandoned.exited
  expect(alive(abandoned.pid)).toBe(true)
  await recoverNativeProcesses(active.root,'codex');expect(alive(active.pid)).toBe(true)
  await recoverNativeProcesses(abandoned.root,'codex');await expect.poll(()=>alive(abandoned.pid),{timeout:3000}).toBe(false)
  expect(alive(active.pid)).toBe(true);expect((await readdir(abandoned.ledger)).filter(file=>file.endsWith('.json'))).toEqual([])
  await recoverNativeProcesses(abandoned.root,'codex');active.guard.kill('SIGTERM');await active.exited
 })
})
