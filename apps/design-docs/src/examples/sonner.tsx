/*
 * [INPUT]: BOAI共享组件与局部示例状态。
 * [OUTPUT]: sonner真实示例；页面展示此文件的实际源码。
 * [POS]: 设计站公开示例，不连接BOAI业务服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Button } from '@boai/ui'
import { toast } from 'sonner'

export default function SonnerExample() {
  return <div className="example-row"><Button onClick={() => toast.success('已保存')}>成功提示</Button><Button variant="secondary" onClick={() => toast.error('保存失败，请在原位置重试。')}>错误提示</Button><Button variant="ghost" onClick={() => toast('资料已更新')}>普通提示</Button></div>
}
