/**
 * [INPUT]: esbuild build options and current-worktree root.
 * [OUTPUT]: Typed source-export resolution, preserving esbuild output option inference.
 * [POS]: Declaration for workspace-packages.mjs.
 * [PROTOCOL]: Update scripts/.folder.md with interface changes.
 */
import type { BuildOptions, BuildResult } from 'esbuild'
export const workspaceRoot: string
export function workspaceAliases(root?: string): Record<string, string>
export function workspaceViteAliases(root?: string): Array<{ find: string; replacement: string }>
type WorkspaceBuildOptions = BuildOptions & { workspaceRoot?: string }
type SameShape<Out, In extends Out> = In & { [Key in Exclude<keyof In, keyof Out>]: never }
export function buildWorkspace<T extends WorkspaceBuildOptions>(options: SameShape<WorkspaceBuildOptions, T>): Promise<BuildResult<T>>
