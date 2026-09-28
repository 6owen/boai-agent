/*
 * [INPUT]: 编辑器的表单定位与放弃后重置回调、统一 AlertDialog。
 * [OUTPUT]: 各编辑区域独立的未保存守卫和确认弹窗，只提交该区域的表单。
 * [POS]: common 的主页面/详情标签共用编辑保护。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { flushAppearance } from '@/stores/appearance'
import type { Guard } from './index'

export function useEditorGuard({ reset, getForm }: { reset: () => void; getForm: () => HTMLFormElement | null }) {
  const [dirty, setDirtyState] = useState(false), dirtyRef = useRef(false)
  const [leaving, setLeaving] = useState(false)
  const pending = useRef<{ action: () => void; resetOnDiscard: boolean } | null>(null)
  const setDirty = useCallback((value: boolean) => { dirtyRef.current = value; setDirtyState(value) }, [])
  const navigate: Guard['navigate'] = useCallback((action, { resetOnDiscard = true } = {}) => {
    void flushAppearance()
    if (dirtyRef.current) { pending.current = { action, resetOnDiscard }; setLeaving(true) } else action()
  }, [])
  const saved = useCallback((fallback?: () => void) => {
    setDirty(false)
    const next = pending.current; pending.current = null; setLeaving(false)
    if (next) next.action(); else fallback?.()
  }, [setDirty])
  const guard = useMemo(() => ({ dirty, setDirty, navigate, saved }), [dirty, setDirty, navigate, saved])
  const confirmation = <AlertDialog open={leaving} onOpenChange={open => { setLeaving(open); if (!open) pending.current = null }}>
    <AlertDialogContent className="sm:max-w-md"><AlertDialogHeader><AlertDialogTitle>有未保存的修改</AlertDialogTitle><AlertDialogDescription>保存或放弃修改后，退出当前编辑。</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><Button variant="secondary" onClick={() => {
        setDirty(false)
        const next = pending.current; pending.current = null; setLeaving(false)
        if (next?.resetOnDiscard) reset()
        next?.action()
      }}>放弃并退出</Button><Button onClick={() => {
        const form = getForm()
        setLeaving(false)
        if (!form?.checkValidity()) pending.current = null
        requestAnimationFrame(() => form?.requestSubmit())
      }}>保存并退出</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  return { guard, dirty, dirtyRef, navigate, saved, leaving, confirmation }
}
