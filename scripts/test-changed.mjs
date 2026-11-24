/*
 * [INPUT]: Current Git worktree, default origin/main or an explicit base ref, optional --list.
 * [OUTPUT]: Vitest selection or execution against the merge base, including local changes.
 * [POS]: Local development entry point for pnpm test:changed.
 * [PROTOCOL]: Update this header, scripts/.folder.md and the developer skills when changed.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

try {
  const args = process.argv.slice(2)
  const list = args.includes('--list')
  const refs = args.filter(arg => arg !== '--list')
  if (refs.length > 1 || refs[0]?.startsWith('-')) {
    throw new Error('用法：pnpm test:changed [基准引用] [--list]')
  }
  const cwd = fileURLToPath(new URL('..', import.meta.url))
  const ref = refs[0] ?? 'origin/main'
  let base
  try {
    base = execFileSync('git', ['merge-base', 'HEAD', ref], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    throw new Error(`找不到 HEAD 与 ${ref} 的共同提交，请先拉取目标分支或传入有效的基准引用。`)
  }
  console.log(`Vitest 变更范围：${ref} 的共同基准 ${base}，包含工作区改动。`)
  const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
  const command = list ? ['list', '--filesOnly'] : ['run']
  const result = spawnSync(process.execPath, [vitest, ...command, '--changed', base], {
    cwd, stdio: 'inherit', env: { ...process.env, BOAI_VITEST_CHANGED: '1' },
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
