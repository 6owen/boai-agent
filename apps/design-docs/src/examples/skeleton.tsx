/*
 * [INPUT]: BOAI共享组件与局部示例状态。
 * [OUTPUT]: skeleton真实示例；页面展示此文件的实际源码。
 * [POS]: 设计站公开示例，不连接BOAI业务服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useState } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@boai/ui'

export default function SkeletonExample() {
  const [loading, setLoading] = useState(true)
  return <div className="example-stack example-form"><div className="example-row"><Button variant="secondary" size="sm" onClick={() => setLoading(!loading)}>{loading ? '显示内容' : '显示骨架'}</Button><span className="example-hint">结构保持，内容原位替换</span></div>
    <Card className="skeleton-demo" aria-busy={loading}><CardHeader><CardTitle>{loading ? <Skeleton className="h-4 w-32" /> : '资料已就绪'}</CardTitle><CardDescription>{loading ? <Skeleton className="h-3 w-24" /> : '刚刚更新'}</CardDescription></CardHeader><CardContent><div className="example-loading-body">{loading ? <><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></> : <p>数据到达后，标题、内容和操作仍留在原来的位置。</p>}</div></CardContent></Card>
  </div>
}
