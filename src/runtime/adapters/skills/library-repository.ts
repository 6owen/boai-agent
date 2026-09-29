/*
 * [INPUT]: 规范化技能来源和库名称；原 boai-app personal-repository 的仓库模板。
 * [OUTPUT]: 兼容原版的 meta.ts、.gitmodules、package.json、CLI、README 与 lock 来源提示。
 * [POS]: Skills ZIP 仓库格式适配；仅生成静态文件，导入/导出均不执行 CLI。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { PortableSkillSource } from './library-format'
import { githubRepository } from './source'

export const REPOSITORY_CLI = `import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { manual, snapshots, submodules, vendors } from '../meta.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(command: string, args: string[], cwd = root): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function runSafe(command: string, args: string[], cwd = root): string | null {
  try {
    return run(command, args, cwd)
  } catch {
    return null
  }
}

function projects() {
  return [
    ...Object.entries(submodules).map(([name, url]) => ({ name, url, path: 'sources/' + name })),
    ...Object.entries(vendors).map(([name, config]) => ({ name, url: config.source, path: 'vendor/' + name })),
  ]
}

function vendorSkillPath(config: { skillsPath?: string }, sourceSkillName: string): string {
  const base = (config.skillsPath || 'skills').replace(/^\\.\\//, '').replace(/\\/$/, '')
  return base === '.' ? sourceSkillName : base + '/' + sourceSkillName
}

async function initRepository() {
  if (!existsSync(join(root, '.git'))) run('git', ['init'])
  mkdirSync(join(root, 'sources'), { recursive: true })
  mkdirSync(join(root, 'vendor'), { recursive: true })
  console.log('仓库初始化完成，未下载任何上游仓库。')
  console.log('需要刷新技能时运行 pnpm run sync。')
}

async function syncSubmodules() {
  await initRepository()
  mkdirSync(join(root, 'skills'), { recursive: true })

  for (const [vendorName, config] of Object.entries(vendors)) {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'boai-skill-sync-'))
    const repositoryDirectory = join(temporaryRoot, 'repository')
    try {
      const sparsePaths = Object.keys(config.skills).map(sourceSkillName => vendorSkillPath(config, sourceSkillName))
      console.log('正在按需获取:', vendorName)
      run('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', config.source, repositoryDirectory])
      run('git', ['sparse-checkout', 'set', '--cone', ...sparsePaths], repositoryDirectory)

      for (const [sourceSkillName, outputSkillName] of Object.entries(config.skills)) {
        const relativeSource = vendorSkillPath(config, sourceSkillName)
        const source = join(repositoryDirectory, relativeSource)
        const output = join(root, 'skills', outputSkillName)
        if (!existsSync(source)) {
          console.warn('上游技能不存在:', vendorName + '/' + relativeSource)
          continue
        }
        rmSync(output, { recursive: true, force: true })
        cpSync(source, output, { recursive: true })
        const sha = runSafe('git', ['rev-parse', 'HEAD'], repositoryDirectory) || 'unknown'
        writeFileSync(join(output, 'SYNC.md'), '# 同步信息\\n\\n- 来源：' + config.source + '/' + relativeSource + '\\n- Git SHA：' + sha + '\\n')
        console.log('已同步:', outputSkillName)
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  }

  console.log('同步完成，临时上游仓库已清理。')
}

async function checkUpdates() {
  for (const project of projects()) {
    const remote = runSafe('git', ['ls-remote', project.url, 'HEAD'])
    const revision = remote?.split(/\\s+/)[0]
    console.log(project.path + ': ' + (revision || '无法读取远端版本'))
  }
}

async function cleanup() {
  const expected = new Set([...manual, ...snapshots])
  for (const config of Object.values(vendors)) {
    for (const outputName of Object.values(config.skills)) expected.add(outputName)
  }
  const skillsDirectory = join(root, 'skills')
  const extra = existsSync(skillsDirectory)
    ? readdirSync(skillsDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory() && !expected.has(entry.name))
    : []
  if (extra.length === 0) {
    console.log('没有需要清理的技能。')
    return
  }
  if (!process.argv.includes('--yes')) {
    console.log('将会删除:', extra.map(entry => entry.name).join(', '))
    console.log('确认后运行 pnpm run cleanup -- --yes')
    return
  }
  for (const entry of extra) rmSync(join(skillsDirectory, entry.name), { recursive: true })
  console.log('清理完成。')
}

async function main() {
  const command = process.argv[2]
  if (command === 'init') return initRepository()
  if (command === 'sync') return syncSubmodules()
  if (command === 'check') return checkUpdates()
  if (command === 'cleanup') return cleanup()
  console.log('用法：pnpm start <init|sync|check|cleanup>')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
`

export function renderRepositoryReadme(libraryName: string): string {
  return `# ${libraryName}

这个技能仓库由 BoAI 导出。所有可以直接安装和离线使用的技能都保存在 \`skills/\` 中。

## 目录结构

- \`skills/\`：完整的技能文件，包括自己编写的技能和从外部仓库安装的技能
- \`sources/\`：用于生成技能的上游源码声明
- \`vendor/\`：本身已经提供技能的上游仓库声明
- \`instructions/\`：可选的技能生成说明
- \`meta.ts\`：上游仓库、技能路径映射、手写技能和快照技能声明
- \`boai.json\`：供 BoAI 识别和重新导入仓库的清单
- \`boai.lock.json\`：BoAI 导出时记录的版本与校验信息

## 初始化

ZIP 中的 \`.gitmodules\` 只用于保留上游来源声明。上游仓库不会在初始化时下载，\`sources/\` 和 \`vendor/\` 默认保持为空。

\`\`\`bash
pnpm install
pnpm run init
\`\`\`

只有在需要从上游刷新技能时，才执行：

\`\`\`bash
pnpm run sync
pnpm run check
\`\`\`

同步时只会在系统临时目录浅层、稀疏地获取 \`meta.ts\` 中指定的技能路径；复制到 \`skills/\` 后会立即删除临时仓库，不会把完整上游仓库留在本地。

## 清理

运行 \`pnpm run cleanup\` 可以预览不再声明的技能目录；确认无误后执行 \`pnpm run cleanup -- --yes\` 删除它们。
`
}


export function renderLibraryRepository(name: string, entries: Record<string, { source: PortableSkillSource }>) {
  const vendors: Record<string, { source: string; skillsPath: string; skills: Record<string, string> }> = Object.create(null)
  const snapshots: string[] = []
  const lockHints: Record<string, { sourceId?: string; revision?: string; snapshot?: boolean }> = Object.create(null)
  for (const [path, { source }] of Object.entries(entries)) {
    const slug = path.slice('skills/'.length)
    if (source.kind !== 'git') {
      snapshots.push(slug); lockHints[slug] = { snapshot: true }
      continue
    }
    const repository = new URL(githubRepository(source.repository))
    const fullName = repository.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')
    const sourceId = fullName.replace('/', '-').slice(0, 160) + '-' + createHash('sha256').update(fullName).digest('hex').slice(0, 8)
    const vendor = vendors[sourceId] ??= { source: `https://github.com/${fullName}.git`, skillsPath: '.', skills: Object.create(null) }
    if (vendor.skills[source.skillPath] && vendor.skills[source.skillPath] !== slug) {
      snapshots.push(slug); lockHints[slug] = { snapshot: true }; continue
    }
    vendor.skills[source.skillPath] = slug
    lockHints[slug] = { sourceId, ...(source.resolvedCommit ? { revision: source.resolvedCommit } : {}) }
  }
  const json = (value: unknown) => JSON.stringify(value, null, 2)
  const files: Record<string, Uint8Array> = {
    'meta.ts': Buffer.from(`export interface VendorSkillMeta { source: string; skillsPath?: string; skills: Record<string, string> }\n\nexport const submodules: Record<string, string> = {}\nexport const vendors: Record<string, VendorSkillMeta> = ${json(vendors)}\nexport const manual: string[] = []\nexport const snapshots: string[] = ${json(snapshots.sort())}\n`),
    '.gitmodules': Buffer.from(Object.entries(vendors).map(([id, vendor]) => `[submodule "vendor/${id}"]\n\tpath = vendor/${id}\n\turl = ${vendor.source}\n`).join('')),
    '.gitignore': Buffer.from('node_modules/\n.DS_Store\n.env*\n*.key\n'),
    'package.json': Buffer.from(json({ type: 'module', private: true, packageManager: 'pnpm@10.32.1', scripts: { start: 'node scripts/cli.ts', init: 'node scripts/cli.ts init', sync: 'node scripts/cli.ts sync', check: 'node scripts/cli.ts check', cleanup: 'node scripts/cli.ts cleanup' } }) + '\n'),
    'scripts/cli.ts': Buffer.from(REPOSITORY_CLI),
    'instructions/': new Uint8Array(),
    'README.md': Buffer.from(renderRepositoryReadme(name) + '\n## BoAI Agent 收藏\n\n`boai-agent.sources.json` 和 `boai-agent.collections.json` 补充保存来源与收藏分组；旧应用可忽略。导入仅恢复包内文件，不执行仓库脚本。无可验证 Git 来源的技能保存在 snapshots 中，不推断为手写技能。\n'),
  }
  for (const id of Object.keys(vendors)) files[`vendor/${id}/`] = new Uint8Array()
  return { files, lockHints }
}
