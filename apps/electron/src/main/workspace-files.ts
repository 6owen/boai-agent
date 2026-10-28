/*
 * [OUTPUT]: 2026-10-29 工作区目录/预览调用由官方file-explorer-plugin宿主处理，原终端resolver独立。
 * [INPUT]: BOAI runtime scope resolver and existing restrictedPath validator.
 * [OUTPUT]: Official file-explorer host wired to original path containment and plugin availability.
 * [POS]: Electron adapter; terminal scope remains independent of file explorer enablement.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { WorkspaceFileService as PluginHost } from '@boai/file-explorer-plugin/host'
import { restrictedPath } from '@boai/runtime/modules/workspaces/file-access'
export { workspaceScopeSchema } from '@boai/file-explorer-plugin/host'
export class WorkspaceFileService extends PluginHost {
  constructor(resolveScope: ConstructorParameters<typeof PluginHost>[0], opener: ConstructorParameters<typeof PluginHost>[1], enabled?: () => boolean) {
    super(resolveScope, opener, restrictedPath, enabled)
  }
}
