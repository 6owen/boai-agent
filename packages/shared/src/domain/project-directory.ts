/*
 * [INPUT]: Employee defaults and explicit owner project choices.
 * [OUTPUT]: Versioned work-location snapshots, independent of directory permissions.
 * [POS]: Shared contract for chat, assignments and execution admission.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { z } from 'zod'

export const projectChoiceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('managed') }).strict(),
  z.object({ mode: z.literal('directory'), directory: z.string().trim().min(1).max(4096) }).strict(),
])
export type ProjectChoice = z.infer<typeof projectChoiceSchema>
export interface ProjectSelection {
  mode: 'managed' | 'directory'
  directory?: string
  /** Original selected path: resolving a changed symlink must fail rather than silently switch. */
  requestedDirectory?: string
  source: 'employee-default' | 'explicit' | 'managed' | 'legacy'
  revision: number
}
