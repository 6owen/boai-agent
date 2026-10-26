/*
 * [INPUT]: Canonical BOAI reference URI and explicit message employee/conversation scope.
 * [OUTPUT]: On-demand source card/body Popover with versioned paging; unavailable/error via Sonner.
 * [POS]: Internal message reference viewer; no external navigation or implicit source mutation.
 * [PROTOCOL]: Update Header and -components/.folder.md on change.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { ReferenceResolution, ReferenceScope } from '@boai/shared/domain/references'
import { getDesktopClient } from '@/services/request/desktop-client'
import { Button } from '@/components/ui/button'
import { useFloatingLayerActive } from '@/components/ui/floating-layer-scope'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function ObjectReference({ uri, scope, children }: { uri: string; scope: ReferenceScope; children: ReactNode }) {
  const [open, setOpen] = useState(false), [value, setValue] = useState<ReferenceResolution>(), [loading, setLoading] = useState(false)
  const active = useFloatingLayerActive()
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (!open || !active) { setValue(undefined); setOffset(0); return }
    let live = true
    const api = getDesktopClient()
    if (!api) return
    setLoading(true)
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed') { live = false; setValue(undefined); setOpen(false) } })
    void api.request('executeApplicationOperation', { operation: 'refs.resolve', input: { ...scope, uri, full: true, limit: 6000, offset, ...(offset && value ? { expectedRevision: value.card.revision } : {}) } }).then(result => {
      if (!live) return
      if (result.status !== 'succeeded') throw new Error(result.error?.message ?? '无法读取引用')
      const next = result.data as ReferenceResolution
      setValue(previous => offset && previous ? { ...next, body: (previous.body ?? '') + (next.body ?? '') } : next)
    }).catch(error => { if (live) { toast.error(error instanceof Error ? error.message : '无法读取引用'); setValue(undefined); setOpen(false) } }).finally(() => { if (live) setLoading(false) })
    // The revision comes from the page already displayed; a source change must reject, not concatenate versions.
    return () => { live = false; unsubscribe() }
  }, [open, active, uri, scope.agentId, scope.conversationId, offset])
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button variant="link" size="content" className="inline text-inherit" />}>{children}</PopoverTrigger>
    <PopoverContent align="start" className="w-96 max-w-[calc(100vw-24px)] p-3">
      {value && <><strong>{value.card.title}</strong><span className="text-xs text-muted-foreground">{value.card.kind}</span><div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm">{value.body || value.card.summary}</div></>}
      {loading && <span className="text-sm text-muted-foreground">读取中…</span>}
      {value?.nextOffset !== undefined && <Button variant="secondary" size="sm" disabled={loading} onClick={() => setOffset(value.nextOffset!)}>继续读取</Button>}
    </PopoverContent>
  </Popover>
}
