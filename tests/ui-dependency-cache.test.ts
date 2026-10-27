/*
 * [INPUT]: 两个真实UI工作流、共享依赖Action和workspace安装输入。
 * [OUTPUT]: 防止依赖变化后复用旧安装，禁止安装目录前缀回退及业务产物混入缓存。
 * [POS]: CI依赖缓存合同，不启动产品或Electron。
 * [PROTOCOL]: 修改同步Header及tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { parse } from 'yaml'

const action = parse(await readFile(new URL('../.github/actions/setup-ui-dependencies/action.yml', import.meta.url), 'utf8'))
const steps = action.runs.steps
const modules = steps.find((step: { id?: string }) => step.id === 'modules')

it('完整安装仅允许同运行时和全部依赖输入的精确缓存，业务产物不复用', async () => {
  expect(modules.with['restore-keys']).toBeUndefined()
  expect(modules.with.key).toContain('runner.os')
  expect(modules.with.key).toContain('runner.arch')
  expect(modules.with.key).toContain('steps.node.outputs.node-version')
  for (const input of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'package.json', 'apps/*/package.json', 'packages/*/package.json', '.github/actions/setup-ui-dependencies/action.yml']) expect(modules.with.key).toContain(`'${input}'`)
  const workspace = parse(await readFile(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8'))
  expect(workspace.packages).toEqual(['.', 'packages/*', 'apps/*'])
  for (const patch of Object.values(workspace.patchedDependencies) as string[]) {
    expect(modules.with.key).toContain(`'${patch.slice(0, patch.lastIndexOf('/'))}/*.patch'`)
  }
  const paths = modules.with.path.trim().split('\n')
  expect(paths).toEqual(['node_modules', 'apps/*/node_modules', 'packages/*/node_modules'])
  for (const directory of ['apps', 'packages']) expect((await readdir(new URL(`../${directory}`, import.meta.url))).length).toBeGreaterThan(0)
})

it('安装目录未命中才严格安装；每次验证真实Electron后才能保存', () => {
  const install = steps.find((step: { run?: string }) => step.run?.includes('pnpm install'))
  expect(install.if).toBe("steps.modules.outputs.cache-hit != 'true'")
  expect(install.run).toContain('--frozen-lockfile')
  const verify = steps.findIndex((step: { run?: string }) => step.run?.includes('electron --version'))
  expect(steps[verify].if).toBeUndefined()
  for (const save of steps.filter((step: { uses?: string }) => step.uses === 'actions/cache/save@v4')) {
    expect(steps.indexOf(save)).toBeGreaterThan(verify)
    expect(save.if).toContain("steps.modules.outputs.cache-hit != 'true'")
  }
})

it('普通UI和候选共用准备入口，矩阵仅一片保存', async () => {
  for (const name of ['tests', 'ui-baseline-candidate']) {
    const workflow = parse(await readFile(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'))
    const job = workflow.jobs[name === 'tests' ? 'ui' : 'capture']
    const setup = job.steps.findIndex((step: { uses?: string }) => step.uses === './.github/actions/setup-ui-dependencies')
    expect(setup).toBeGreaterThan(0)
    expect(job.steps.findIndex((step: { run?: string }) => step.run === 'pnpm build')).toBeGreaterThan(setup)
    if (name === 'tests') expect(job.steps[setup].with['save-cache']).toBe('${{ matrix.shard == 1 }}')
  }
})
