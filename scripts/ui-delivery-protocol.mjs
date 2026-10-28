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
