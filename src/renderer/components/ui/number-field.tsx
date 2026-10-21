/*
 * [INPUT]: React Aria NumberField primitives and the shared Soft Button skin.
 * [OUTPUT]: Accessible horizontal number input with integrated decrement/increment buttons, shared control surface, and caller-owned numeric bounds.
 * [POS]: Reusable components/ui number field; no appearance or business state.
 * [PROTOCOL]: Once this file changes, update its Header and the parent .folder.md.
 */
import {
  Button as AriaButton,
  Group as AriaGroup,
  Input as AriaInput,
  NumberField as AriaNumberField,
  type NumberFieldProps as AriaNumberFieldProps,
} from 'react-aria-components'
import { cn } from 'cn'
import { MinusIcon, Plus } from '@/components/icons'
import { buttonVariants } from './button'

type NumberFieldProps = Omit<AriaNumberFieldProps, 'children' | 'className'> & {
  className?: string
  inputClassName?: string
  inputId?: string
}

function NumberField({ className, inputClassName, inputId, ...props }: NumberFieldProps) {
  return <AriaNumberField data-slot="number-field" className={cn('inline-flex w-36 min-w-0', className)} {...props}>
    <AriaGroup data-slot="number-field-group" className="flex h-(--control-height) w-full min-w-0 items-stretch overflow-hidden">
      <AriaInput id={inputId} data-slot="number-field-input" className={cn('w-full min-w-0 flex-1 px-3 py-1 text-left tabular-nums outline-none', inputClassName)} />
      <AriaButton slot="decrement" data-slot="number-field-stepper" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
        <MinusIcon />
      </AriaButton>
      <AriaButton slot="increment" data-slot="number-field-stepper" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
        <Plus />
      </AriaButton>
    </AriaGroup>
  </AriaNumberField>
}

export { NumberField }
export type { NumberFieldProps }
