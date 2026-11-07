/*
 * [INPUT]: Existing SourceService, skill copy service and employee transactions supplied by the application host.
 * [OUTPUT]: Minimal contribution lifecycle port; package metadata never substitutes for source/skill permissions or credentials.
 * [POS]: WT2 integration seam, leaving shared AppService/IPC registration to their designated owners.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { CapabilityBinding, CapabilityContribution, CapabilityInstallation } from '@boai/shared/domain/capability-packages'
import type { RecordTransaction } from '../../adapters/storage/product-store'

export type CapabilityAuthority = { validate(): Promise<void>; signal: AbortSignal }
export interface CapabilityPackageHost {
  /** Capture the originating employee run before entering the package queue. Owner calls have no run authority. */
  authority?(): CapabilityAuthority | undefined
  /** Validate and commit under the original service serialization boundary, before opening a store transaction. */
  commit?<T>(action: () => Promise<T>, authority?: CapabilityAuthority): Promise<T>
  /** Idempotently create the preallocated object IDs. Must not launch MCP or activate employee bindings. */
  materialize(installation: CapabilityInstallation, directory: string): Promise<void>
  /** Remove only owned, hash-matching objects. Keep edited/shared copies and return their IDs/paths. */
  retire(installation: CapabilityInstallation, contributions: CapabilityContribution[]): Promise<string[]>
  /** Apply original skill/source employee bindings inside the same ProductStore transaction. Never load through the outer store here. */
  applyBinding(tx: RecordTransaction, installation: CapabilityInstallation, previous: CapabilityBinding | undefined, next: CapabilityBinding | undefined, expectedConfigVersion?: number): Promise<void>
  /** Stop/reject new work and await actual Source/employee operations exiting. A rejection keeps the package blocked. */
  drain(installationId: string, employeeId?: string): Promise<void>
  /** Reject updates while an employee/native run may hold skill files; this check never interrupts work. */
  assertIdle?(installationId: string): Promise<void>
  /** Refresh employee/catalog caches only after a reliable database commit. */
  changed(installationId: string): Promise<void>
  /** Reject an employee runtime already loading the same native package, or an ownership combination that cannot be identified. */
  assertOwnership(installation: CapabilityInstallation, employeeId: string): Promise<void>
  /** Prepare only tracked employee copies after request/CAS admission; never activate a grant here. */
  prepareBinding?(installation: CapabilityInstallation, employeeId: string, expectedConfigVersion?: number): Promise<void>
  /** Re-evaluate saved credentials/environment without connecting. Throw for incomplete configuration. */
  assertReady?(installation: CapabilityInstallation, contributionIds: string[]): Promise<void>
}
