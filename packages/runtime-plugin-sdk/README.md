<!--
[INPUT]: Existing Runtime API and manifest contracts.
[OUTPUT]: Workspace and standalone local-tarball consumption instructions.
[POS]: SDK package documentation, also included in portable local artifacts.
[PROTOCOL]: Keep spec 26/04 and package exports aligned.
-->
# BOAI Runtime Plugin SDK

This private package contains the Runtime Provider API and the pure manifest/configuration schema. It has no access to BOAI application services, repositories, credentials, runner or wire protocol.

- `@boai/runtime-plugin-sdk`: Runtime API types and `RUNTIME_API_VERSION`.
- `@boai/runtime-plugin-sdk/manifest`: manifest/configuration schemas and types.
- Runtime API is currently v2. The existing probe reply uses `protocolVersion: 1`; the plugin manifest separately uses `apiVersion: 2`.

Within BOAI, development exports resolve to TypeScript sources. To consume the SDK in an independent project, run `node scripts/runtime-plugin-devkit.mjs sdk` in BOAI and install the resulting `.local/plugin-devkit/*.tgz`. The portable package contains ESM JavaScript, `.d.ts` declarations and `manifest.schema.json`, with the same package version and pinned dependencies as this source package. It does not contain workspace dependencies or require BOAI source files.

`node scripts/runtime-plugin-devkit.mjs create /absolute/new-directory` creates a standalone Text Inspector example with the tarball vendored locally. In that directory, run `pnpm install`, `pnpm typecheck`, `pnpm build` and `pnpm check`. Install the generated `package/` directory using BOAI's existing runtime plugin settings.

These commands create local artifacts; they do not publish to npm. The SDK remains private and no public license is declared. Package preflight does not execute a provider or prove runtime compatibility; BOAI's existing runner checks the exported API version when initializing it.
