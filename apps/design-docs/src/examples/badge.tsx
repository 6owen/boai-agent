/*
 * [INPUT]: BOAI共享组件与局部示例状态。
 * [OUTPUT]: badge真实示例；页面展示此文件的实际源码。
 * [POS]: 设计站公开示例，不连接BOAI业务服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Badge, Separator } from '@boai/ui'

export default function BadgeExample() {
  return <div className="example-stack example-form"><div className="example-row"><Badge>默认</Badge><Badge variant="secondary">进行中</Badge><Badge variant="outline">可选</Badge><Badge variant="destructive">失败</Badge></div><Separator /><p className="example-hint">一条细线，划分相关内容的层级。</p><div className="example-row"><span>横向</span><Separator orientation="vertical" className="h-4" /><span>纵向</span></div></div>
}
