/*
 * [OUTPUT]: 技能一级入口随产品统一为自定义。
 * [INPUT]: 场景独立目录与真实打包 main/worker。
 * [OUTPUT]: 同页本地/收藏/商城 Tabs 导航；只替换 worker 的系统用户目录读取，隔离原生本机技能扫描与插件开关；导出空白用户目录引导供受管资源场景复用。
 * [POS]: 本机 Skills BDD 支撑；不引入生产环境测试开关。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { mkdir, writeFile, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Page } from '@playwright/test'
import type { Desktop } from './desktop'
export async function startLocalSkills(runtime: Desktop) {
  const home = join(runtime.root, 'local-user'), global = join(home, '.agents/skills/agents-sdk'), plugin = join(home, '.codex/plugins/cache/plugins-cli/kata-code/1.0.0')
  const document = '---\nname: agents-sdk\ndescription: Build AI agents with the Agents SDK.\n---\n# Agents SDK\n本机现有技能，不依赖导入。'
  await mkdir(global, { recursive: true }); await writeFile(join(global, 'SKILL.md'), document)
  await mkdir(join(home, '.codex/skills'), { recursive: true }); await symlink(global, join(home, '.codex/skills/agents-sdk'))
  await mkdir(join(plugin, 'skills/express-modular'), { recursive: true }); await writeFile(join(plugin, 'skills/express-modular/SKILL.md'), '---\nname: express-modular\ndescription: Express 模块化开发\n---\n# Express Modular\n使用模块组织服务。')
  await mkdir(join(plugin, '.codex-plugin')); await writeFile(join(plugin, '.codex-plugin/plugin.json'), '{"name":"kata-code","skills":"./skills"}')
  await writeFile(join(home, '.codex/config.toml'), '[plugins."kata-code@plugins-cli"]\nenabled = true\n')
  await runtime.start({ mainEntry: await localSkillsEntry(runtime) })
  return { global, document }
}

export async function localSkillsEntry(runtime: Desktop) {
  const home = join(runtime.root, 'local-user')
  const worker = join(runtime.root, 'local-skills-worker.mjs'), mainEntry = join(runtime.root, 'local-skills-main.cjs')
  await writeFile(worker, `import os from 'node:os';\nimport { syncBuiltinESMExports } from 'node:module';\nos.homedir = () => ${JSON.stringify(home)};\nsyncBuiltinESMExports();\ndelete process.env.CODEX_HOME;\nawait import(${JSON.stringify(pathToFileURL(resolve('dist/runtime/worker.mjs')).href)});\n`)
  await writeFile(mainEntry, `const { utilityProcess } = require('electron');\nconst fork = utilityProcess.fork.bind(utilityProcess);\nutilityProcess.fork = (entry, args, options) => fork(entry.endsWith('/runtime/worker.mjs') ? ${JSON.stringify(worker)} : entry, args, options);\nrequire(${JSON.stringify(resolve('dist/main/main.cjs'))});\n`)
  return mainEntry
}

export async function selectSkillsSection(page: Page, name: string) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '自定义', exact: true }).click()
  await page.getByRole('complementary', { name: '自定义导航' }).getByRole('button', { name: '技能', exact: true }).click()
  await page.getByRole('tab', { name: name === '全部技能' ? '本地' : name === '自己' ? '收藏' : name, exact: true }).click()
}
export async function selectSkillStore(page: Page, name: string) {
  await selectSkillsSection(page, '商城')
  await page.getByRole('tab', { name: name === '腾讯 SkillHub' ? 'SkillHub' : name, exact: true }).click()
}
