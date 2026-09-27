/*
 * [INPUT]: InputGroup 原语、标准表单属性与宿主传入的内容/事件。
 * [OUTPUT]: 紧凑聊天输入表面、两行文本框、分侧操作栏和权限/模型菜单控件；不管理会话运行时。
 * [POS]: components/ui 的聊天输入组合，业务与组件验收页共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { InputGroup, InputGroupAddon, InputGroupTextarea } from './input-group'
import { Button } from './button'

function ChatComposer({ className, ...props }: ComponentProps<typeof InputGroup>) {
  return <InputGroup variant="composer" data-slot="chat-composer" className={className} {...props} />
}
function ChatComposerInput({ className, ...props }: ComponentProps<typeof InputGroupTextarea>) {
  return <InputGroupTextarea className={cn('chat-composer-input min-h-[44px] max-h-[240px] px-1 py-0 text-[13px] leading-[1.6] md:text-[13px]', className)} rows={2} {...props} />
}
function ChatComposerFooter({ className, ...props }: ComponentProps<typeof InputGroupAddon>) {
  return <InputGroupAddon align="block-end" className={cn('chat-composer-footer justify-between p-0', className)} {...props} />
}
function ChatComposerActions({ align = 'start', className, ...props }: ComponentProps<'div'> & { align?: 'start' | 'end' }) {
  return <div className={cn('chat-composer-actions', className)} data-align={align} {...props} />
}
function ChatComposerSelect({ kind, className, ...props }: ComponentProps<typeof Button> & { kind: 'permission' | 'model' }) {
  return <Button variant="ghost" size="sm" className={cn('chat-composer-select min-w-0 max-w-[220px] gap-[5px] text-[12px] font-normal', className)} data-kind={kind} {...props} />
}
function ChatComposerOption({ label, description }: { label: string; description: string }) {
  return <span className="chat-composer-option"><span>{label}</span><small>{description}</small></span>
}
export { ChatComposer, ChatComposerInput, ChatComposerFooter, ChatComposerActions, ChatComposerSelect, ChatComposerOption }
