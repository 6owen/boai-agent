/*
 * [OUTPUT]: 横向字段行自动关联单个控件的标签/ID，供员工模型连接和设置表单直接共用；支持full占满原表单列。
 * [OUTPUT]: 可省略居中标题/插图介绍区；保留无障碍DialogTitle，员工新建/编辑直接进入表单分区。
 * [OUTPUT]: scrollBody可选模式固定标题区，表单卡片外层ScrollArea延伸至弹窗边缘，留白归滚动内容；默认布局保持。
 * [INPUT]: 模型连接/本机 Agent 的步骤、标题，以及连接/个人资料/数据源的字段、反馈和操作回调。
 * [OUTPUT]: 共用弹窗首级 520px、二级 620px，默认自然高度，可指定固定高度供内容内部滚动；统一标题/步骤及连接、资料和数据源的横向分组表单、分隔线和操作栏。
 * [POS]: 连接向导、个人资料及数据源编辑卡片表单的共用布局，不持有业务状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { cloneElement, Fragment, isValidElement, useId, type ComponentProps, type ReactNode } from 'react'
import { ArrowRight, Check, InfoIcon, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ConnectionDialogLayout({ choosing, label, title, illustration, description, closeLabel, working, onClose, steps, children, finalFocus, initialFocus, fixedHeight, scrollBody = false, showIntro = true }: {
  choosing: boolean; label: string; title: string; illustration: ReactNode; description?: string
  closeLabel: string; working: boolean; onClose(): void
  steps?: { label: string; first: string; second: string }
  children: ReactNode
  finalFocus: ComponentProps<typeof DialogContent>['finalFocus']
  initialFocus?: ComponentProps<typeof DialogContent>['initialFocus']
  fixedHeight?: number
  scrollBody?: boolean
  showIntro?: boolean
}) {
  return <DialogContent className={`connection-dialog${fixedHeight || scrollBody ? ' gap-0' : ''}`} data-fixed-height={fixedHeight ? true : undefined} data-scroll-body={scrollBody || undefined} style={{ display: fixedHeight || scrollBody ? 'flex' : 'block', height: fixedHeight, width: choosing ? 520 : 620, maxWidth: 'calc(100vw - 32px)', padding: 'var(--connection-dialog-padding)' }} showCloseButton={false} finalFocus={finalFocus} initialFocus={initialFocus}>
    <div className="connection-dialog-top"><span>{label}</span><Button variant="ghost" size="icon-sm" aria-label={closeLabel} disabled={working} onClick={onClose}><X /></Button></div>
    {showIntro ? <div className="connection-dialog-intro">
      {illustration}
      {description ? <div className="flex items-center justify-center gap-2"><DialogTitle>{title}</DialogTitle><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="本地配置导入说明" />}><InfoIcon /></TooltipTrigger><TooltipContent side="bottom">{description}</TooltipContent></Tooltip></div> : <DialogTitle>{title}</DialogTitle>}
    </div> : <DialogTitle className="sr-only">{title}</DialogTitle>}
    {description && <DialogDescription className="sr-only">{description}</DialogDescription>}
    {steps && <ol className="connection-steps" aria-label={steps.label}><li aria-current={choosing ? 'step' : undefined}><span>{choosing ? '1' : <Check size={12} />}</span>{steps.first}<ArrowRight className="connection-step-arrow" size={14} /></li><li aria-current={!choosing ? 'step' : undefined}><span>2</span>{steps.second}</li></ol>}
    {scrollBody ? <ScrollArea className="connection-dialog-body" viewportProps={{ className: 'overscroll-contain' }} contentProps={{ className: 'connection-dialog-body-content' }}>{children}</ScrollArea> : children}
  </DialogContent>
}

export function ConnectionForm({ children, footer, disabled, muted = true, ...props }: Omit<ComponentProps<'form'>, 'className'> & { footer: ReactNode; disabled: boolean; muted?: boolean }) {
  return <form {...props} data-edit-form className={`connection-editor soft-card${muted ? ' bg-muted' : ''}`} data-compact="true">
    <fieldset disabled={disabled} className="connection-fields soft-divide-y">{children}</fieldset>
    <Separator />
    <footer className="connection-editor-footer">{footer}</footer>
  </form>
}

export function ConnectionSettingRow({ label, htmlFor, icon, hint, children, full = false }: { label: string; htmlFor?: string; icon?: ReactNode; hint?: string; children: ReactNode; full?: boolean }) {
  const id = useId()
  const element = isValidElement<{ id?: string; 'aria-label'?: string }>(children) && children.type !== Fragment ? children : null
  const controlId = htmlFor ?? element?.props.id ?? id
  const control = element && !htmlFor ? cloneElement(element, { id: controlId, 'aria-label': element.props['aria-label'] ?? label }) : children
  const fieldLabel = <FieldLabel htmlFor={controlId}>{icon}{label}</FieldLabel>
  return <Field orientation="horizontal" className={`connection-setting-row grid${full ? ' full' : ''}`}>
    {hint ? <div className="connection-setting-label">{fieldLabel}<Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`${label}说明`} />}><InfoIcon /></TooltipTrigger><TooltipContent>{hint}</TooltipContent></Tooltip></div> : fieldLabel}
    {control}
  </Field>
}
