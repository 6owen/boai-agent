/*
 * [INPUT]: 操作错误或受控加载/校验错误、既有全局Sonner。
 * [OUTPUT]: 错误只通过toast显示；相同错误去重、重渲染不重复通知，不在业务DOM插入报错。
 * [POS]: 全系统错误反馈入口，业务状态和重试操作由调用方独立保留。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { Children, isValidElement, useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'

function messageText(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<{ children?: ReactNode }>(child)
    ? messageText(child.props.children)
    : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join('').trim()
}

export function showErrorToast(message: string, options?: { deduplicate?: boolean; onClose?: () => void }) {
  if (!message) return
  const id = `error:${message}`
  if (options?.deduplicate && toast.getToasts().some(item => item.id === id)) return
  toast.error(message, { id, onDismiss: options?.onClose, onAutoClose: options?.onClose })
}

export function ErrorToast({ children, onClose }: { children?: ReactNode; onClose?: () => void }) {
  const message = messageText(children), callback = useRef(onClose)
  callback.current = onClose
  useEffect(() => { showErrorToast(message, { deduplicate: true, onClose: () => callback.current?.() }) }, [message])
  return null
}
