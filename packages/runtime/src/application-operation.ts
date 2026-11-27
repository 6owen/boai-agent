/*
 * [INPUT]: The shared application actor, result and operation input schema.
 * [OUTPUT]: Host registration and pre-effect rejection contract for all application operations.
 * [POS]: Runtime extension point shared by domain providers and the receipt coordinator.
 * [PROTOCOL]: Update this header and src/.folder.md on change.
 */
import type { z } from 'zod'
import type { ApplicationActor, ApplicationResult } from '@boai/shared/domain/application-protocol'

export interface ApplicationOperation {
  contractVersion?: number
  exclusiveSource?: boolean
  recover?(requestId: string, actor: ApplicationActor): Promise<unknown | undefined>
  legacy?: { input: z.ZodType; execute: ApplicationOperation['execute']; recover?: ApplicationOperation['recover'] }
  name: string
  description: string
  effect: 'read' | 'write'
  ownerOnly?: boolean
  input: z.ZodType
  resultType: string
  available?(): boolean
  unavailableReason?: string
  validate?(input: any, actor: ApplicationActor): Promise<void>
  execute(input: any, requestId: string | undefined, actor: ApplicationActor): Promise<unknown>
}

/** Only throw before any effect, or from an atomic transaction that rolls back on failure. */
export class ApplicationValidationError extends Error {
  constructor(readonly code: NonNullable<ApplicationResult['error']>['code'], message: string, readonly fields?: string[]) {
    super(message)
  }
}
