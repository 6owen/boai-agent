/*
 * [INPUT]: 公共tokens、原应用兼容入口及公开设计目录。
 * [OUTPUT]: 具名对象参数覆盖普通/开发条件Node消费、同一实现、完整变量闭包与公开内容白名单回归。
 * [POS]: 设计系统模块合同，CI执行；不替代桌面或浏览器验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { baseThemes, foundationCss, foundationVariables, themeTokens, typographyDefaults, typographyVariables, resolveTypography } from '@boai/tokens'
import { resolveTypography as hostTypography } from '../src/shared/appearance/typography'
import { themeTokens as hostThemeTokens } from '../src/shared/appearance'
import { searchPages } from '../apps/design-docs/src/search'
// @ts-expect-error Shared Node public-content generator has no declaration file.
import { readDesignContent, designPublicFiles } from '../scripts/design-content.mjs'

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
  expect(content.pages).toHaveLength(12)
  expect(content.components).toHaveLength(10)
  expect(files['overview.md']).toContain('一套语言')
  expect(files['overview.md']).not.toContain('[PROTOCOL]')
  expect(files['llms.txt']).not.toMatch(/ai-docs\/spec|AGENTS\.md|\.folder\.md/)
  const components = JSON.parse(files['components.json']).components
  expect(components.every((component: { markdown: string }) => files[component.markdown.slice(1)])).toBe(true)
  expect(searchPages(content.pages, 'Button')[0].slug).toBe('components/button')
  expect(searchPages(content.pages, '   ')).toEqual([])
  expect(searchPages(content.pages, '不存在的组合字词')).toEqual([])
})
