/*
 * [INPUT]: 显式公开目录生成的虚拟模块。
 * [OUTPUT]: 站点内容与组件索引的类型合同。
 * [POS]: 设计站构建期内容类型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
declare module 'virtual:boai-design-content' {
  export interface DesignPage { slug: string; path: string; title: string; section: string; description: string; file: string; example: string; body: string }
  export interface DesignComponent { name: string; slug: string; status: string; import: string; exports: string[] }
  const content: { version: string; pages: DesignPage[]; components: DesignComponent[] }
  export default content
}
