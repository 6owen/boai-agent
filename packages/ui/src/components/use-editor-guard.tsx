/*
 * [INPUT]: 编辑器重置、宿主离页保存/待存状态/放弃核对回调与统一AlertDialog。
 * [OUTPUT]: 独立草稿守卫；等待宿主自动保存，未知回执核对前不可放弃，过期导航不执行。
 * [POS]: @boai/ui/use-editor-guard，不依赖桌面store或IPC。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './alert-dialog'
import { Button } from './button'

type EditorGuardOptions = {
  reset: () => void
  beforeNavigate?: () => void | Promise<unknown>
  hasPendingChanges?: () => boolean
  beforeDiscard?: () => boolean | Promise<boolean>
}

export function useEditorGuard({ reset, beforeNavigate, hasPendingChanges, beforeDiscard }: EditorGuardOptions) {
  const [dirty, setDirtyState] = useState(false), dirtyRef = useRef(false)
  const [leaving, setLeaving] = useState(false), [discarding, setDiscarding] = useState(false)
  const navigationVersion = useRef(0), discardLock = useRef(false)
  const pending = useRef<{ action: () => void; resetOnDiscard: boolean } | null>(null)
  useEffect(() => () => { navigationVersion.current++; pending.current = null }, [])
  const setDirty = useCallback((value: boolean) => { dirtyRef.current = value; setDirtyState(value) }, [])
  const navigate: (action: () => void, options?: { resetOnDiscard?: boolean }) => void = useCallback((action, { resetOnDiscard = true } = {}) => {
    const version = ++navigationVersion.current
    const proceed = (failed = false) => {
      if (version !== navigationVersion.current) return
      if (failed || dirtyRef.current || hasPendingChanges?.()) { pending.current = { action, resetOnDiscard }; setLeaving(true) }
      else action()
    }
    try {
      const saving = beforeNavigate?.()
      if (saving) void saving.then(() => proceed(), () => proceed(true))
      else proceed()
    } catch { proceed(true) }
  }, [beforeNavigate, hasPendingChanges])
  const saved = useCallback((fallback?: () => void) => {
    navigationVersion.current++
    setDirty(false)
    pending.current = null; setLeaving(false)
    fallback?.()
  }, [setDirty])
  const guard = useMemo(() => ({ dirty, setDirty, navigate, saved }), [dirty, setDirty, navigate, saved])
  const confirmation = <AlertDialog open={leaving} onOpenChange={open => { if (discardLock.current) return; setLeaving(open); if (!open) { pending.current = null; navigationVersion.current++ } }}>
    <AlertDialogContent className="sm:max-w-md"><AlertDialogHeader><AlertDialogTitle>有未保存的修改</AlertDialogTitle><AlertDialogDescription>退出后，未保存的修改将丢失。</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={discarding}>取消</AlertDialogCancel><Button disabled={discarding} onClick={() => {
        if (discardLock.current) return
        discardLock.current = true; setDiscarding(true)
        const next = pending.current, version = navigationVersion.current
        void (async () => {
          try {
            if (beforeDiscard && !await beforeDiscard()) return
            if (pending.current !== next || navigationVersion.current !== version) return
            navigationVersion.current++
            setDirty(false)
            pending.current = null; setLeaving(false)
            if (next?.resetOnDiscard) reset()
            next?.action()
          } catch { /* Keep the pending action and dialog until the host can verify disposal. */ }
          finally { discardLock.current = false; setDiscarding(false) }
        })()
      }}>{discarding ? '正在核对…' : '退出'}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  return { guard, dirty, dirtyRef, navigate, saved, leaving, confirmation }
}
