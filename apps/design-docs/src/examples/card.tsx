/*
 * [INPUT]: BOAI共享组件与局部示例状态。
 * [OUTPUT]: card真实示例；页面展示此文件的实际源码。
 * [POS]: 设计站公开示例，不连接BOAI业务服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@boai/ui'
import { toast } from 'sonner'

export default function CardExample() {
  return <Card className="example-card"><CardHeader><CardTitle>设计资料</CardTitle><CardDescription>一个主题，一张卡片。</CardDescription><CardAction><Badge variant="secondary">共享</Badge></CardAction></CardHeader><CardContent><p>组件、表面和设计指南使用相同定义，让每个入口保持熟悉。</p></CardContent><CardFooter><Button size="sm" onClick={() => toast('示例资料已打开')}>查看资料</Button></CardFooter></Card>
}
