/**
 * [OUTPUT]: 构建与边界检查共用显式开发导出解析；检查包含所有命名空间的工作区成员。
 * [INPUT]: esbuild build options and current-worktree root.
 * [OUTPUT]: Typed source-export resolution, preserving esbuild output option inference.
 * [POS]: Declaration for workspace-packages.mjs.
 * [PROTOCOL]: Update scripts/.folder.md with interface changes.
 */
import type { BuildOptions, BuildResult } from 'esbuild'
export const workspaceRoot: string
export function workspaceSourceAliases(packageRoot: string, manifest: { name: string; exports?: Record<string, unknown> }): Record<string, string>
export function workspaceAliases(root?: string): Record<string, string>
export function workspaceViteAliases(root?: string): Array<{ find: string; replacement: string }>
type WorkspaceBuildOptions = BuildOptions & { workspaceRoot?: string }
type SameShape<Out, In extends Out> = In & { [Key in Exclude<keyof In, keyof Out>]: never }
export function buildWorkspace<T extends WorkspaceBuildOptions>(options: SameShape<WorkspaceBuildOptions, T>): Promise<BuildResult<T>>
