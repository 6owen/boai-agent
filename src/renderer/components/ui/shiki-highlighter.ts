/*
 * [INPUT]: 代码文本、语言标识与 Shiki 的本地语言/主题模块。
 * [OUTPUT]: 单例 JavaScript 引擎、聊天围栏与文件预览常用语言按需加载、明暗双色 tokens；未知语言/超长代码保留纯文本。
 * [POS]: UI CodeBlock 的延迟加载高亮实现，不读取业务状态、不请求 CDN。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import type { HighlighterCore, DynamicImportLanguageRegistration } from 'shiki/types'
import { FILE_PREVIEW_LIMITS } from '@shared/domain/file-preview'

const languages: { id: string; aliases?: string[]; load: DynamicImportLanguageRegistration }[] = [
  { id: 'javascript', aliases: ['js', 'mjs', 'cjs'], load: () => import('shiki/langs/javascript.mjs') },
  { id: 'typescript', aliases: ['ts', 'mts', 'cts'], load: () => import('shiki/langs/typescript.mjs') },
  { id: 'jsx', load: () => import('shiki/langs/jsx.mjs') },
  { id: 'tsx', load: () => import('shiki/langs/tsx.mjs') },
  { id: 'json', load: () => import('shiki/langs/json.mjs') },
  { id: 'jsonc', load: () => import('shiki/langs/jsonc.mjs') },
  { id: 'yaml', aliases: ['yml'], load: () => import('shiki/langs/yaml.mjs') },
  { id: 'toml', load: () => import('shiki/langs/toml.mjs') },
  { id: 'shellscript', aliases: ['bash', 'sh', 'shell', 'zsh'], load: () => import('shiki/langs/shellscript.mjs') },
  { id: 'powershell', aliases: ['ps1', 'pwsh'], load: () => import('shiki/langs/powershell.mjs') },
  { id: 'python', aliases: ['py'], load: () => import('shiki/langs/python.mjs') },
  { id: 'go', load: () => import('shiki/langs/go.mjs') },
  { id: 'rust', aliases: ['rs'], load: () => import('shiki/langs/rust.mjs') },
  { id: 'java', load: () => import('shiki/langs/java.mjs') },
  { id: 'c', load: () => import('shiki/langs/c.mjs') },
  { id: 'cpp', aliases: ['c++'], load: () => import('shiki/langs/cpp.mjs') },
  { id: 'csharp', aliases: ['cs', 'c#'], load: () => import('shiki/langs/csharp.mjs') },
  { id: 'ruby', aliases: ['rb'], load: () => import('shiki/langs/ruby.mjs') },
  { id: 'php', load: () => import('shiki/langs/php.mjs') },
  { id: 'swift', load: () => import('shiki/langs/swift.mjs') },
  { id: 'html', load: () => import('shiki/langs/html.mjs') },
  { id: 'css', load: () => import('shiki/langs/css.mjs') },
  { id: 'scss', load: () => import('shiki/langs/scss.mjs') },
  { id: 'vue', load: () => import('shiki/langs/vue.mjs') },
  { id: 'svelte', load: () => import('shiki/langs/svelte.mjs') },
  { id: 'sql', load: () => import('shiki/langs/sql.mjs') },
  { id: 'graphql', aliases: ['gql'], load: () => import('shiki/langs/graphql.mjs') },
  { id: 'dockerfile', aliases: ['docker'], load: () => import('shiki/langs/dockerfile.mjs') },
  { id: 'diff', aliases: ['patch'], load: () => import('shiki/langs/diff.mjs') },
  { id: 'markdown', aliases: ['md'], load: () => import('shiki/langs/markdown.mjs') },
  { id: 'xml', load: () => import('shiki/langs/xml.mjs') },
  { id: 'less', load: () => import('shiki/langs/less.mjs') },
  { id: 'ini', load: () => import('shiki/langs/ini.mjs') },
  { id: 'fish', load: () => import('shiki/langs/fish.mjs') },
  { id: 'kotlin', aliases: ['kt', 'kts'], load: () => import('shiki/langs/kotlin.mjs') },
  { id: 'r', load: () => import('shiki/langs/r.mjs') },
  { id: 'lua', load: () => import('shiki/langs/lua.mjs') },
  { id: 'perl', aliases: ['pl'], load: () => import('shiki/langs/perl.mjs') },
  { id: 'dart', load: () => import('shiki/langs/dart.mjs') },
  { id: 'makefile', load: () => import('shiki/langs/makefile.mjs') },
  { id: 'cmake', load: () => import('shiki/langs/cmake.mjs') },
  { id: 'latex', aliases: ['tex'], load: () => import('shiki/langs/latex.mjs') },
  { id: 'log', load: () => import('shiki/langs/log.mjs') },
  { id: 'csv', load: () => import('shiki/langs/csv.mjs') },
  { id: 'dotenv', load: () => import('shiki/langs/dotenv.mjs') },
]
const languageByName = new Map(languages.flatMap(language => [language.id, ...(language.aliases ?? [])].map(name => [name, language] as const)))
const languageLoads = new Map<string, Promise<void>>()
const MAX_HIGHLIGHT_LENGTH = 100_000
let highlighter: Promise<HighlighterCore> | undefined

function getHighlighter() {
  return highlighter ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  }).catch(error => { highlighter = undefined; throw error })
}

export async function highlightCode(code: string, language: string) {
  const grammar = languageByName.get(language.toLowerCase())
  if (!grammar || code.length > MAX_HIGHLIGHT_LENGTH || code.split(/\r\n?|\n/, FILE_PREVIEW_LIMITS.lines + 1).length > FILE_PREVIEW_LIMITS.lines) return null
  const instance = await getHighlighter()
  let loading = languageLoads.get(grammar.id)
  if (!loading) {
    loading = instance.loadLanguage(grammar.load).catch(error => { languageLoads.delete(grammar.id); throw error })
    languageLoads.set(grammar.id, loading)
  }
  await loading
  return instance.codeToTokensWithThemes(code, { lang: grammar.id, themes: { light: 'github-light', dark: 'github-dark' } })
}
