/*
 * [OUTPUT]: 2026-10-20文字尺寸与行高接入共享字体角色，随外观设置即时缩放。
 * [INPUT]: InputGroup 原语、标准表单属性与宿主传入的内容/事件。
 * [OUTPUT]: 保留大圆角与紧凑布局的聊天输入表面，内侧细边缘/高光复用 Button control、无底部外侧阴影，文本框聚焦保持中性边缘；两行文本框、分侧操作栏和权限/模型菜单控件；不管理会话运行时。
 * [POS]: @boai/ui共享实现；原归属： components/ui 的聊天输入组合，业务与组件验收页共用。
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
  return <InputGroupTextarea className={cn('chat-composer-input min-h-[44px] max-h-[240px] px-1 py-0 text-[length:var(--text-content-body)] font-[family-name:var(--font-content-family)] leading-[1.6] md:text-[length:var(--text-content-body)]', className)} rows={2} {...props} />
}
function ChatComposerFooter({ className, ...props }: ComponentProps<typeof InputGroupAddon>) {
  return <InputGroupAddon align="block-end" className={cn('chat-composer-footer justify-between p-0', className)} {...props} />
}
function ChatComposerActions({ align = 'start', className, ...props }: ComponentProps<'div'> & { align?: 'start' | 'end' }) {
  return <div className={cn('chat-composer-actions', className)} data-align={align} {...props} />
}
function ChatComposerSelect({ kind, className, ...props }: ComponentProps<typeof Button> & { kind: 'permission' | 'model' }) {
  return <Button variant="ghost" size="sm" className={cn('chat-composer-select min-w-0 max-w-[220px] gap-[5px] text-[length:var(--text-ui-secondary)] font-normal', className)} data-kind={kind} {...props} />
}
function ChatComposerOption({ label, description }: { label: string; description: string }) {
  return <span className="chat-composer-option"><span>{label}</span><small>{description}</small></span>
}
export { ChatComposer, ChatComposerInput, ChatComposerFooter, ChatComposerActions, ChatComposerSelect, ChatComposerOption }
