/*
 * [INPUT]: 公共示例目录、BOAI组件及共享字体/主题。
 * [OUTPUT]: 按需加载的独立文档预览与真实源码。
 * [POS]: 设计站展示层，无业务API。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import content from 'virtual:boai-design-content'
import { CodeSample } from './preview'
const sources = import.meta.glob<string>('../../../packages/ui/src/components/*.tsx', { query:'?raw', import:'default' })
function Source({ name }: { name: string }) {
 const [source,setSource]=useState('')
 return <details onToggle={event => { if(event.currentTarget.open && !source) void sources[`../../../packages/ui/src/components/${name}.tsx`]?.().then(text => setSource(text.replace(/^\/\*[\s\S]*?\*\/\s*/,''))) }}><summary>查看 {name} 的属性类型与实现</summary>{source ? <CodeSample label="实际源码 · React.ComponentProps 可推导完整属性" code={source} /> : <p>加载源码…</p>}</details>
}
export function ComponentReference({ slug }: {slug: string}) {
 const { hash } = useLocation()
 useEffect(() => {
  if (!hash.startsWith('#api-')) return
  const target = document.getElementById(hash.slice(1))
  if (target instanceof HTMLDetailsElement) { target.open=true; target.scrollIntoView({block:'start'}) }
 }, [hash,slug])
 const components=content.components.filter(component => component.slug === slug)
 return components.length ? <section className="component-reference" aria-label="组件 API"><h2>导入与 API</h2>{components.map(component => <details key={component.import} id={`api-${component.import.split('/').pop()}`}><summary><span role="heading" aria-level={3}>{component.name}</span> · {component.status === 'compatibility' ? '兼容' : '共享实现'}</summary><CodeSample code={`import { ${component.exports.slice(0,5).map(name => component.types.includes(name) ? `type ${name}` : name).join(', ')} } from '${component.import}'`} /><p className="example-hint">公开导出：{component.exports.join('、')}</p><p>React组件属性可用 <code>React.ComponentProps&lt;typeof Component&gt;</code> 推导；函数参数可用 <code>Parameters&lt;typeof fn&gt;</code> 获取。下方为预览实际消费的源码。</p><Source name={component.import.split('/').pop()!} /></details>)}</section> : null
}
