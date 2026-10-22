/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { Button } from '@boai/ui/button'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@boai/ui/accordion'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@boai/ui/collapsible'
export default function Expand() {
 return <div className="example-stack"><Accordion>{['组件来自哪里？','如何切换主题？'].map((title,index) => <AccordionItem value={String(index)} key={title}><AccordionTrigger>{title}</AccordionTrigger><AccordionContent>{index ? '主题统一来自 @boai/tokens。' : '桌面与文档消费同一份 @boai/ui 源码。'}</AccordionContent></AccordionItem>)}</Accordion><Collapsible><CollapsibleTrigger render={<Button variant="secondary" />}>高级选项</CollapsibleTrigger><CollapsibleContent><p>折叠区域保留原语的展开、焦点与键盘行为。</p></CollapsibleContent></Collapsible></div>
}
