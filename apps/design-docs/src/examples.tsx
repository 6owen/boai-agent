/*
 * [INPUT]: 公共示例目录、BOAI组件及共享字体/主题。
 * [OUTPUT]: 按需加载的独立文档预览与真实源码。
 * [POS]: 设计站展示层，无业务API。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { lazy, Suspense, type ComponentType } from 'react'
import { Preview } from './preview'
const modules = import.meta.glob<{ default: ComponentType }>('./examples/*.tsx')
const examples = Object.fromEntries(Object.entries(modules).map(([path, loader]) => [path.split('/').pop()!.replace('.tsx', ''), lazy(loader)]))
const sources = import.meta.glob<string>('./examples/*.tsx', { query: '?raw', import: 'default' })
export const hasExample = (name: string) => name in examples
export async function exampleSource(name: string) { return (await sources[`./examples/${name}.tsx`]?.())?.replace(/^\/\*[\s\S]*?\*\/\s*/, '') ?? '' }
export function ExampleContent({ name }: { name: string }) {
 const Example = examples[name]
 return Example ? <Suspense fallback={<p role="status">加载示例…</p>}><Example /></Suspense> : <p>示例不存在</p>
}
export function ComponentExample({ name, title }: { name: string; title: string }) {
 return hasExample(name) ? <Preview name={name} label={title} /> : null
}
