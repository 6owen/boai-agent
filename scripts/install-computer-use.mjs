/*
 * [INPUT]: Pinned MIT computer-use-mcp source and explicit BOAI integration request.
 * [OUTPUT]: Stable local executable and original BOAI MCP source receipt; no OS permission prompts or desktop actions.
 * [POS]: Optional macOS capability installer; independent from skill text and application startup.
 * [PROTOCOL]: Update Header and scripts/.folder.md on change.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, copyFile, chmod, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
const revision = '82dd8093e44819c51537f489059e172777d7f1d7'
const repository = 'https://github.com/minghinmatthewlam/computer-use-mcp.git'
if (process.platform !== 'darwin') throw new Error('computer-use-mcp requires macOS')
const root = resolve('resources/capabilities/computer-use'), checkout = resolve(process.argv[2] ?? '.local/alma-computer-use-src')
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
if (run('git', ['rev-parse', 'HEAD'], checkout).trim() !== revision || run('git', ['status', '--porcelain'], checkout).trim()) throw new Error('Use the unchanged pinned source checkout; no unreviewed replacement is installed')
run('swift', ['build', '-c', 'release', '--product', 'computer-use-mcp'], checkout)
const destination = join(homedir(), 'Library/Application Support/BoAI Agent/tools/computer-use', revision)
await mkdir(destination, { recursive: true }); await mkdir(root, { recursive: true })
const executable = join(destination, 'computer-use-mcp'), bytes = await readFile(join(checkout, '.build/release/computer-use-mcp'))
await copyFile(join(checkout, '.build/release/computer-use-mcp'), executable); await chmod(executable, 0o755)
await copyFile(join(checkout, 'LICENSE'), join(destination, 'LICENSE'))
await copyFile(join(checkout, 'LICENSE'), join(root, 'LICENSE.txt'))
const invoke = args => JSON.parse(run(process.execPath, ['dist/cli/index.mjs', ...args, '--json']))
const call = (operation, input, requestId) => {
  const result = invoke(['app', 'call', operation, JSON.stringify(input), ...(requestId ? ['--request-id', requestId] : [])])
  if (result.status !== 'succeeded') throw new Error('Inspect original application receipt; no automatic replay: ' + JSON.stringify(result))
  return result
}
const config = { type: 'mcp', name: 'BOAI Computer Use', description: '本机 macOS 应用操作：AX 状态、后台输入和截图。实际可用性以 health_report 的系统授权和动作回执为准。', guide: 'Use the bound boai-computer-use skill. Inspect health_report without permission prompts before actions. Prefer background AX actions; no global/foreground fallback unless explicitly requested. Connection test only discovers tools.', enabled: true, mcp: { transport: 'stdio', command: executable, args: ['serve'] } }
const sources = call('sources.list', {}).data
const matches = sources.filter(source => source.name === config.name)
if (matches.length > 1) throw new Error('Ambiguous existing computer-use connection')
let source
if (matches.length) {
  if (JSON.stringify(matches[0].mcp) !== JSON.stringify(config.mcp)) throw new Error('Existing custom connection preserved; inspect it before changing')
  source = matches[0]
} else source = call('sources.create', { config }, `alma-computer-use-${revision}`).data
const tested = call('sources.test', { id: source.id, expectedRevision: source.revision }, `alma-computer-use-discovery-${source.id}-${source.revision}`)
const evidence = { repository, revision, binarySha256: createHash('sha256').update(bytes).digest('hex'), executable, sourceId: source.id, test: tested.data.test, permissionStatus: 'not inferred from tools/list; use health_report', installedAt: new Date().toISOString() }
await writeFile(join(destination, 'installation.json'), JSON.stringify(evidence, null, 2) + '\n')
await writeFile(join(root, 'source-manifest.json'), JSON.stringify({ repository, revision, license: 'MIT', integration: 'Existing BOAI stdio MCP source transport; optional local installer', skills: ['boai-computer-use'], install: 'node scripts/install-computer-use.mjs /absolute/path/to/pinned-checkout' }, null, 2) + '\n')
process.stdout.write(JSON.stringify(evidence, null, 2) + '\n')
