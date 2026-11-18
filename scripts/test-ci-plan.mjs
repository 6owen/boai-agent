/*
 * [INPUT]: Exact PR checkout, base commit, changed paths and explicit full-test requests.
 * [OUTPUT]: Documentation/checks/full scope; ordinary PRs only typecheck and lint, full regression is explicit.
 * [POS]: Current Test planner; no automatic main push run or UI/Vitest selection.
 * [PROTOCOL]: Update scripts/.folder.md, tests/test-ci-plan.test.ts and boai-dev-workflow when changed.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { developmentMarkdown } from './ci-scope.mjs'

const shaPattern = /^[a-f0-9]{40}$/
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trimEnd()
const planPath = root => resolve(root, '.local/test-ci/plan.json')
const documentationPath = path => developmentMarkdown(path) || ['UI_TEST_CI.md', 'DESIGN.md'].includes(path) || /^ai-docs\/.+\.(?:svg|png|webp|tldraw)$/.test(path)
export function testMode(paths, { eventName = 'pull_request' } = {}) {
  if (eventName === 'workflow_dispatch') return 'full'
  if (eventName !== 'pull_request') throw Error('Test only supports PR checks or explicit full runs')
  return paths.length && paths.every(documentationPath) ? 'documentation' : 'checks'
}

export function preparePlan(root, eventName, event, sha) {
  if (!shaPattern.test(sha ?? '') || git(root, ['rev-parse', 'HEAD']) !== sha) throw Error('Test checkout does not match the event SHA')
  let base = null, paths = []
  if (eventName === 'pull_request') {
    base = event.pull_request?.base?.sha
    if (!shaPattern.test(base ?? '')) throw Error('PR base SHA is missing')
    // Checkout fetch-depth: 2 normally includes the merge parent. An updated
    // target may require the event base explicitly; never truncate path lists.
    try { git(root, ['cat-file', '-e', `${base}^{commit}`]) }
    catch { git(root, ['fetch', '--no-tags', '--depth=1', 'origin', base]) }
    paths = git(root, ['diff', '--name-only', '--no-renames', '-z', base, sha, '--']).split('\0').filter(Boolean)
    git(root, ['diff', '--check', base, sha, '--'])
  }
  const mode = testMode(paths, { eventName })
  return { version: 1, sha, base, eventName, mode, paths }
}

async function main() {
  const root = process.cwd(), command = process.argv[2]
  if (command === 'prepare') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const plan = preparePlan(root, process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_SHA)
    mkdirSync(resolve(root, '.local/test-ci'), { recursive: true })
    writeFileSync(planPath(root), JSON.stringify(plan, null, 2) + '\n')
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${plan.mode}\n`)
    const text = plan.mode === 'documentation' ? 'Documentation diff checks only; no product tests run.' : plan.mode === 'checks' ? 'Typecheck and lint only. Build, Vitest and Electron UI tests were NOT run; targeted local validation is reported in the PR.' : 'Explicit full run: engineering, application build, informational screenshot and all Vitest tests.'
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Test: ${plan.mode}\n\n${text}\n\nCommit: \`${plan.sha}\`; changed paths: ${plan.paths.length}.\n`)
    console.log(JSON.stringify({ ...plan, description: text }))
  } else throw Error('Usage: test-ci-plan.mjs prepare')
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
