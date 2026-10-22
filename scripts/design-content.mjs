/*
 * [OUTPUT]: 公开38页、DESIGN别名、Token下载与preview静态路由；内部规格不发布。
 * [INPUT]: ai-docs/design-system/catalog.json登记的公开Markdown。
 * [OUTPUT]: 白名单Fumadocs文档导入、同源搜索数据、Markdown及Agent索引。
 * [POS]: 设计站Vite插件与公开内容生成器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const directory = fileURLToPath(new URL('../ai-docs/design-system/', import.meta.url))
const virtualId = 'virtual:boai-design-content'
const tokenSource = fileURLToPath(new URL('../packages/tokens/src/', import.meta.url))
const tokenEntry = fileURLToPath(new URL('../packages/tokens/dist/index.js', import.meta.url))

export async function readDesignContent() {
  const tokenModule = await import(`${pathToFileURL(tokenEntry).href}?version=${(await stat(tokenEntry)).mtimeMs}`)
  const catalog = JSON.parse(await readFile(resolve(directory, 'catalog.json'), 'utf8'))
  const slugs = new Set()
  const pages = await Promise.all(catalog.pages.map(async page => {
    if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(page.slug) || slugs.has(page.slug)) throw new Error(`Invalid or duplicate design page: ${page.slug}`)
    slugs.add(page.slug)
    if (page.file !== 'DESIGN.md' && !/^[a-z0-9-]+\.md$/.test(page.file)) throw new Error(`Invalid design content file: ${page.file}`)
    const source = await readFile(resolve(directory, page.file), 'utf8')
    let body = source.replace(/^<!--[\s\S]*?-->\s*/, '') + (page.slug === 'foundations/tokens' ? tokenModule.tokenMarkdown() : '')
    if (page.slug === 'components') body += '\n' + catalog.components.map(component => `- [${component.name}](/${component.slug}#api-${component.import.split('/').pop()}): ${component.import} — ${component.exports.join(', ')}`).join('\n') + '\n'
    return { ...page, body, path: page.slug === 'overview' ? '/' : `/${page.slug}` }
  }))
  for (const component of catalog.components) {
    if (!slugs.has(component.slug)) throw new Error(`Component has no design page: ${component.name}`)
  }
  return { version: catalog.version, components: catalog.components, pages, generated: { tokens: JSON.stringify(tokenModule.tokenDocument(catalog.version), null, 2) + '\n', css: tokenModule.foundationCss() } }
}

export function designPublicFiles(content) {
  const files = Object.fromEntries(content.pages.map(page => [`${page.slug}.md`, page.body]))
  files['DESIGN.md'] = content.pages.find(page => page.file === 'DESIGN.md')?.body ?? ''
  files['tokens.json'] = content.generated.tokens
  files['foundation.css'] = content.generated.css
  files['llms.txt'] = '# BOAI Design\n\n' + content.pages.map(page => `- [${page.title}](/${page.slug}.md): ${page.description}`).join('\n') + '\n'
  files['llms-full.txt'] = content.pages.map(page => `# ${page.title}\n\n${page.body}`).join('\n\n')
  files['components.json'] = JSON.stringify({ version: content.version, components: content.components.map(component => ({ ...component, url: `/${component.slug}`, markdown: `/${component.slug}.md` })) }, null, 2) + '\n'
  return files
}

export function designContentPlugin() {
  let content
  const reload = async () => { content = await readDesignContent() }
  return {
    name: 'boai-public-design-content',
    enforce: 'post',
    async buildStart() {
      await reload()
      this.addWatchFile(resolve(directory, 'catalog.json'))
      for (const page of content.pages) this.addWatchFile(resolve(directory, page.file))
    },
    resolveId(id) { if (id === virtualId) return '\0' + virtualId },
    async load(id) {
      if (id === '\0' + virtualId) {
        await reload()
        const imports = content.pages.map((page, index) => `import * as document${index} from ${JSON.stringify(resolve(directory, page.file))};`)
        const documents = content.pages.map((page, index) => `${JSON.stringify(page.slug)}: document${index}`)
        return `${imports.join('\n')}\nexport const documents = {${documents.join(',')}};\nexport default ${JSON.stringify({ version: content.version, components: content.components, pages: content.pages })}`
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        try {
          const key = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1)
          if (!key.endsWith('.md') && !['llms.txt', 'llms-full.txt', 'components.json', 'tokens.json', 'foundation.css'].includes(key)) return next()
          await reload()
          const body = designPublicFiles(content)[key]
          if (body === undefined) return next()
          response.setHeader('Content-Type', key.endsWith('.json') ? 'application/json; charset=utf-8' : key.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8')
          response.end(body)
        } catch (error) { next(error) }
      })
    },
    async handleHotUpdate(context) {
      if ((context.file.startsWith(directory) && /\.(md|json)$/.test(context.file)) || (context.file.startsWith(tokenSource) && context.file.endsWith('.ts'))) {
        await reload()
        const module = context.server.moduleGraph.getModuleById('\0' + virtualId)
        if (module) context.server.moduleGraph.invalidateModule(module)
        context.server.ws.send({ type: 'full-reload' })
        return []
      }
    },
    generateBundle(_options, bundle) {
      for (const [fileName, source] of Object.entries(designPublicFiles(content))) this.emitFile({ type: 'asset', fileName, source })
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') throw new Error('Design site build did not produce index.html')
      this.emitFile({ type: 'asset', fileName: 'preview/index.html', source: index.source })
      for (const page of content.pages.filter(page => page.path !== '/')) {
        this.emitFile({ type: 'asset', fileName: `${page.slug}/index.html`, source: index.source })
      }
    },
  }
}
