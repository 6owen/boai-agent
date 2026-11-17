/*
 * [INPUT]: Exact PR checkout, base commit, changed paths and existing Vitest dependency graph.
 * [OUTPUT]: Documentation/frontend/full Test scope; related tests plus source-reading contracts, with conservative fallbacks.
 * [POS]: Current Test workflow planner; main/manual and non-frontend changes retain full regression.
 * [PROTOCOL]: Update scripts/.folder.md, tests/test-ci-plan.test.ts and boai-dev-workflow when changed.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { basename, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { developmentMarkdown } from './ci-scope.mjs'

const shaPattern = /^[a-f0-9]{40}$/
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trimEnd()
const planPath = root => resolve(root, '.local/test-ci/plan.json')
const documentationPath = path => developmentMarkdown(path) || ['UI_TEST_CI.md', 'DESIGN.md'].includes(path) || /^ai-docs\/.+\.(?:svg|png|webp|tldraw)$/.test(path)
export const frontendSource = path => /^(?:apps\/electron\/src\/renderer\/|packages\/(?:ui|tokens)\/src\/).+\.(?:tsx?|css)$/.test(path) || /^packages\/file-explorer-plugin\/src\/explorer\.(?:tsx|css)$/.test(path)
export const frontendTest = source => !/(?:packages\/runtime\/|@boai\/runtime)/.test(source) && /@vitest-environment\s+(?:jsdom|happy-dom)|apps\/electron\/src\/renderer|packages\/(?:ui|tokens)\/src|packages\/file-explorer-plugin\/src\/explorer|(?:from|import\s*\()\s*['"](?:@\/|@boai\/(?:ui|tokens)(?:\/|['"]))/m.test(source)

export function testMode(paths, { eventName = 'pull_request', forceFull = false, readTest = () => '' } = {}) {
  if (eventName !== 'pull_request' || forceFull || !paths.length) return 'full'
  if (paths.every(documentationPath)) return 'documentation'
  if (!paths.some(frontendSource)) return 'full'
  if (paths.some(path => /^tests\/(?:ci-|test-ci-|ui-preview\.)/.test(path))) return 'full'
  return paths.every(path => documentationPath(path) || frontendSource(path) || /^tests\/.+\.test\.ts$/.test(path) && frontendTest(readTest(path))) ? 'frontend' : 'full'
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
  const forceFull = event.pull_request?.labels?.some(label => label.name === 'ci:full') === true
  const mode = testMode(paths, { eventName, forceFull, readTest: path => existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '' })
  return { version: 1, sha, base, eventName, mode, paths }
}

function testFiles(root, directory = 'tests') {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory() ? testFiles(root, path) : entry.isFile() && path.endsWith('.test.ts') ? [path] : []
  }).sort()
}

export function relatedFiles(root, rows) {
  if (!Array.isArray(rows)) throw Error('Invalid Vitest file list')
  return rows.map(row => {
    if (typeof row?.file !== 'string') throw Error('Missing Vitest file path')
    const path = relative(root, resolve(root, row.file)).split(sep).join('/')
    if (!/^tests\/.+\.test\.ts$/.test(path) || path.split('/').includes('..') || !existsSync(resolve(root, path))) throw Error(`Unexpected Vitest file: ${path}`)
    return path
  })
}

export function supplementalTests(paths, sources) {
  const ui = paths.filter(frontendSource)
  const broad = ui.some(path => path.endsWith('.css') || path.startsWith('packages/'))
  return Object.entries(sources).filter(([path, source]) => paths.includes(path) || (broad && frontendTest(source)) || ui.some(changed => source.includes(changed) || source.includes(basename(changed).replace(/\.(tsx?|css)$/, '')))).map(([path]) => path)
}

export function selectFrontendTests(root, plan, run = (args) => execFileSync('pnpm', args, { cwd: root, stdio: 'inherit' })) {
  if (plan.mode !== 'frontend' || !shaPattern.test(plan.base ?? '')) throw Error('A frontend PR plan is required')
  const list = resolve(root, '.local/test-ci/related.json')
  mkdirSync(resolve(root, '.local/test-ci'), { recursive: true })
  run(['exec', 'vitest', 'list', '--changed', plan.base, '--filesOnly', `--json=${list}`])
  const related = relatedFiles(root, JSON.parse(readFileSync(list, 'utf8')))
  const sources = Object.fromEntries(testFiles(root).map(path => [path, readFileSync(resolve(root, path), 'utf8')]))
  const selected = new Set([...related, ...supplementalTests(plan.paths, sources)])
  // An empty dependency graph is not evidence that a UI change needs no tests.
  if (!selected.size) for (const [path, source] of Object.entries(sources)) if (frontendTest(source)) selected.add(path)
  if (!selected.size) throw Error('No frontend regression tests were selected')
  return [...selected].sort()
}

async function main() {
  const root = process.cwd(), command = process.argv[2]
  if (command === 'prepare') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const plan = preparePlan(root, process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_SHA)
    mkdirSync(resolve(root, '.local/test-ci'), { recursive: true })
    writeFileSync(planPath(root), JSON.stringify(plan, null, 2) + '\n')
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${plan.mode}\n`)
    const text = plan.mode === 'documentation' ? 'Documentation diff checks only; no product tests run.' : plan.mode === 'frontend' ? 'Engineering checks, fixed UI behaviors and related Vitest tests. Full regression remains on main.' : 'Full engineering, fixed UI behaviors and Vitest regression.'
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Test: ${plan.mode}\n\n${text}\n\nCommit: \`${plan.sha}\`; changed paths: ${plan.paths.length}.\n`)
    console.log(JSON.stringify({ ...plan, description: text }))
  } else if (command === 'frontend') {
    const plan = JSON.parse(readFileSync(planPath(root), 'utf8'))
    if (git(root, ['rev-parse', 'HEAD']) !== plan.sha) throw Error('Test plan is stale')
    const selected = selectFrontendTests(root, plan)
    writeFileSync(planPath(root), JSON.stringify({ ...plan, selectedTests: selected }, null, 2) + '\n')
    console.log(`Frontend regression: ${selected.length} test files\n${selected.join('\n')}`)
    // No passWithNoTests and no retries: missing selections and failures fail CI.
    execFileSync('pnpm', ['exec', 'vitest', 'run', ...selected], { cwd: root, stdio: 'inherit' })
  } else throw Error('Usage: test-ci-plan.mjs prepare|frontend')
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
