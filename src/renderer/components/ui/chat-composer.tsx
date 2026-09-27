/*
 * [INPUT]: InputGroup 原语、标准表单属性与宿主传入的内容/事件。
 * [OUTPUT]: 6owen 风格的聊天输入表面、文本框与操作栏；不管理会话运行时。
 * [POS]: components/ui 的聊天输入组合，业务与组件验收页共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { InputGroup, InputGroupAddon, InputGroupTextarea } from './input-group'

function ChatComposer({ className, ...props }: ComponentProps<typeof InputGroup>) {
  return <InputGroup variant="composer" data-slot="chat-composer" className={className} {...props} />
}
function ChatComposerInput({ className, ...props }: ComponentProps<typeof InputGroupTextarea>) {
  return <InputGroupTextarea className={cn('chat-composer-input min-h-[80px] max-h-[240px] px-1 py-0 text-[14px] leading-[1.65] md:text-[14px]', className)} rows={3} {...props} />
}
function ChatComposerFooter({ className, ...props }: ComponentProps<typeof InputGroupAddon>) {
  return <InputGroupAddon align="block-end" className={cn('chat-composer-footer justify-between p-0', className)} {...props} />
}
export { ChatComposer, ChatComposerInput, ChatComposerFooter }
