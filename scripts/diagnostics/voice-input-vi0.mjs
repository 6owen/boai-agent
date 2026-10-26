/*
 * [INPUT]: Explicit isolated directory with sherpa-onnx-node 2.0.0 and the pinned SenseVoice model.
 * [OUTPUT]: Synthetic speech content/silence and unchanged exit/RSS/heartbeat gates through Electron utilityProcess.
 * [POS]: Manual VI0 feasibility probe, no microphone, cloud model, product entry or package installation.
 * [PROTOCOL]: Update scripts/diagnostics/.folder.md and 19/12 progress on changes.
 */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { passesVoiceProbe } from './voice-input-result.mjs'

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This first probe is macOS arm64 only')
if (!process.argv[2]) throw new Error('Usage: node scripts/diagnostics/voice-input-vi0.mjs <isolated-probe-directory>')
const source = resolve(process.argv[2]), root = join(source, 'probe 空格'), require = createRequire(import.meta.url)
const limits = { coldMs: { 10: 5000, 30: 8000, 120: 20000 }, rssBytes: 1536 * 1024 * 1024, heartbeatMs: 200, wallMs: 30000 }
await mkdir(root, { recursive: true })
await writeFile(join(root, 'limits-before-run.json'), JSON.stringify(limits, null, 2))
const expected = { 'model.int8.onnx': [239233841, 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51'], 'tokens.txt': [315894, 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc'] }
for (const [name, [bytes, digest]] of Object.entries(expected)) {
  const value = await readFile(join(source, 'models', name))
  if (value.length !== bytes || createHash('sha256').update(value).digest('hex') !== digest) throw new Error(`Unverified model file: ${name}`)
}
if (JSON.parse(await readFile(join(source, 'node_modules/sherpa-onnx-node/package.json'), 'utf8')).version !== '2.0.0') throw new Error('Unverified engine version')
await cp(join(source, 'node_modules'), join(root, 'app.asar.unpacked/node_modules'), { recursive: true })
await cp(join(source, 'models'), join(root, 'app.asar.unpacked/models'), { recursive: true })
await cp(fileURLToPath(new URL('./voice-input-helper.cjs', import.meta.url)), join(root, 'app.asar.unpacked/helper.cjs'))
execFileSync('/usr/bin/say', ['-v', 'Tingting', '--file-format=WAVE', '--data-format=LEI16@16000', '--channels=1', '-o', join(root, 'speech.wav'), '请帮我检查这份报告。预算是一千二百三十四元，明天下午三点之前完成。'])
const original = await readFile(join(root, 'speech.wav'))
let offset = 12, samples
while (offset + 8 <= original.length) {
  const length = original.readUInt32LE(offset + 4)
  if (original.toString('ascii', offset, offset + 4) === 'data') { samples = original.subarray(offset + 8, offset + 8 + length); break }
  offset += 8 + length + length % 2
}
if (!samples?.length) throw new Error('No synthetic PCM fixture')
function wav(pcm) {
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
const cases = []
for (const seconds of [10, 30, 120]) {
  const pcm = Buffer.alloc(seconds * 32000)
  for (let index = 0; index < pcm.length; index += samples.length) samples.copy(pcm, index)
  const path = join(root, `${seconds}.wav`); await writeFile(path, wav(pcm)); cases.push({ seconds, path, silence: false })
}
const silence = join(root, 'silence.wav'); await writeFile(silence, wav(Buffer.alloc(320000))); cases.push({ seconds: 10, path: silence, silence: true })
const main = join(root, 'probe.cjs'), resultPath = join(root, `result-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
await writeFile(main, `const {app,utilityProcess}=require('electron');const fs=require('node:fs');const root=${JSON.stringify(root)},cases=${JSON.stringify(cases)},limits=${JSON.stringify(limits)};app.whenReady().then(async()=>{const results=[];for(const sample of cases){const ticks=[];let last=performance.now(),result;const timer=setInterval(()=>{const now=performance.now();ticks.push(now-last);last=now},10);const started=performance.now();const child=utilityProcess.fork(root+'/app.asar.unpacked/helper.cjs',[root+'/app.asar.unpacked',sample.path],{stdio:'pipe',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},serviceName:'BOAI Voice VI0'});const timeout=setTimeout(()=>child.kill(),limits.wallMs);child.on('message',value=>{result=value});const exitCode=await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timeout);clearInterval(timer);ticks.sort((a,b)=>a-b);results.push({...sample,...result,exitCode,wallMs:performance.now()-started,heartbeatP95Ms:ticks[Math.floor(ticks.length*.95)]??0,heartbeatMaxMs:ticks.at(-1)??0});}fs.writeFileSync(${JSON.stringify(resultPath)},JSON.stringify({limits,results,synthetic:true,actualMicrophone:false,asarUnpackedLayoutOnly:true,electron:process.versions.electron,node:process.versions.node},null,2));app.quit()}).catch(error=>{console.error(error);app.exit(1)});`)
const electron = require('electron')
const exitCode = await new Promise((done, reject) => { const child = spawn(electron, [main], { stdio: ['ignore', 'ignore', 'pipe'], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|USER|SHELL|LANG|LC_.*|TMPDIR)$/i.test(key))) }); child.stderr.on('data', bytes => process.stderr.write(bytes)); child.once('error', reject); child.once('exit', done) })
if (exitCode !== 0) throw new Error(`Electron probe exited ${exitCode}`)
const report = JSON.parse(await readFile(resultPath, 'utf8'))
report.passed = passesVoiceProbe(report.results, limits)
await writeFile(resultPath, JSON.stringify(report, null, 2))
process.stdout.write(`${JSON.stringify({ resultPath, passed: report.passed, results: report.results.map(({ path, ...value }) => value) })}\n`)
if (!report.passed) process.exitCode = 1
