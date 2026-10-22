/*
 * [OUTPUT]: 导航先等待快捷键自动保存，失败沿原确认框；未知回执核对前不可放弃。
 * [INPUT]: 编辑器放弃后重置回调、统一 AlertDialog。
 * [OUTPUT]: 各编辑区域独立的未保存守卫；确认仅取消或放弃修改后退出，保存由原编辑器办理。
 * [POS]: common 的主页面/详情标签共用编辑保护。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { shortcuts } from '@/stores/shortcuts'
import { flushAppearance } from '@/stores/appearance'
import type { Guard } from './index'

export function useEditorGuard({ reset }: { reset: () => void }) {
  const [dirty, setDirtyState] = useState(false), dirtyRef = useRef(false)
  const [leaving, setLeaving] = useState(false), [discarding, setDiscarding] = useState(false)
  const navigationVersion = useRef(0), discardLock = useRef(false)
  useEffect(() => () => { navigationVersion.current++ }, [])
  const pending = useRef<{ action: () => void; resetOnDiscard: boolean } | null>(null)
  const setDirty = useCallback((value: boolean) => { dirtyRef.current = value; setDirtyState(value) }, [])
  const navigate: Guard['navigate'] = useCallback((action, { resetOnDiscard = true } = {}) => {
    void flushAppearance()
    const version = ++navigationVersion.current
    const proceed = () => { if (version !== navigationVersion.current) return; if (dirtyRef.current || shortcuts.hasWork()) { pending.current = { action, resetOnDiscard }; setLeaving(true) } else action() }
    if (shortcuts.hasWork()) void shortcuts.flush().then(proceed)
    else proceed()
  }, [])
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
        const next = pending.current
        void (async () => {
          try {
            if (!await shortcuts.discard() || pending.current !== next) return
            navigationVersion.current++
            setDirty(false)
            pending.current = null; setLeaving(false)
            if (next?.resetOnDiscard) reset()
            next?.action()
          } finally { discardLock.current = false; setDiscarding(false) }
        })()
      }}>{discarding ? '正在核对…' : '退出'}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  return { guard, dirty, dirtyRef, navigate, saved, leaving, confirmation }
}
