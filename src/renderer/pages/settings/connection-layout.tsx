/*
 * [INPUT]: 模型连接/本机 Agent 的步骤、标题、字段、反馈和操作回调。
 * [OUTPUT]: 原添加模型连接的共用弹窗布局：首级 520px、二级 620px、自然高度与统一标题/步骤；兼容接口的横向分组表单、间距和操作栏。
 * [POS]: settings 内连接向导的唯一布局源，不持有业务状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ComponentProps, ReactNode } from 'react'
import { ArrowRight, Check, InfoIcon, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ConnectionDialogLayout({ choosing, label, title, illustration, description, closeLabel, working, onClose, steps, children, finalFocus, initialFocus }: {
  choosing: boolean; label: string; title: string; illustration: ReactNode; description?: string
  closeLabel: string; working: boolean; onClose(): void
  steps?: { label: string; first: string; second: string }
  children: ReactNode
  finalFocus: ComponentProps<typeof DialogContent>['finalFocus']
  initialFocus?: ComponentProps<typeof DialogContent>['initialFocus']
}) {
  return <DialogContent className="connection-dialog" style={{ display: 'block', width: choosing ? 520 : 620, maxWidth: 'calc(100vw - 32px)', padding: 'var(--connection-dialog-padding)' }} showCloseButton={false} finalFocus={finalFocus} initialFocus={initialFocus}>
    <div className="connection-dialog-top"><span>{label}</span><Button variant="ghost" size="icon-sm" aria-label={closeLabel} disabled={working} onClick={onClose}><X /></Button></div>
    <div className="connection-dialog-intro">
      {illustration}
      {description ? <div className="flex items-center justify-center gap-2"><DialogTitle>{title}</DialogTitle><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="本地配置导入说明" />}><InfoIcon /></TooltipTrigger><TooltipContent side="bottom">{description}</TooltipContent></Tooltip></div> : <DialogTitle>{title}</DialogTitle>}
    </div>
    {description && <DialogDescription className="sr-only">{description}</DialogDescription>}
    {steps && <ol className="connection-steps" aria-label={steps.label}><li aria-current={choosing ? 'step' : undefined}><span>{choosing ? '1' : <Check size={12} />}</span>{steps.first}<ArrowRight className="connection-step-arrow" size={14} /></li><li aria-current={!choosing ? 'step' : undefined}><span>2</span>{steps.second}</li></ol>}
    {children}
  </DialogContent>
}

export function ConnectionForm({ children, footer, disabled, ...props }: Omit<ComponentProps<'form'>, 'className'> & { footer: ReactNode; disabled: boolean }) {
  return <form {...props} data-edit-form className="connection-editor soft-card bg-muted" data-compact="true">
    <fieldset disabled={disabled} className="connection-fields soft-divide-y">{children}</fieldset>
    <footer className="connection-editor-footer soft-divider-top">{footer}</footer>
  </form>
}

export function ConnectionSettingRow({ label, htmlFor, icon, hint, children }: { label: string; htmlFor?: string; icon?: ReactNode; hint?: string; children: ReactNode }) {
  const fieldLabel = <FieldLabel htmlFor={htmlFor}>{icon}{label}</FieldLabel>
  return <Field orientation="horizontal" className="connection-setting-row grid">
    {hint ? <div className="connection-setting-label">{fieldLabel}<Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`${label}说明`} />}><InfoIcon /></TooltipTrigger><TooltipContent>{hint}</TooltipContent></Tooltip></div> : fieldLabel}
    {children}
  </Field>
}
