/*
 * [INPUT]: GitHub run identity and baseline-only commit data.
 * [OUTPUT]: Shared fail-closed identities for automatic PR capture and verification.
 * [POS]: Dependency-free UI delivery protocol; no network or mutation.
 * [PROTOCOL]: Update scripts/.folder.md with protocol changes.
 */
export const UI_REPOSITORY = '6owen/boai-agent'
export const BASELINE_PREFIX = 'tests/e2e/baselines/github-macos15-arm64/'
export function candidateWorkflow(run) {
  if (run.path === '.github/workflows/ui-baseline-candidate.yml' && (run.event === 'workflow_dispatch' || run.event === 'push' && run.head_branch === 'infra/ui-environment-profiles')) return `${UI_REPOSITORY}/${run.path}@refs/heads/${run.head_branch}`
  const pr = run.pull_requests?.[0]
  if (run.path === '.github/workflows/tests.yml' && run.event === 'pull_request' && run.pull_requests?.length === 1 && Number.isInteger(pr.number) && pr.number > 0 && pr.head?.sha === run.head_sha && pr.head?.repo?.id === run.repository?.id && pr.base?.repo?.id === run.repository?.id && Number.isInteger(run.repository?.id)) return `${UI_REPOSITORY}/${run.path}@refs/pull/${pr.number}/merge`
  return null
}
// A custom pending Required check can keep the Actions run in_progress even
// after all scheduled jobs finish. Validate the actual attempt's capture/gate
// jobs; waiting for the whole run to turn green would deadlock visual review.
export function candidateRunReady(run) {
  if (!candidateWorkflow(run)) return false
  if (run.event !== 'pull_request') return run.status === 'completed' && run.conclusion === 'success'
  if (!['completed', 'in_progress'].includes(run.status) || ![null, undefined, 'success'].includes(run.conclusion)) return false
  const jobs = run.capture_jobs ?? []
  const result = name => { const rows = jobs.filter(job => job.name === name); return rows.length === 1 && rows[0].status === 'completed' ? rows[0].conclusion : null }
  if (!['Plan UI delivery', 'Capture UI for review', 'UI delivery gate'].every(name => result(name) === 'success')) return false
  const shards = [result('UI regression (1/2)'), result('UI regression (2/2)')]
  // GitHub represents a skipped matrix as a single job before expansion.
  const skippedMatrix = result('UI regression (1/2)') === null && result('UI regression (2/2)') === null && jobs.filter(job => job.name.startsWith('UI regression')).length === 1 && jobs.some(job => job.name.startsWith('UI regression') && job.status === 'completed' && job.conclusion === 'skipped')
  return shards.every(value => value === 'success') || shards.every(value => value === 'skipped') || skippedMatrix
}
export function withCandidateJobs(run, request) {
  if (run.event !== 'pull_request' || !candidateWorkflow(run)) return run
  if (!Number.isInteger(run.run_attempt) || run.run_attempt < 1 || !/^\d+$/.test(String(run.id))) throw new Error('无效的候选attempt')
  const result = request(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`)
  if (!Array.isArray(result.jobs) || result.total_count !== result.jobs.length) throw new Error('候选job证明不完整')
  return { ...run, capture_jobs: result.jobs }
}
export function baselineOnlyCommit(files, manifest, parent) {
  if (!/^[a-f0-9]{40}$/.test(parent ?? '') || !files.includes(`${BASELINE_PREFIX}manifest.json`) || files.some(path => !path.startsWith(BASELINE_PREFIX) || !/^(manifest\.json|[a-z0-9][a-z0-9_-]*\.png)$/.test(path.slice(BASELINE_PREFIX.length)))) return false
  const rows = Object.values(manifest?.cases ?? {}).filter(row => row.source?.commit === parent)
  return rows.length > 0 && rows.every(row => row.provenance?.commit === parent && /^\d+$/.test(row.provenance?.runId ?? '')) && files.filter(path => path.endsWith('.png')).every(path => manifest.cases?.[path.slice(BASELINE_PREFIX.length, -4)]?.source?.commit === parent)
}
export function deliveryOutcome(needs) {
  if (needs.plan?.result !== 'success') return 'failed'
  if (needs.plan.outputs?.mode === 'capture') {
    if (needs.capture?.result !== 'success') return 'failed'
    if (needs.capture.outputs?.review === 'required' && needs.ui?.result === 'skipped') return 'review'
    if (needs.capture.outputs?.review !== 'none') return 'failed'
  } else if (needs.plan.outputs?.mode !== 'verify') return 'failed'
  return needs.ui?.result === 'success' ? 'verify' : 'failed'
}
