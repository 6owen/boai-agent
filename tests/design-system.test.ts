/*
 * [OUTPUT]: 全量目录覆盖、Token闭包/循环/缺失引用与各公开出口一致性合同。
 * [INPUT]: 公共tokens、原应用兼容入口及公开设计目录。
 * [OUTPUT]: Node消费、同一实现、变量闭包及公开内容/Fumadocs编译入口白名单回归。
 * [POS]: 设计系统模块合同，CI执行；不替代桌面或浏览器验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { baseThemes, foundationCss, foundationVariables, themeTokens, typographyDefaults, typographyVariables, resolveTypography, tokenRows, tokenDocument, resolveTokenValue } from '@boai/tokens'
import { resolveTypography as hostTypography } from '../src/shared/appearance/typography'
import { themeTokens as hostThemeTokens } from '../src/shared/appearance'
import { searchPages } from '../apps/design-docs/src/search'
// @ts-expect-error Shared Node public-content generator has no declaration file.
import { readDesignContent, designPublicFiles, designContentPlugin } from '../scripts/design-content.mjs'

it.each([
  { label: 'default', args: [] },
  { label: 'development', args: ['--conditions=development'] }
])('tokens can load in Node with $label conditions and no DOM, React or Electron', ({ args }) => {
  const output = execFileSync(process.execPath, [...args, '--input-type=module', '-e', "const t = await import('@boai/tokens'); if (typeof window !== 'undefined') throw Error('unexpected DOM'); console.log(t.foundationVariables('dark')['--background'])"], { encoding: 'utf8' })
  expect(output.trim()).toBe(baseThemes.dark.background)
})

it('desktop compatibility entries expose the same pure resolvers', () => {
  expect(hostTypography).toBe(resolveTypography)
  expect(hostThemeTokens).toBe(themeTokens)
  const variables = typographyVariables({ ...typographyDefaults, ui: { ...typographyDefaults.ui, sizePx: 18 } })
  expect(variables['--text-ui-body']).toBe('18px')
  expect(variables['--text-content-body']).toBe('13px')
})

it.each(['light', 'dark'] as const)('standalone %s defaults contain every referenced variable', mode => {
  const values = foundationVariables(mode)
  expect(values['--foreground']).toBe(themeTokens(baseThemes[mode]).foreground)
  expect(values['--primary-foreground']).toBe(themeTokens(baseThemes[mode])['primary-foreground'])
  for (const value of Object.values(values)) for (const reference of value.matchAll(/var\((--[\w-]+)/g)) expect(values, reference[1]).toHaveProperty(reference[1])
})

it('foundation CSS only declares variables and independently resets nested light/dark defaults', () => {
  const css = foundationCss()
  expect(css).toContain('.light')
  expect(css).toContain('.dark')
  expect(css.match(/--shadow-control:/g)).toHaveLength(2)
  expect(css).not.toMatch(/(?:^|[;{])\s*(?:font-size|outline|background|margin|display)\s*:/m)
})

it('shared package source cannot import application aliases or escape to host source', async () => {
  for (const name of ['tokens', 'ui']) {
    const directory = resolve('packages', name, 'src')
    async function walk(path: string): Promise<void> {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const file = join(path, entry.name)
        if (entry.isDirectory()) await walk(file)
        else if (/\.tsx?$/.test(file)) {
          const source = await readFile(file, 'utf8')
          for (const match of source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
            expect(match[1], file).not.toMatch(/^@\/|^@shared|electron|boai-asset:/)
            if (match[1].startsWith('.')) expect(resolve(path, match[1]).startsWith(directory + '/'), file).toBe(true)
          }
        }
      }
    }
    await walk(directory)
  }
})

it('public Markdown and component indexes only contain registered pages', async () => {
  const content = await readDesignContent()
  const files = designPublicFiles(content)
  const catalog = JSON.parse(await readFile(resolve('ai-docs/design-system/catalog.json'), 'utf8'))
  expect(content.pages).toHaveLength(catalog.pages.length)
  const modules = (await readdir('src/renderer/components/ui')).filter(name => name.endsWith('.tsx')).map(name => '@boai/ui/' + name.slice(0, -4))
  for (const entry of modules) expect(content.components.some((component: { import: string }) => component.import === entry), entry).toBe(true)
  expect(new Set(content.components.map((component: { import: string }) => component.import)).size).toBe(content.components.length)
  const publicModules = (await readdir('packages/ui/src/components')).filter(name => name.endsWith('.tsx')).map(name => '@boai/ui/' + name.slice(0, -4)).sort()
  expect(content.components.map((component: { import: string }) => component.import).sort()).toEqual(publicModules)
  for (const page of content.pages) {
    if (!['overview', 'installation', 'colors', 'surfaces', 'tokens', 'none', 'catalog'].includes(page.example)) expect(await readFile(resolve('apps/design-docs/src/examples', page.example + '.tsx'), 'utf8')).toContain('export default')
  }
  expect(JSON.parse(files['tokens.json'])).toEqual(tokenDocument(content.version))
  expect(files['foundation.css']).toBe(foundationCss())
  expect(files['DESIGN.md']).toBe(files['design.md'])
  for (const row of tokenRows()) expect(files['foundations/tokens.md']).toContain('`' + row.name + '`')
  expect(files['overview.md']).toContain('一套语言')
  expect(files['overview.md']).not.toContain('[PROTOCOL]')
  expect(files['llms.txt']).not.toMatch(/ai-docs\/spec|AGENTS\.md|\.folder\.md/)
  const compiled = await designContentPlugin().load('\0virtual:boai-design-content')
  const imports = [...compiled.matchAll(/import \* as document\d+ from "([^"]+)"/g)].map(match => match[1])
  expect(imports.sort()).toEqual(content.pages.map((page: { file: string }) => resolve('ai-docs/design-system', page.file)).sort())
  expect(imports.some(path => /spec|\.folder|AGENTS/.test(path))).toBe(false)
  const components = JSON.parse(files['components.json']).components
  expect(components.every((component: { markdown: string }) => files[component.markdown.slice(1)])).toBe(true)
  expect(searchPages(content.pages, 'Button')[0].slug).toBe('components/button')
  expect(searchPages(content.pages, '   ')).toEqual([])
  expect(searchPages(content.pages, '不存在的组合字词')).toEqual([])
})

it('token directory resolves aliases, reports ownership and fails closed on missing or cyclic references', () => {
  const rows = tokenRows(), light = foundationVariables('light'), dark = foundationVariables('dark')
  expect(rows.map(row => row.name).sort()).toEqual(Object.keys(light).sort())
  expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort())
  for (const row of rows) {
    expect(row.light).toBe(light[row.name]); expect(row.dark).toBe(dark[row.name])
    expect(row.resolvedLight).not.toMatch(/var\(/); expect(row.resolvedDark).not.toMatch(/var\(/)
    expect(row.description.length).toBeGreaterThan(0)
  }
  expect(resolveTokenValue('--a', { '--a': 'var(--b)', '--b': '#123456' })).toBe('#123456')
  expect(() => resolveTokenValue('--a', { '--a': 'var(--missing)' })).toThrow('未定义Token')
  expect(() => resolveTokenValue('--a', { '--a': 'var(--b)', '--b': 'var(--a)' })).toThrow('Token引用循环')
})
