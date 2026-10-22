/*
 * [INPUT]: BOAI共享组件与局部示例状态。
 * [OUTPUT]: button真实示例；页面展示此文件的实际源码。
 * [POS]: 设计站公开示例，不连接BOAI业务服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useState } from 'react'
import { Button } from '@boai/ui'

export default function ButtonExample() {
  const [count, setCount] = useState(0)
  return <div className="example-stack"><div className="example-row">
    <Button onClick={() => setCount(count + 1)}>保存更改</Button>
    <Button variant="secondary">取消</Button><Button variant="ghost">更多</Button><Button disabled>不可用</Button>
  </div><div className="example-row"><Button size="xs">小号</Button><Button size="sm" variant="secondary">紧凑</Button><Button size="lg" variant="outline">大号</Button><Button variant="destructive" size="sm">删除</Button></div>
  <p className="example-hint" aria-live="polite">{count ? `已点击保存 ${count} 次` : '试试主操作，也可以用 Tab 在按钮间移动。'}</p></div>
}
