/*
 * [INPUT]: Fresh dialog batches, style controls and retained diagnostic failures.
 * [OUTPUT]: Frozen dialog timings, accepted lightweight overlay and explicit evidence limits.
 * [POS]: Opt-in evidence exporter; no visual baseline acceptance.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { buildInputHash } from '../../scripts/build-identity.mjs'

const root = resolve('.local/frontend-performance'), target = resolve('ai-docs/spec/17.桌面后台运行')
const round = n => Math.round(n * 10) / 10
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length
  if (!n) throw new Error('Missing observations')
  return { n, median: round(n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2), min: round(sorted[0]), max: round(sorted.at(-1)), samples: values }
}
function animationMaxFrame(row) {
  const starts = row.transitions.map(event => event.at)
  if (!starts.length) throw new Error('Missing dialog transition events')
  const start = Math.min(...starts)
  let at = 0
  const frames = []
  for (const duration of row.frames) {
    // transitionrun is delivered in the same rendering update as rAF; allow
    // 1ms ordering skew, and keep a stalled frame even if it ends after 250ms.
    if (at >= start - 1 && at < start + 250) frames.push(duration)
    at += duration
  }
  if (!frames.length) throw new Error('Missing animation-phase frames')
  return Math.max(...frames)
}
async function load(name, expected) {
  const files = (await readdir(join(root, name))).filter(name => /^(contacts|schedules|team)-\d+\.json$/.test(name)).sort()
  if (files.length !== expected) throw new Error(`${name}: expected ${expected} complete cases, found ${files.length}`)
  const batches = await Promise.all(files.map(file => readFile(join(root, name, file), 'utf8').then(JSON.parse)))
  if (batches.some(batch => batch.modelCalls !== 0)) throw new Error('Unexpected model call')
  const rows = batches.flatMap(batch => batch.rows.map(row => ({ first: batch.order[0], batch: batch.batch, kind: row.kind, index: row.index, cold: row.cold, maxFrame: Math.max(...row.frames), animationMaxFrame: animationMaxFrame(row), firstPaint: row.firstPaint.at, script: row.metrics.ScriptDuration, layout: row.metrics.LayoutDuration, elapsed: row.elapsed, filter: row.backdropFilter, frames: row.frames, resources: row.resources, transitions: row.transitions })))
  const summarize = selected => Object.fromEntries(['maxFrame', 'animationMaxFrame', 'firstPaint', 'script', 'layout', 'elapsed'].map(key => [key, stats(selected.map(row => row[key]))]))
  return { name, environment: batches[0].environment, builds: batches.map(batch => batch.built), observations: rows, cold: summarize(rows.filter(row => row.cold)), warm: summarize(rows.filter(row => !row.cold)), coldByType: Object.fromEntries(['contacts', 'schedules', 'team'].filter(kind => rows.some(row => row.kind === kind && row.cold)).map(kind => [kind, summarize(rows.filter(row => row.kind === kind && row.cold))])) }
}
const result = { version: 1, worktree: 'boai-execution-panel-performance', branch: 'perf/execution-panel-animation', production: { before: await load('dialog-baseline', 9), after: await load('dialog-candidate', 9) }, development: { before: await load('dialog-dev-baseline', 3), after: await load('dialog-dev-candidate', 3) }, controls: { noBlur: await load('dialog-control-no-blur', 3), round: await load('dialog-control-round', 3), restoredOriginal: await load('dialog-control-original', 3) }, firstSmoke: await load('dialog-smoke', 3), failures: [{ dataset: 'dialog-no-blur', cases: 3, stage: 'Saving build identity after the dev suite had invalidated it', accepted: false, handling: 'Retained failed traces; production was rebuilt and identity validation moved before Electron launch.' }], interpretation: ['No newly requested resources in the measured baseline popup openings; layout and JS time do not explain the largest observed pause.', 'GPU traces show additional drawing/submission work. Full-screen backdrop filtering is a removable shared rendering cost, not a proven explanation for every first-open pause.', 'No-blur controls first-contact maxima were consistently about 19-21ms; ordinary-round-corner controls still had large pauses.', 'Restoring original styles also produced fast runs: graphics/process caches and local scheduling affect results, so do not claim a deterministic cold-start percentage improvement.'], limits: ['Isolated fixed 4-agent/two-conversation profile; model calls 0, no personal database.', 'Production 9 fresh sessions per side; dev only 3 per side. No P95, physical FPS or every-device guarantee.', 'maxFrame includes initial click/mount work. animationMaxFrame selects rAF intervals starting within the 250ms CSS transition, allowing 1ms event/rAF ordering skew; long intervals extending past transition end remain included. Both are reported.', 'firstPaint means popup DOM found during rAF, not external display latency.', 'The 667ms first smoke observation remains recorded, but is not used as the entire baseline.', 'Blur removal visibly keeps the background sharper. Original overlay tint, dialog scale/fade durations and modal semantics are preserved.', 'AlertDialog receives the same overlay change and semantic regressions, without separate cold-frame certification.'] }
if (result.production.after.builds.some(build => build.inputHash !== result.production.after.builds[0].inputHash) || result.production.after.builds[0].inputHash !== await buildInputHash(process.cwd())) throw new Error('Current candidate source/build mismatch')
result.sourceFingerprints = Object.fromEntries(await Promise.all(['packages/ui/src/components/dialog.tsx', 'packages/ui/src/components/alert-dialog.tsx'].map(async path => [path, { before: createHash('sha256').update(execFileSync('git', ['show', `77d7d653:${path}`])).digest('hex'), after: createHash('sha256').update(await readFile(path)).digest('hex') }])))
await writeFile(join(target, '07-通用Dialog首次绘制实测.json'), JSON.stringify(result, null, 2) + '\n')
let md = `<!--\n[INPUT]: Paired isolated first/repeated/cross-dialog measurements and GPU/CPU diagnostics.\n[OUTPUT]: Frozen shared-dialog evidence; spec17/04 owns current progress.\n[POS]: Not personal-session, release or visual-baseline qualification.\n[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md；通过tests/performance/summarize-dialog.mjs生成。\n-->\n# 通用Dialog首次绘制实测（2026-10-28）\n\n- 复现路径：通讯录管理→再次通讯录管理→定时任务管理；反向顺序；以及简单团队Dialog先开。每组用新Electron进程，按正常入口点击，模型调用0。\n- 本批仅取消Dialog/AlertDialog遮罩的全屏backdrop模糊，保留黑色10%遮罩、原缩放/淡入和焦点/退出生命周期。普通Dialog仍为250ms入场/150ms退出，AlertDialog原时长保持。视觉差异是背景更清晰。\n- 初轮首次通讯录记录到667ms长帧，但JS约14ms、布局约2ms且无新增网络资源；后续快速。额外GPU绘制/提交被追踪捕获。不能据此断言所有首开停顿都只有一个根因。\n- 构建版每侧9次独立首次与27次后续打开；开发模式每侧3次首次与9次后续。以下仅列中位数和范围，单位ms，不声称精确P95或固定FPS。点击全程包含挂载，动画阶段按transitionrun起点后250ms内的rAF间隔起点统计（允许1ms事件顺序误差），跨越结束时刻的长间隔不剔除。\n`
for (const [mode, data] of Object.entries({ production: result.production, development: result.development })) {
  md += `\n## ${mode === 'production' ? '构建版' : '开发模式'}\n\n`
  for (const [group, label] of [['cold', '首次'], ['warm', '后续']]) {
    const a = data.before[group], b = data.after[group]
    md += `- ${label}动画阶段最长间隔中位${a.animationMaxFrame.median}→${b.animationMaxFrame.median}；范围${a.animationMaxFrame.min}–${a.animationMaxFrame.max}→${b.animationMaxFrame.min}–${b.animationMaxFrame.max}。\n- ${label}点击全程：最长rAF间隔中位${a.maxFrame.median}→${b.maxFrame.median}；范围${a.maxFrame.min}–${a.maxFrame.max}→${b.maxFrame.min}–${b.maxFrame.max}。\n- ${label}脚本中位${a.script.median}→${b.script.median}；布局${a.layout.median}→${b.layout.median}；完整稳定${a.elapsed.median}→${b.elapsed.median}。\n`
  }
  for (const [kind, label] of [['contacts', '通讯录管理'], ['schedules', '定时任务管理'], ['team', '创建团队']]) md += `- ${label}独立首开最长间隔原值：${data.before.coldByType[kind].maxFrame.samples.map(round).join('/')}→${data.after.coldByType[kind].maxFrame.samples.map(round).join('/')}。\n`
}
md += `\n## 单项对照、验证与限制\n\n- 单项去模糊首开：${result.controls.noBlur.cold.maxFrame.samples.map(round).join('/')}；仅普通圆角：${result.controls.round.cold.maxFrame.samples.map(round).join('/')}；恢复原样：${result.controls.restoredOriginal.cold.maxFrame.samples.map(round).join('/')}。恢复原样也可能很快，说明缓存/调度波动存在；不把预热后的快照当作独立修复证明。\n- 原dev之后的3次对照在最后保存构建身份时失败，原失败/trace保留，未计为通过。已重建生产版并把身份核验前移，不延长或放宽原业务断言。\n- 43项员工/定时Dialog回归、TypeScript、定向ESLint与完整Electron构建通过。真实测量逐次核对弹窗已打开、焦点在弹窗、Escape后遮罩卸载；全部模型调用0。\n- 本批开发模式点击/首次挂载总段并未改善（首开最长间隔中位52.8→69ms），不能声称dev整体首开更快；动画阶段与挂载延迟分开报告。\n- 用户已明确接受轻量遮罩及背景更清晰的效果；沿原PR49接续官方构建、差异审阅与线上基准更新。本报告的本地测量不替代当前PR检查，实际交付进度见04。\n- 完整构建身份及逐项样本见同目录JSON；原始profile/trace/失败材料在.local/frontend-performance。个人真实会话、较大业务数据、跨平台和绝对零掉帧未认证。\n- 复测入口：BOAI_PERF_OUTPUT=<新目录> pnpm exec playwright test --config tests/performance/dialog.config.ts；开发模式加BOAI_TEST_DEV_SERVER=1。样式单项对照为显式诊断参数，不是产品开关，也不加入日常CI。\n`
await writeFile(join(target, '07-通用Dialog首次绘制实测.md'), md)
console.log(JSON.stringify(Object.fromEntries(Object.entries({ production: result.production, development: result.development }).map(([mode, data]) => [mode, { coldN: data.before.cold.maxFrame.n, coldMaxFrameMedian: [data.before.cold.maxFrame.median, data.after.cold.maxFrame.median], coldRanges: [[data.before.cold.maxFrame.min, data.before.cold.maxFrame.max], [data.after.cold.maxFrame.min, data.after.cold.maxFrame.max]], warmMaxFrameMedian: [data.before.warm.maxFrame.median, data.after.warm.maxFrame.median] }]))))
