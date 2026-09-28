/*
 * [INPUT]: 保存的评估样本目录和可选评审/比较/校准文件，或数据集清单请求。
 * [OUTPUT]: 无网络调用的重评分命令、数据集校验及可筛选报告。
 * [POS]: scripts/score-collaboration.mjs。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { build } from 'esbuild'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const args = process.argv.slice(2), option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
if (args.includes('--help')) {
  process.stdout.write('pnpm eval:score --input DIR --output NEW_DIR [--baseline DIR] [--reviews FILE] [--calibration FILE] [--strict]\npnpm eval:dataset\nNo model calls. --strict exits 1 for failed, 2 for incomplete/review-needed; default only generates a report.\n'); process.exit(0)
}
const list = args.includes('--list'), input = option('--input'), output = option('--output')
if (!list && (!input || !output)) throw new Error('--input and a new --output directory are required')
const cache = resolve('.local/evaluation-tools'); await mkdir(cache, { recursive: true })
const modulePath = join(cache, `offline-${process.pid}-${Date.now()}.mjs`)
try {
  await build({ stdin: { contents: 'export { rescore } from "./tests/evaluation/rescore"; export { datasetManifest, validateFrozenHoldout } from "./tests/evaluation/matrix"', resolveDir: process.cwd() }, outfile: modulePath, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
  const api = await import(pathToFileURL(modulePath).href)
  if (list) { await api.validateFrozenHoldout(); process.stdout.write(JSON.stringify(api.datasetManifest(), null, 2) + '\n') }
  else {
    const read = async name => option(name) ? JSON.parse(await readFile(resolve(option(name)), 'utf8')) : undefined
    const summary = await api.rescore(resolve(input), resolve(output), { baseline: option('--baseline') && resolve(option('--baseline')), reviews: await read('--reviews'), calibration: await read('--calibration') })
    process.stdout.write(JSON.stringify({ output: resolve(output), started: summary.started, passed: summary.passed, failed: summary.failed, incomplete: summary.incomplete, reviewNeeded: summary.reviewNeeded }) + '\n')
    if (args.includes('--strict')) process.exitCode = summary.failed ? 1 : summary.incomplete || summary.reviewNeeded ? 2 : 0
  }
} finally { await rm(modulePath, { force: true }) }
