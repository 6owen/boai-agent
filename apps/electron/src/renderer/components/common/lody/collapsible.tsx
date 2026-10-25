/*
 * [INPUT]: Lody的collapsible控制props与BOAI Base UI原语。
 * [OUTPUT]: Root/Trigger/Content接口与状态属性适配；使用现有渲染原语。
 * [POS]: 迁入diff卡的宿主控件接线。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { isValidElement, type ComponentProps } from 'react'
import { Collapsible as HostRoot, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
export type CollapsibleProps = ComponentProps<typeof HostRoot>
export function Root(props: CollapsibleProps) { return <HostRoot render={(attributes, state) => <div {...attributes} data-state={state.open ? 'open' : 'closed'} />} {...props} /> }
export function Trigger({ asChild, children, ...props }: ComponentProps<typeof CollapsibleTrigger> & { asChild?: boolean }) { return <CollapsibleTrigger {...props} nativeButton={!asChild || !isValidElement(children) || typeof children.type !== 'string' || children.type === 'button'} render={asChild && isValidElement(children) ? children : undefined}>{asChild ? undefined : children}</CollapsibleTrigger> }
export const Content = (props: ComponentProps<typeof CollapsibleContent>) => <CollapsibleContent render={(attributes, state) => <div {...attributes} data-state={state.open ? 'open' : 'closed'} />} {...props} />
