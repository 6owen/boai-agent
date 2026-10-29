/*
 * [OUTPUT]: 独立AgentBrowser/BrowserViewer插件接入；上游工具、启停与运行回收保持独立。
 * [OUTPUT]: Private workspace-root and lightweight scope queries reach original validation without exposing them to renderers.
 * [OUTPUT]: Private run-credential bridge preserves structured errors and is never a public owner/run method.
 * [INPUT]: Authenticated same-machine desktop requests or the original Electron worker parent port.
 * [OUTPUT]: One explicit public/private host dispatcher into original AppService methods and schemas.
 * [POS]: Shared worker/attached-desktop entry; never registered on the public CLI server.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { z } from 'zod'
import { isPublicMethod } from '@boai/shared/ipc/public-methods'
import type { AppService } from './service'
import type { AutomationNoticeReceipt } from '@boai/shared/domain/automations'
import { CliError } from '@boai/shared/cli/protocol'
import type { RunCliAccessRequest } from '@boai/shared/cli/run-access'

export async function dispatchRuntime(service: AppService, method: string, input: unknown) {
  switch (method) {
    case '__browserPluginsChanged': z.undefined().parse(input); return service.browserPluginsChanged()
    case '__runCliAccess': {
      try { return { ok: true, result: await service.runCliAccess(input as RunCliAccessRequest) } }
      catch (error) { return { ok: false, code: error instanceof CliError ? error.code : 'HANDLER_ERROR', message: error instanceof Error ? error.message : '员工运行权限核验失败' } }
    }
    case '__receiveGatewayImport': return service.receiveGatewayImport(input)
    case '__installRuntimePlugin': { const value = z.object({ directory: z.string().min(1), expectedRevision: z.number().int().nonnegative() }).strict().parse(input); return service.installRuntimePlugin(value.directory, value.expectedRevision) }
    case '__startBrowserAction': return service.startBrowserAction(z.object({ actionId: z.string().min(1), generation: z.string().min(1), runId: z.string().min(1), workId: z.string().min(1).optional() }).strict().parse(input))
    case '__takeAutomationNotice': return service.takeAutomationNotice()
    case '__settleAutomationNotice': return service.settleAutomationNotice(input as AutomationNoticeReceipt)
    case '__backup': return service.backup(z.object({ destination: z.string().min(1) }).strict().parse(input).destination)
    case '__exportSkillLibrary': { const value = z.object({ input: z.unknown(), destination: z.string().min(1) }).strict().parse(input); return service.exportSkillLibrary(value.input, value.destination) }
    case 'getWorkspaceRoot': return service.handle('getWorkspaceRoot', input)
    case 'validateWorkspaceScope': return service.handle('validateWorkspaceScope', input)
    default: if (!isPublicMethod(method)) throw new Error('未知或未公开的桌面请求'); return service.handle(method, input)
  }
}
