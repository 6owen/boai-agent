/*
 * [INPUT]: Explicit employee workspace identity and relative directory navigation.
 * [OUTPUT]: Desktop-only directory pages and installed-application identifiers; no arbitrary path execution.
 * [POS]: Workspace file browser IPC contract.
 * [PROTOCOL]: Update this Header and owning .folder.md when changed.
 */
export interface WorkspaceFileScope { employeeId: string; conversationId?: string }
export interface WorkspaceDirectoryEntry { name: string; relativePath: string; kind: 'directory' | 'file' | 'symlink' | 'other'; size?: number; modifiedAt?: string }
export interface WorkspaceDirectoryPage { rootPath: string; path: string; relativePath: string; parentPath?: string; entries: WorkspaceDirectoryEntry[]; nextCursor?: string }
export interface WorkspaceApplication { id: string; name: string; kind: 'system' | 'editor' | 'terminal' }
export interface WorkspaceFilesQuery { scope: WorkspaceFileScope; relativePath?: string; cursor?: string }
export interface WorkspaceOpenInput { scope: WorkspaceFileScope; relativePath?: string; action?: 'open' | 'reveal'; applicationId?: string }
