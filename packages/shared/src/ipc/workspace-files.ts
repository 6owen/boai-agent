/*
 * [OUTPUT]: 会话材料/成果与员工知识资料按固定身份外部打开，复用系统应用ID；不接受调用方路径。
 * [OUTPUT]: 2026-10-29 workspace-files增加授权根及预览DTO，index/public-methods接可信桌面预览入口。
 * [INPUT]: Explicit employee workspace identity and relative directory navigation.
 * [OUTPUT]: Desktop-only directory pages and installed-application identifiers with optional host-provided PNG icons; no arbitrary path execution.
 * [POS]: Workspace file browser IPC contract.
 * [PROTOCOL]: Update this Header and owning .folder.md when changed.
 */
export interface WorkspaceFileScope { employeeId: string; conversationId?: string }
export interface FileExplorerScope extends WorkspaceFileScope { directory?: string }
export type WorkspaceFilePreview = import('../domain/file-preview').FilePreview | import('../domain/file-preview').BinaryFilePreview | { kind: 'image'; url: string }
export interface WorkspaceDirectoryEntry { name: string; relativePath: string; kind: 'directory' | 'file' | 'symlink' | 'other'; size?: number; modifiedAt?: string }
export interface WorkspaceDirectoryPage { rootPath: string; path: string; relativePath: string; parentPath?: string; entries: WorkspaceDirectoryEntry[]; nextCursor?: string }
export interface WorkspaceApplication { id: string; name: string; kind: 'system' | 'editor' | 'terminal'; iconDataUrl?: string }
export interface WorkspaceFilesQuery { scope: FileExplorerScope; relativePath?: string; cursor?: string }
export interface WorkspaceOpenInput { scope: FileExplorerScope; relativePath?: string; action?: 'open' | 'reveal'; applicationId?: string }
export type ExternalFileTarget =
  | { kind: 'material'; conversationId: string; id: string; contentHash: string; revision: number }
  | { kind: 'artifact'; conversationId: string; id: string; contentHash: string }
  | { kind: 'knowledge'; agentId: string; resourceId: string; contentHash?: string; revision?: number }
export interface ExternalFileOpenInput { target: ExternalFileTarget; action?: 'open' | 'reveal'; applicationId?: string }
