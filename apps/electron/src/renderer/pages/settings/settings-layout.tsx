/*
 * [INPUT]: Settings page titles/actions and section/card/row contents using existing UI components and semantic classes.
 * [OUTPUT]: Shared settings layout without a persistent description slot; action headings share the local-agent heading's 12px bottom gap; contextual help uses icon Tooltips.
 * [POS]: Settings presentation primitives; contains no requests, persistence or page-specific state.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from 'cn'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InfoIcon } from '@/components/icons'

type HeadingProps = { title: ReactNode; titleId?: string; actions?: ReactNode }

export function SettingsLayout({ title, titleId, actions, className, children, ...props }: Omit<ComponentProps<'section'>, 'title'> & HeadingProps) {
  const heading = <h2 id={titleId} className="flex items-center gap-2">{title}</h2>
  return <section {...props} className={cn('appearance-settings settings-document', className)}>
    <header className="settings-document-heading">
      {heading}
      {actions}
    </header>
    {children}
  </section>
}

export function SettingsSection({ title, titleId, actions, first = false, className, children, ...props }: Omit<ComponentProps<'section'>, 'title'> & HeadingProps & { first?: boolean }) {
  const generatedId = useId(), headingId = titleId ?? generatedId
  const heading = <h3 id={headingId} className="settings-section-title flex items-center gap-1">{title}</h3>
  return <section {...props} aria-labelledby={props['aria-labelledby'] ?? headingId} className={cn(!first && 'appearance-advanced', className)}>
    {actions ? <div className="settings-section-heading">{heading}{actions}</div> : heading}
    {children}
  </section>
}

export function SettingsCard({ className, contentClassName = 'appearance-options soft-divide-y', children, ...props }: ComponentProps<typeof Card> & { contentClassName?: string }) {
  return <Card {...props} className={cn('gap-0 p-0', className)}><CardContent className={contentClassName}>{children}</CardContent></Card>
}

export function SettingsRow({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('appearance-row', className)} />
}

export function SettingsHelp({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip>
    <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={label} />}><InfoIcon /></TooltipTrigger>
    <TooltipContent align="start" className="max-w-80 space-y-2 break-words">{children}</TooltipContent>
  </Tooltip>
}
