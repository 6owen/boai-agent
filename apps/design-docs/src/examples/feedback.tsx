/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { Button } from '@boai/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@boai/ui/alert'
import { Toaster as LegacyToaster, toast as legacyToast } from '@boai/ui/toast'
export default function Feedback() {
 return <div className="example-stack"><Alert><AlertTitle>说明</AlertTitle><AlertDescription>Alert 仅用于静态信息。BOAI 操作错误统一使用 Sonner。</AlertDescription></Alert><LegacyToaster><Button variant="secondary" onClick={() => legacyToast.add({ title:'旧版 Toast 展示', description:'仅用于兼容已有消费方，新代码使用 Sonner。', type:'info' })}>旧版 Toast（兼容）</Button></LegacyToaster></div>
}
