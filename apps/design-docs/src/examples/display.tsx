/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { Avatar, AvatarFallback, AvatarImage } from '@boai/ui/avatar'
import { Marker, MarkerIcon, MarkerContent } from '@boai/ui/marker'
import { Badge } from '@boai/ui/badge'
import { Kbd, KbdGroup } from '@boai/ui/kbd'
import * as T from '@boai/ui/table'
import * as C from '@boai/ui/carousel'
export default function Display() {
 return <div className="example-stack"><div className="example-row"><Avatar><AvatarImage src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23465fff'/%3E%3Ctext x='20' y='27' text-anchor='middle' fill='white' font-size='22'%3EB%3C/text%3E%3C/svg%3E" alt="BOAI 示例头像" /><AvatarFallback>B</AvatarFallback></Avatar><Avatar><AvatarFallback>WW</AvatarFallback></Avatar><Badge>在线</Badge><Marker><MarkerIcon>●</MarkerIcon><MarkerContent>新内容</MarkerContent></Marker><KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup></div><T.Table><T.TableCaption>本地示例数据</T.TableCaption><T.TableHeader><T.TableRow><T.TableHead>项目</T.TableHead><T.TableHead>状态</T.TableHead></T.TableRow></T.TableHeader><T.TableBody>{['文档','组件','主题'].map(item => <T.TableRow key={item}><T.TableCell>{item}</T.TableCell><T.TableCell>进行中</T.TableCell></T.TableRow>)}</T.TableBody></T.Table><C.Carousel className="mx-12"><C.CarouselContent>{[1,2,3].map(value => <C.CarouselItem key={value}><div className="example-slide">页面 {value}</div></C.CarouselItem>)}</C.CarouselContent><C.CarouselPrevious /><C.CarouselNext /></C.Carousel></div>
}
