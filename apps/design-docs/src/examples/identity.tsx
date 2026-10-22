/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { GroupAvatarView } from '@boai/ui/group-avatar'
import { UserAvatarView } from '@boai/ui/user-avatar'
import { IllustratedEmptyView } from '@boai/ui/illustrated-empty'
const illustration = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 184'%3E%3Crect x='60' y='40' width='120' height='104' rx='24' fill='%23eef1ff'/%3E%3Cpath d='M90 90h60M90 110h40' stroke='%23465fff' stroke-width='6' stroke-linecap='round'/%3E%3C/svg%3E"
export default function Identity() {
 return <div className="example-stack"><div className="example-row"><UserAvatarView source={illustration} fallback={illustration} preset />{[0,2,5,9].map(count => <GroupAvatarView key={count} members={Array.from({length:count},(_,index) => ({id:String(index),content:<span className="avatar bg-muted">{index+1}</span>}))} />)}</div><IllustratedEmptyView src={illustration} alt="示例文档插画" title="还没有内容" /><p className="example-hint">展示层接收图片与成员节点；桌面继续使用原离线头像和插画资源。</p></div>
}
