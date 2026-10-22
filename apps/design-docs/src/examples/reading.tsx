/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { CodeBlock } from '@boai/ui/code-block'
import { Typeset, TypesetCode } from '@boai/ui/typeset'
export default function Reading() {
 const [line,setLine] = useState<number>()
 return <div className="example-stack"><Typeset><h2>清晰的阅读层级</h2><p>正文沿统一字体角色，支持 <strong>重点</strong>、<em>强调</em> 和 <a href="/foundations/tokens" target="_top">语义 Token</a>。</p><blockquote>引用保留内容来源，预览不接入业务链接协议。</blockquote><ul><li>内容字体独立缩放</li><li>代码使用独立等宽字体</li></ul></Typeset><CodeBlock code={'const message = "Hello BOAI";\nconsole.log(message);\n'} language="typescript" lineNumbers selectedLine={line} onLineSelect={setLine} /><output>{line ? `已定位第 ${line} 行` : '点击行号定位'}</output><TypesetCode>紧凑的工具输出与只读日志。</TypesetCode></div>
}
