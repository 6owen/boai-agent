/*
 * [OUTPUT]: 默认系统分发单列验收；先核对真实默认包路径，再不指定应用启动/热投递，保留旧副本。
 * [INPUT]: Explicit macOS package, isolated Desktop data root and a public test import URL.
 * [OUTPUT]: LaunchServices cold launch with Playwright debug output forwarding and owned-process cleanup.
 * [POS]: BDD launch transport only; does not emit product events or change application code.
 * [PROTOCOL]: Update Header and support/.folder.md when changing launch or cleanup semantics.
 */
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

export async function osUrlLauncher(root: string, executable: string, url: string, useDefaultHandler = false) {
  if (process.platform !== 'darwin' || !url.startsWith('boai://provider/import?')) throw new Error('系统链接验收需要明确的macOS应用包与导入URL')
  const binary = resolve(executable), bundle = dirname(dirname(dirname(binary)))
  if (!bundle.endsWith('.app') || !binary.startsWith(`${bundle}/Contents/MacOS/`)) throw new Error('需要实际应用包可执行入口')
  const { stdout } = await promisify(execFile)('/bin/ps', ['-ax', '-o', 'pid=,command='])
  if (stdout.split('\n').some(line => line.trim().replace(/^\d+\s+/, '').startsWith(binary))) throw new Error('待测应用包仍在运行，不能登记为系统冷启动')
  if (useDefaultHandler) {
    const selected = await promisify(execFile)('/usr/bin/osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("AppKit"); var url = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString("boai://provider/import")); console.log(ObjC.unwrap(url.path) || "none")'])
    if (selected.stderr.trim() !== bundle) throw new Error('系统默认协议处理器未指向待测包，拒绝误启动其他副本')
  }
  const marker = `--boai-bdd-launch-id=${randomUUID()}`, launcher = join(root, 'launch-os-url.cjs')
  const stderr = join(root, 'launch-os-url.stderr.log'), stdoutPath = join(root, 'launch-os-url.stdout.log')
  // Data is serialized into JavaScript, never interpolated into a shell command.
  await writeFile(launcher, `#!${process.execPath}
const {spawn,execFileSync}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const config=${JSON.stringify({ binary, bundle, marker, url, stderr, stdoutPath, root, useDefaultHandler })};
writeFileSync(config.stderr,'');writeFileSync(config.stdoutPath,'');
let position=0,closing=false;
const forward=()=>{try{const data=readFileSync(config.stderr);if(data.length>position){process.stderr.write(data.subarray(position));position=data.length;}}catch{}};
const owned=()=>execFileSync('/bin/ps',['-ax','-o','pid=,command='],{encoding:'utf8'}).split('\\n').flatMap(line=>{const match=line.trim().match(/^(\\d+)\\s+(.+)$/);return match&&match[2].startsWith(config.binary)&&match[2].includes(config.marker)?[Number(match[1])]:[]});
const stop=()=>{if(closing)return;closing=true;clearInterval(timer);forward();for(const pid of owned()){try{process.kill(pid,'SIGTERM');}catch{}};process.exit(1);};
const args=['-W','-n',...(config.useDefaultHandler?[]:['-a',config.bundle]),'-u',config.url,'--stdout',config.stdoutPath,'--stderr',config.stderr,'--env','BOAI_DATA_DIR='+config.root,'--env','NODE_ENV=test','--env','PATH='+process.env.PATH,'--args',...process.argv.slice(2),config.marker];
const child=spawn('/usr/bin/open',args,{stdio:['ignore','ignore','pipe']});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
const timer=setInterval(forward,25);
child.once('error',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
child.once('exit',code=>{clearInterval(timer);forward();if(owned().length){stop();return;}process.exit(code??1);});
`, { mode: 0o700 })
  return { launcher, binary, bundle, marker, stderr, stdout: stdoutPath, transport: useDefaultHandler ? 'LaunchServices open -W -n -u URL (system default)' : 'LaunchServices open -W -n -a bundle -u URL', appWasRunning: false }
}
