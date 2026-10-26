/** Local SDK artifact and external project helpers; no profile installation side effects. */
export interface SdkArtifact { sdkDirectory: string; tarball: string; name: string; version: string }
export interface PluginCheck { id: string; version: string; runtimeApiVersion: 1 | 2; files: number; bytes: number; packageHash: string; runtimeLoaded: false }
export function exportSdk(output?: string): Promise<SdkArtifact>
export function createPlugin(directory: string, options?: { sdk?: SdkArtifact }): Promise<{ directory: string; packageDirectory: string; sdkVersion: string }>
export function checkPlugin(directory: string): Promise<PluginCheck>
