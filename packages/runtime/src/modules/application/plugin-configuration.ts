/*
 * [INPUT]: Existing browser settings service, application plugin catalog and authenticated facade.
 * [OUTPUT]: Foreground configuration requires a real owner intent, preserves provider CAS and never starts a browser.
 * [POS]: Thin application adapter; all persistence and session cleanup stay in BrowserPluginService.
 * [PROTOCOL]: Changes must update this Header and application/.folder.md.
 */
import { z } from 'zod'
import { applicationPlugins } from '@boai/shared/plugins/catalog'
import { pluginAvailability } from '@boai/shared/plugins/types'
import type { ApplicationHostPort } from '@boai/shared/ipc/application-host'
import { applyBrowserConfigurationPatch, browserDefaultForeground, BrowserPluginSettingsError, browserPluginConfigSchema, browserPluginConfigurationPatchSchema, browserPluginId, browserPluginProviderSchema, type BrowserPluginProvider } from '@boai/shared/plugins/browser-tools'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'
import type { ApplicationPort } from './operations'

const lookup = z.object({ id: z.string().min(1).max(200) }).strict()
const impact = '保存会关闭此提供方的现有浏览器会话；下一次启动使用保存偏好，单次明确指定优先。查询和保存均不启动浏览器。'
function providerFor(id: string): BrowserPluginProvider | undefined { return browserPluginProviderSchema.options.find(provider => browserPluginId(provider) === id) }
function supported(id: string): BrowserPluginProvider {
  const provider = providerFor(id)
  if (!provider) throw new ApplicationValidationError(applicationPlugins.some(plugin => plugin.id === id) ? 'CAPABILITY_UNAVAILABLE' : 'NOT_FOUND', '该插件没有开放配置适配，请查询 plugins.describe。')
  return provider
}

export function pluginConfigurationOperations(port: ApplicationPort, host?: Pick<ApplicationHostPort, 'available'>): ApplicationOperation[] {
  const hostAvailable = () => !!host?.available
  const requireHost = () => { if (!hostAvailable()) throw new ApplicationValidationError('CAPABILITY_UNAVAILABLE', '当前服务没有连接桌面配置宿主。') }
  const read = async (id: string) => {
    requireHost()
    const provider = supported(id), value = await port.request('getBrowserPluginSettings', { provider })
    const settings = await port.request('getPluginSettings', undefined)
    const plugin = applicationPlugins.find(plugin => plugin.id === id)!
    return { id, revision: value.revision, config: { defaultForeground: browserDefaultForeground(value.config), executablePath: value.config.executablePath },
      availability: pluginAvailability(plugin, settings), readiness: 'not-tested' as const, effect: impact }
  }
  const defaults = browserPluginConfigSchema.parse({})
  const options = { fields: { defaultForeground: { label: '默认前台运行', type: 'boolean', default: browserDefaultForeground(defaults), writable: true }, executablePath: { label: '浏览器程序', type: 'string', writable: false } },
    effect: impact, revisionScope: 'browser-provider-settings', secrets: 'none', launchVerified: false }
  const operations: ApplicationOperation[] = [
    { name: 'plugins.describe', description: '读取真实插件身份及已适配配置合同；未适配的插件明确不可写。', effect: 'read', input: lookup, resultType: 'PluginConfigurationDescriptor', execute: async ({ id }) => {
      const plugin = applicationPlugins.find(item => item.id === id)
      if (!plugin) throw new ApplicationValidationError('NOT_FOUND', '内置应用插件不存在；运行时插件请查询 runtimePlugins.list。')
      const provider = providerFor(id)
      return { id, kind: 'application', name: plugin.name, configurable: !!provider, ...(provider ? { provider, settingsOwner: 'BrowserPluginService', patchSchema: z.toJSONSchema(browserPluginConfigurationPatchSchema), ...options } : { reason: '该插件尚未开放配置适配。' }) }
    } },
    { name: 'plugins.options', description: '查询插件配置可写字段、默认值和保存影响，不启动插件。', effect: 'read', input: lookup, resultType: 'PluginConfigurationOptions', execute: async ({ id }) => { supported(id); return { id, ...options } } },
    { name: 'plugins.getConfig', description: '读取原浏览器插件配置及独立revision；可用性不等于连接已测试。', effect: 'read', input: lookup, resultType: 'PluginConfigurationSnapshot', execute: ({ id }) => read(id) },
    { name: 'plugins.configure', description: '只修改浏览器默认显示偏好；保留程序路径，按原revision保存并关闭原会话。', effect: 'write',
      input: lookup.extend({ patch: browserPluginConfigurationPatchSchema, expectedRevision: z.number().int().nonnegative() }).strict(), resultType: 'PluginConfigurationSnapshot',
      validate: async input => {
        requireHost()
        const current = await port.request('getBrowserPluginSettings', { provider: supported(input.id) })
        if (current.revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '浏览器插件配置已变化，请读取当前版本后重新判断。')
      },
      execute: async input => {
        requireHost()
        const provider = supported(input.id), current = await port.request('getBrowserPluginSettings', { provider })
        if (current.revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '浏览器插件配置已变化，未提交修改。')
        if (input.patch.defaultForeground === undefined) return read(input.id)
        requireHost()
        try {
          const saved = await port.request('saveBrowserPluginSettings', { provider, expectedRevision: input.expectedRevision, config: applyBrowserConfigurationPatch(current.config, input.patch) })
          return { id: input.id, revision: saved.revision, config: { defaultForeground: browserDefaultForeground(saved.config), executablePath: saved.config.executablePath }, effect: impact, readiness: 'not-tested' }
        } catch (error) {
          if (error instanceof BrowserPluginSettingsError) throw new ApplicationValidationError(error.code, error.message)
          throw error
        }
      } },
  ]
  return operations.map(operation => ({ ...operation, available: hostAvailable, unavailableReason: '当前服务没有连接桌面配置宿主。', validate: async (input, actor) => {
    if (actor.kind === 'behavior') throw new ApplicationValidationError('FORBIDDEN', '插件配置查询和修改需要本人明确请求，后台行为不能代为执行。')
    requireHost()
    await operation.validate?.(input, actor)
  } }))
}
