/*
 * [INPUT]: Explicit local package imports, employee bindings and versioned management requests.
 * [OUTPUT]: Portable/legacy capability package support reports, immutable contributions, CAS requests and receipts without credentials.
 * [POS]: Shared WT2 package contract; separate from agent-runtime plugins and employee identity.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import type { DataSourceConfig } from './sources'

export const CAPABILITY_PACKAGE_LIMITS = { entries: 2000, bytes: 100 * 1024 * 1024, depth: 32, manifestBytes: 1024 * 1024, contributions: 200 } as const
export const CAPABILITY_PACKAGE_SPEC = 'agent-plugins/1.0.0' as const
export type CapabilityIssue = { component: string; code: string; message: string }
export type CapabilityDefinition =
  | { key: string; kind: 'skill'; path: string; name: string; description: string; contentHash: string }
  | { key: string; kind: 'source'; config: DataSourceConfig; requiredSecrets: string[] }
export type CapabilityInspection = {
  format: 'portable' | 'codex-legacy'; specVersion: string; packageId: string; name: string; version: string; description: string
  source: { kind: 'local'; path: string; origin: string }; contentHash: string
  files: { path: string; size: number; hash: string }[]; bytes: number; definitions: CapabilityDefinition[]
  unsupported: CapabilityIssue[]; warnings: CapabilityIssue[]; partialAllowed: boolean
}
export type CapabilityContribution = { id: string; key: string; kind: CapabilityDefinition['kind']; objectId: string; ownership: 'owned' | 'reference'; version: string }
export type CapabilityInstallation = {
  id: string; packageId: string; name: string; version: string; contentHash: string; revision: number
  enabled: boolean; status: 'installed' | 'draining' | 'uninstalled'; format: CapabilityInspection['format']; specVersion: string
  source: CapabilityInspection['source']; partial: boolean; unsupported: CapabilityIssue[]; contributions: CapabilityContribution[]
  definitions: CapabilityDefinition[]; files: CapabilityInspection['files']; createdAt: string; updatedAt: string; retained?: string[]
}
export type CapabilityBinding = { id: string; installationId: string; employeeId: string; revision: number; version: string; contributionIds: string[]; status?: 'active' | 'draining' }
export type CapabilityGrant = { installationId: string; employeeId: string; contributionId: string; version: string }
export type CapabilityOperation = { requestId: string; fingerprint: string; action: string; installationId: string; status: 'preparing' | 'completed' | 'failed' | 'interrupted'; phase: string; result?: CapabilityInstallation | CapabilityBinding; error?: string; retained?: string[] }

const id = z.string().trim().min(1).max(200)
const revision = z.number().int().nonnegative()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const inspectCapabilityPackageSchema = z.object({ path: z.string().min(1).max(8000) }).strict()
export const installCapabilityPackageSchema = inspectCapabilityPackageSchema.extend({ requestId: id, contentHash: hash, allowPartial: z.boolean().default(false) }).strict()
export const capabilityPackageIdentitySchema = z.object({ installationId: z.string().uuid(), expectedRevision: revision, requestId: id }).strict()
export const setCapabilityPackageEnabledSchema = capabilityPackageIdentitySchema.extend({ enabled: z.boolean() }).strict()
export const updateCapabilityPackageSchema = capabilityPackageIdentitySchema.extend({ path: z.string().min(1).max(8000), contentHash: hash, allowPartial: z.boolean().default(false), approvedContributionKeys: z.array(id).max(CAPABILITY_PACKAGE_LIMITS.contributions) }).strict()
export const bindCapabilityPackageSchema = capabilityPackageIdentitySchema.extend({ employeeId: id, expectedBindingRevision: revision, expectedConfigVersion: z.number().int().positive(), contributionIds: z.array(id).min(1).max(CAPABILITY_PACKAGE_LIMITS.contributions) }).strict()
export const unbindCapabilityPackageSchema = capabilityPackageIdentitySchema.extend({ employeeId: id, expectedBindingRevision: revision, expectedConfigVersion: z.number().int().positive() }).strict()
