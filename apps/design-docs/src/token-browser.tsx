/*
 * [INPUT]: 公共示例目录、BOAI组件及共享字体/主题。
 * [OUTPUT]: 按需加载的独立文档预览与真实源码。
 * [POS]: 设计站展示层，无业务API。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { tokenGroups, tokenRows, type TokenRow, type TokenGroup } from '@boai/tokens'
import { Button } from '@boai/ui/button'
import { Input } from '@boai/ui/input'
import { SelectField } from '@boai/ui/select-field'
import * as T from '@boai/ui/table'
import { copyText } from './preview'
const rows = tokenRows()
function Swatch({ row, mode }: { row: TokenRow; mode: 'light' | 'dark' }) {
 const value = mode === 'light' ? row.resolvedLight : row.resolvedDark
 const style: CSSProperties = row.type === 'color' ? {background:value} : row.type === 'shadow' ? {boxShadow:value} : row.type === 'radius' ? {borderRadius:value} : row.type === 'font' ? {fontFamily:value} : {}
 return <span className="token-swatch" data-type={row.type} style={style} aria-hidden="true">{row.type === 'font' ? 'Aa 字' : row.type === 'size' || row.type === 'number' ? value : ''}</span>
}
function luminance(value: string) {
 if (!/^#[0-9a-f]{6}$/i.test(value)) return null
 const [r,g,b] = value.slice(1).match(/../g)!.map(channel => {const n=parseInt(channel,16)/255;return n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4})
 return .2126*r+.7152*g+.0722*b
}
function ContrastPairs() {
 const pairs = [['foreground','background'],['muted-foreground','background'],['primary-foreground','primary'],['card-foreground','card'],['popover-foreground','popover']]
 return <details className="token-contrast"><summary>查看默认文字配色的对比度</summary><p>使用默认不透明 sRGB 颜色计算。4.5:1 为普通正文 AA 的参考线；不代表整页或所有状态已经通过无障碍审查。</p><T.Table><T.TableHeader><T.TableRow><T.TableHead>前景 / 背景</T.TableHead><T.TableHead>浅色</T.TableHead><T.TableHead>深色</T.TableHead></T.TableRow></T.TableHeader><T.TableBody>{pairs.map(([fg,bg]) => <T.TableRow key={fg}><T.TableCell>{fg} / {bg}</T.TableCell>{(['light','dark'] as const).map(mode => {
 const fore=rows.find(row => row.name === `--${fg}`)!, back=rows.find(row => row.name === `--${bg}`)!, a=luminance(mode === 'light' ? fore.resolvedLight : fore.resolvedDark), b=luminance(mode === 'light' ? back.resolvedLight : back.resolvedDark)
 const ratio=a === null || b === null ? null : (Math.max(a,b)+.05)/(Math.min(a,b)+.05)
 return <T.TableCell key={mode}>{ratio === null ? '不适用' : `${ratio.toFixed(2)}:1 · ${ratio >= 4.5 ? '达到正文参考线' : '低于正文参考线'}`}</T.TableCell>
 })}</T.TableRow>)}</T.TableBody></T.Table></details>
}
export function TokenBrowser() {
 const [query,setQuery]=useState(''), [group,setGroup]=useState('all')
 const filtered=useMemo(() => rows.filter(row => (group === 'all' || row.group === group) && `${row.name} ${row.description} ${row.references.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())),[query,group])
 return <section className="token-browser" aria-label="Token 浏览器"><div className="token-filters"><Input aria-label="搜索 Token" placeholder="搜索名称、用途或引用…" value={query} onChange={event => setQuery(event.target.value)} /><SelectField aria-label="Token 分组" value={group} onValueChange={setGroup} options={[{value:'all',label:'全部类型'},...Object.entries(tokenGroups).map(([value,label]) => ({value,label}))]} /></div><p className="example-hint">{filtered.length} / {rows.length} 个变量 · 下表为默认值。站点和组件预览中的字体调整不会改写默认值。</p><div className="example-row"><a href="/tokens.json" download>下载 JSON</a><a href="/foundation.css" download>下载 CSS</a><a href="/foundations/tokens.md">Markdown</a><a href="/DESIGN.md">DESIGN.md</a></div><T.Table><T.TableHeader><T.TableRow><T.TableHead>变量 / 用途</T.TableHead><T.TableHead>默认浅色</T.TableHead><T.TableHead>默认深色</T.TableHead><T.TableHead>引用 / 源码</T.TableHead></T.TableRow></T.TableHeader><T.TableBody>{filtered.map(row => <T.TableRow key={row.name} id={`token-${row.name.slice(2)}`}><T.TableCell><Button variant="ghost" size="sm" className="token-name" aria-label={`复制 ${row.name} 变量名`} onClick={() => void copyText(row.name)}>{row.name}</Button><p>{row.description}</p><small>{tokenGroups[row.group as TokenGroup]} · {row.type}</small><Button variant="ghost" size="xs" onClick={() => void copyText(`var(${row.name})`)}>复制 var()</Button></T.TableCell>{(['light','dark'] as const).map(mode => <T.TableCell key={mode}><Swatch row={row} mode={mode} /><code>{row[mode]}</code>{row[mode] !== (mode === 'light' ? row.resolvedLight : row.resolvedDark) && <small>解析后：{mode === 'light' ? row.resolvedLight : row.resolvedDark}</small>}<Button variant="ghost" size="xs" aria-label={`复制 ${row.name} ${mode} 默认值`} onClick={() => void copyText(row[mode])}>复制值</Button></T.TableCell>)}<T.TableCell><code>packages/tokens/src/{row.source}</code>{row.references.map(reference => <a key={reference} href={`#token-${reference.slice(2)}`} onClick={() => {setGroup('all');setQuery('')}}>{reference}</a>)}</T.TableCell></T.TableRow>)}</T.TableBody></T.Table>{!filtered.length && <p role="status">没有匹配的 Token。</p>}<ContrastPairs /></section>
}
