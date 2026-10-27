/*
 * [INPUT]: Completed baseline/candidate page batches and retained-profile diagnostics.
 * [OUTPUT]: Sample-preserving JSON, readable per-page report and a standalone interactive comparison.
 * [POS]: Opt-in performance evidence exporter, never a CI qualification or baseline updater.
 * [PROTOCOL]: Update performance/.folder.md and spec17/.folder.md when changed.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = resolve('.local/frontend-performance')
const target = resolve('ai-docs/spec/17.桌面后台运行')
const names = ['会话', '通讯录', '定时任务', '资源库首页', '个人资料', '外观', '快捷键', '运行选项', '桌面活动与日报', '模型连接', '网页检索', '语音输入', '插件', '数据与备份', '资源库·技能', '资源库·数据源', '资源库·提示词', '会话（保留资料页）', '通讯录（保留资料页）', '定时任务（保留资料页）']
const ids = ['conversations', 'contacts', 'schedules', 'skills', ...Array.from({ length: 10 }, (_, i) => `settings-${i}`), ...Array.from({ length: 3 }, (_, i) => `resources-${i}`), 'conversations-after-profile', 'contacts-after-profile', 'schedules-after-profile']
async function load(name, expected = 3) {
  const files = (await readdir(join(root, name))).filter(f => /^batch-\d+\.json$/.test(f)).sort()
  if (files.length !== expected) throw new Error(`${name}: expected ${expected} completed batches, found ${files.length}`)
  const batches = await Promise.all(files.map(f => readFile(join(root, name, f), 'utf8').then(JSON.parse)))
  if (batches.some(b => b.fixture.modelCalls !== 0)) throw new Error('Unexpected model call in performance run')
  return { batches, rows: batches.flatMap(b => b.rows) }
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length
  if (!n) throw new Error('Missing samples')
  const round = n => Math.round(n * 10) / 10
  return { n, median: round(n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2), min: round(sorted[0]), max: round(sorted.at(-1)), p95: n >= 50 ? round(sorted[Math.ceil(n * .95) - 1]) : null, samples: values }
}
function measurements(rows, id) {
  const selected = rows.filter(row => row.id === id)
  return { firstPaint: stats(selected.map(r => r.firstPaintMs)), settled: stats(selected.map(r => r.settledMs)), script: stats(selected.map(r => r.metrics.ScriptDuration)), task: stats(selected.map(r => r.metrics.TaskDuration)), frame: stats(selected.map(r => r.maxFrameMs)), longTaskCount: selected.reduce((sum, row) => sum + row.longTasks.length, 0), batches: selected.map(r => ({ batch: r.batch, sample: r.sample })) }
}
const [productionBefore, retainedBefore, productionAfter, developmentBefore, developmentAfter, hotspotsBefore, hotspotsAfter] = await Promise.all(['baseline-production', 'baseline-retained', 'candidate-production', 'baseline-development', 'candidate-development', 'baseline-hotspots', 'candidate-hotspots'].map(name => load(name)))
const modes = {
  production: { before: [...productionBefore.rows, ...retainedBefore.rows], after: productionAfter.rows },
  development: { before: developmentBefore.rows, after: developmentAfter.rows },
}
const comparisons = Object.fromEntries(Object.entries(modes).map(([mode, data]) => [mode, ids.map((id, i) => ({ id, name: names[i], before: measurements(data.before, id), after: measurements(data.after, id) }))]))
const hotspots = ['settings-2', 'conversations-after-profile'].map(id => ({ id, name: names[ids.indexOf(id)], before: measurements(hotspotsBefore.rows, id), after: measurements(hotspotsAfter.rows, id) }))
const final = JSON.parse(await readFile(join(root, 'final-verification/batch-0.json'), 'utf8'))
const baselineBuild = JSON.parse(await readFile(join(root, 'baseline-build.json'), 'utf8'))
const result = { version: 1, baselineCommit: '461fb4afc1b470b7146b85e08175bd052a712852', candidateInputHash: final.inputHash, baselineBuild, candidateBuild: final.built, environment: final.environment, fixture: final.fixture, fixtureMetadataNote: 'Earlier batch fixture counts were hard-coded incorrectly; this fixture shape was verified by snapshot/getConversation using the unchanged seed. Timing observations are unchanged.', comparisons, hotspots, limitations: ['Same local machine and isolated fixed fixture; not the personal database.', 'Page scan n=9 production, n=3 development: no P95 claimed for small samples.', 'Hotspots use 3 batches and 51 samples per side.', 'First-frame feedback is measured by target DOM state plus requestAnimationFrame, not external display latency.', 'Settled includes finite animation completion, current IPC completion and final animation frames.', 'No real models, long-running task stress, large personal histories, PDF/Office stress or cross-platform qualification.'] }
await writeFile(join(target, '05-前端页面性能对照.json'), JSON.stringify(result, null, 2) + '\n')
const percent = (a, b) => ((a - b) / a * 100).toFixed(1)
let markdown = `<!--\n[INPUT]: Fixed baseline/candidate Electron page measurements.\n[OUTPUT]: Frozen measured results; spec17/04 §6 owns current progress.\n[POS]: Frontend performance evidence report, not business or release qualification.\n[PROTOCOL]: Regenerate with tests/performance/summarize.mjs after new measurements.\n-->\n# 前端页面性能优化实测（2026-10-28）\n\n- 基线：461fb4af；性能分支：perf/frontend-page-responsiveness。\n- 覆盖：17个主/子页面与3个保留资料页后的导航场景；构建版与开发模式分开。隔离夹具，模型调用0；未改个人数据。\n- 首帧为点击到目标DOM就绪后的动画帧反馈；稳定耗时包含有限动画、当前IPC完成及最终帧，不能全部解读为JS阻塞。单位均为ms。\n- 页面扫描：构建版每侧9次、开发模式每侧3次；以下只列中位数，不对小样本声称精确P95。\n- 两项正式热点：每侧3批51次，保留原始样本向量与完整n/范围/P95，见同目录JSON。\n\n## 修改与正式热点\n\n- 共享稳定态停止等值二次过渡：保留原400ms入场；原transitionend后再次transitionrun的filter/transform已消除。\n- ActivityChart只在活动数据、加载状态或自身交互变化时重渲染，避免隐藏资料页随导航反复重建全年日期/Tooltip树。\n`
for (const row of hotspots) markdown += `- ${row.name}（每侧${row.before.firstPaint.n}次）：首帧 ${row.before.firstPaint.median} → ${row.after.firstPaint.median}，P95 ${row.before.firstPaint.p95} → ${row.after.firstPaint.p95}；稳定 ${row.before.settled.median} → ${row.after.settled.median}（减少${percent(row.before.settled.median, row.after.settled.median)}%）；脚本 ${row.before.script.median} → ${row.after.script.median}（减少${percent(row.before.script.median, row.after.script.median)}%）。\n`
for (const [mode, rows] of Object.entries(comparisons)) {
  markdown += `\n## ${mode === 'production' ? '构建版逐页对照' : '开发模式逐页对照'}\n\n`
  for (const row of rows) markdown += `- ${row.name}：首帧 ${row.before.firstPaint.median} → ${row.after.firstPaint.median}；稳定 ${row.before.settled.median} → ${row.after.settled.median}。\n`
}
markdown += `\n## 验证与实际边界\n\n- 全部测量批次执行通过，模型调用0；活动图每日/每周/累计切换、键盘按周移动焦点均在计时外验证。\n- 相关5个Vitest文件77项通过；类型检查、定向ESLint与完整Electron构建通过。云端视觉CI、合并及用户个人进程体验以交付回执为准。\n- 多数页面首帧保持约30ms；主要收益是移除无效等待，以及消除隐藏图表放大的导航开销。通讯录、定时列表、数据源/提示词的普通路径基本保持，不能声称每个页面首帧均加速。\n- 开发模式仍有更高的首次渲染成本，个人资料/外观/通讯录的剩余成本未在本轮全面消除。真实大历史、重型PDF/Office、长时资源及跨平台未验。\n- 原始批次、trace和CPU profile位于本worktree的.local/frontend-performance；它们是本地可清理产物。汇总JSON保留逐项原始耗时向量；HTML提供离线可交互比较。\n- 后续性能复测：BOAI_PERF_OUTPUT指定新目录，用tests/performance/playwright.config.ts执行；BOAI_TEST_DEV_SERVER=1为开发模式。正式热点使用BOAI_PERF_BATCHES=3、BOAI_PERF_SAMPLES=17及明确BOAI_PERF_VIEWS。\n- 方法参考：[Electron性能指南](https://www.electronjs.org/docs/latest/tutorial/performance)、[React memo](https://react.dev/reference/react/memo)。\n`
await writeFile(join(target, '05-前端页面性能优化实测.md'), markdown)
const data = JSON.stringify(comparisons).replaceAll('<', '\\u003c')
const html = `<!doctype html><!-- [INPUT]: Frozen isolated performance samples. [OUTPUT]: Offline interactive comparison. [POS]: spec17 performance report. [PROTOCOL]: Regenerate via tests/performance/summarize.mjs. --><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BOAI 页面性能对照</title><style>body{font:15px/1.5 system-ui;margin:32px auto;max-width:1100px;padding:0 20px;color:#263243;background:#f7f9fc}h1{font-size:25px}select{font:inherit;padding:7px;margin-right:12px;border:1px solid #bfcada;border-radius:6px}.row{padding:12px 0;border-bottom:1px solid #dce3ed}.label{display:flex;justify-content:space-between;gap:20px}.track{background:#e9eef5;height:13px;margin:5px 0;border-radius:3px;overflow:hidden}.bar{height:100%}.before{background:#718096}.after{background:#168c82}small{color:#56677c}#legend{margin:20px 0}</style><h1>BOAI 页面性能对照</h1><p>点击查看构建版或开发模式。数据为隔离夹具中的中位数，首帧反馈与完整稳定耗时分别展示。</p><label>模式 <select id="mode"><option value="production">构建版（每侧9次）</option><option value="development">开发模式（每侧3次）</option></select></label><label>指标 <select id="metric"><option value="settled">稳定耗时</option><option value="firstPaint">首帧反馈</option><option value="script">脚本执行</option></select></label><div id="legend"><span style="color:#718096">■ 优化前</span>　<span style="color:#168c82">■ 优化后</span>　<small>小样本只展示中位数，不声称精确P95；非个人大数据验收。</small></div><div id="chart"></div><script>const data=${data};const mode=document.querySelector('#mode'),metric=document.querySelector('#metric');function draw(){const rows=data[mode.value],key=metric.value,max=Math.max(...rows.flatMap(r=>[r.before[key].median,r.after[key].median]));document.querySelector('#chart').innerHTML=rows.map(r=>{const a=r.before[key].median,b=r.after[key].median;return '<div class="row"><div class="label"><span>'+r.name+'</span><span>'+a+' → '+b+' ms</span></div><div class="track"><div class="bar before" style="width:'+a/max*100+'%"></div></div><div class="track"><div class="bar after" style="width:'+b/max*100+'%"></div></div></div>'}).join('')}mode.onchange=metric.onchange=draw;draw();</script></html>`
await writeFile(join(target, '05-前端页面性能对照.html'), html)
console.log(JSON.stringify({ report: '05-前端页面性能优化实测.md', pages: 17, retainedScenarios: 3, hotspots: hotspots.map(r => ({ id: r.id, samples: r.before.firstPaint.n, firstPaint: [r.before.firstPaint.median, r.after.firstPaint.median], settled: [r.before.settled.median, r.after.settled.median] })) }))
