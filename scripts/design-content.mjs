/*
 * [INPUT]: ai-docs/design-system/catalog.json登记的公开Markdown。
 * [OUTPUT]: 同源页面、搜索数据、Markdown及Agent索引；只读取白名单内容。
 * [POS]: 设计站Vite插件与公开内容生成器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const directory = fileURLToPath(new URL('../ai-docs/design-system/', import.meta.url))
const virtualId = 'virtual:boai-design-content'

export async function readDesignContent() {
  const catalog = JSON.parse(await readFile(resolve(directory, 'catalog.json'), 'utf8'))
  const slugs = new Set()
  const pages = await Promise.all(catalog.pages.map(async page => {
    if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(page.slug) || slugs.has(page.slug)) throw new Error(`Invalid or duplicate design page: ${page.slug}`)
    slugs.add(page.slug)
    if (!/^[a-z0-9-]+\.md$/.test(page.file)) throw new Error(`Invalid design content file: ${page.file}`)
    const source = await readFile(resolve(directory, page.file), 'utf8')
    const body = source.replace(/^<!--[\s\S]*?-->\s*/, '')
    return { ...page, body, path: page.slug === 'overview' ? '/' : `/${page.slug}` }
  }))
  for (const component of catalog.components) {
    if (!slugs.has(component.slug)) throw new Error(`Component has no design page: ${component.name}`)
  }
  return { version: catalog.version, components: catalog.components, pages }
}

export function designPublicFiles(content) {
  const files = Object.fromEntries(content.pages.map(page => [`${page.slug}.md`, page.body]))
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
        return `export default ${JSON.stringify(content)}`
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        try {
          const key = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1)
          if (!key.endsWith('.md') && !['llms.txt', 'llms-full.txt', 'components.json'].includes(key)) return next()
          await reload()
          const body = designPublicFiles(content)[key]
          if (body === undefined) return next()
          response.setHeader('Content-Type', key.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8')
          response.end(body)
        } catch (error) { next(error) }
      })
    },
    async handleHotUpdate(context) {
      if (context.file.startsWith(directory) && /\.(md|json)$/.test(context.file)) {
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
      for (const page of content.pages.filter(page => page.path !== '/')) {
        this.emitFile({ type: 'asset', fileName: `${page.slug}/index.html`, source: index.source })
      }
    },
  }
}
