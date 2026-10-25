/*
 * [INPUT]: Lody控件props与现有BOAI Base UI/Markdown组件。
 * [OUTPUT]: 原禁用/事件/选择语义接现有控件；不创建第二套业务状态。
 * [POS]: 迁入UI的宿主连接，评论能力保持未接线。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ComponentProps } from 'react'
import { Button as HostButton } from '@/components/ui/button'
import { Input as HostInput } from '@/components/ui/input'
import { Textarea as HostTextarea } from '@/components/ui/textarea'
import { Spinner as HostSpinner } from '@/components/ui/spinner'
import { Select as Root, SelectContent as Content, SelectItem as Item, SelectValue as Value, SelectTrigger } from '@/components/ui/select'
import { Avatar as HostAvatar, AvatarImage as Image, AvatarFallback as Fallback } from '@/components/ui/avatar'
import { Markdown } from '@/components/common/markdown'
import { FileText } from '@/components/icons'
export { Badge } from '@/components/ui/badge'
export function Button({ size, icon, variant, ...props }: Omit<ComponentProps<typeof HostButton>, 'size' | 'variant'> & { variant?: ComponentProps<typeof HostButton>['variant'] | 'primary'; size?: 'mini' | 'small' | 'medium' | 'large'; icon?: boolean }) {
  return <HostButton {...props} variant={variant === 'primary' ? 'default' : variant} size={icon ? 'icon-sm' : size === 'large' ? 'lg' : 'sm'} />
}
export function Input({ size: _size, ...props }: Omit<ComponentProps<typeof HostInput>, 'size'> & { size?: string }) { return <HostInput {...props} className={`h-7 ${props.className ?? ''}`} /> }
export function Spinner({ label, ...props }: ComponentProps<typeof HostSpinner> & { label?: string | null }) { return <HostSpinner {...props} aria-label={label ?? undefined} /> }
export const Select = { Root, Content, Item, Value, Trigger: ({ size: _size, ...props }: Omit<ComponentProps<typeof SelectTrigger>, 'size'> & { size?: string }) => <SelectTrigger {...props} size="sm" /> }
export function Textarea({ resize, ...props }: ComponentProps<typeof HostTextarea> & { resize?: string }) { return <HostTextarea {...props} style={{ ...props.style, resize: resize === 'none' ? 'none' : undefined }} /> }
export const Avatar = { Root: ({ size: _size, ...props }: Omit<ComponentProps<typeof HostAvatar>, 'size'> & { size?: string }) => <HostAvatar {...props} size="sm" />, Image, Fallback }
export function UserAvatar({ user }: { user: { id: string; name?: string | null; image?: string | null }; size?: string }) { return <HostAvatar size="sm"><Fallback>{user.name?.slice(0, 2)}</Fallback></HostAvatar> }
export function FileIcon({ filePath: _filePath, ...props }: ComponentProps<typeof FileText> & { filePath: string }) { return <FileText {...props} /> }
export function MarkdownRenderer({ text, className }: { text: string; size?: string; allowHtml?: boolean; className?: string }) { return <div className={className}><Markdown>{text}</Markdown></div> }
