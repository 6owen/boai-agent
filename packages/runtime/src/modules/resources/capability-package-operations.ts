/*
 * [INPUT]: Existing application request/receipt authority and the capability domain services.
 * [OUTPUT]: Discoverable package operations; only settled domain receipts recover application results, preserving request identity and credential omission.
 * [POS]: Thin application adapter for WT1 aggregation; no new IPC or management authority.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import { bindCapabilityPackageSchema, capabilityPackageIdentitySchema, inspectCapabilityPackageSchema, installCapabilityPackageSchema, setCapabilityPackageEnabledSchema, unbindCapabilityPackageSchema, updateCapabilityPackageSchema } from '@boai/shared/domain/capability-packages'
import type { ApplicationOperation } from '../application/application-service'
import { ApplicationValidationError } from '../application/application-service'
import type { CapabilityPackageServices } from './capability-package-services'

const id = z.string().min(1).max(200)
export function capabilityPackageOperations(service: CapabilityPackageServices): ApplicationOperation[] {
  const packages = service.packages
  const wrap = (name: string, input: z.ZodType, execute: ApplicationOperation['execute'], effect: 'read' | 'write', description: string): ApplicationOperation => ({ name: `capabilityPackages.${name}`, input, execute, effect, description, resultType: 'CapabilityPackageResult' })
  const writes = [
    ['install', installCapabilityPackageSchema, '导入明确本地包，默认停用；预检不执行安装脚本。'],
    ['bind', bindCapabilityPackageSchema, '按员工和包版本授权选中贡献；bobo也须绑定。'],
    ['unbind', unbindCapabilityPackageSchema, '撤回员工包授权并等待资源实际退出。'],
    ['setEnabled', setCapabilityPackageEnabledSchema, '启停原包；停用先撤回新调用再排空。'],
    ['update', updateCapabilityPackageSchema, '活动租约存在时拒绝更新；变化贡献须明确获准。'],
    ['uninstall', capabilityPackageIdentitySchema, '移除本包拥有的未修改副本，保留定制和共享对象。'],
  ] as const
  return [
    wrap('list', z.object({}).strict(), async () => packages.list(), 'read', '读取实际包安装及支持范围；安装不等于启用。'),
    wrap('inspect', inspectCapabilityPackageSchema, input => packages.inspect(input.path), 'read', '只读检查用户提供的本地目录，返回身份/hash/贡献和不支持项。'),
    wrap('get', z.object({ installationId: id }).strict(), async input => ({ installation: packages.get(input.installationId), bindings: packages.listBindings(input.installationId) }), 'read', '读取安装和员工绑定版本，不返回凭据。'),
    wrap('receipt', z.union([z.object({ requestId: id }).strict(), z.object({ applicationReceiptId: z.string().regex(/^[a-f0-9]{64}$/) }).strict()]), input => packages.getOperation('applicationReceiptId' in input ? `application-${input.applicationReceiptId}` : input.requestId), 'read', '用原领域请求或应用回执身份查询结果，未知时不创建新请求。'),
    ...writes.map(([action, schema, description]) => ({
      ...wrap(action, (schema as z.ZodObject<any>).omit({ requestId: true }), async (input, requestId) => {
        try { return await packages[action]({ ...input, requestId: requestId! }) }
        catch (error) {
          // Every package effect is preceded by its durable intent. A reliable absent intent proves preflight rejection.
          if (!await packages.getOperation(requestId!)) throw new ApplicationValidationError('INVALID_INPUT', error instanceof Error ? error.message : '能力包操作前核对未通过')
          throw error
        }
      }, 'write', description),
      recover: async (requestId: string) => {
        const receipt = await packages.getOperation(requestId)
        const cleanupPending = receipt && ['update', 'uninstall'].includes(receipt.action) && receipt.phase === 'committed'
        return receipt && !cleanupPending && ['completed', 'failed'].includes(receipt.status) ? receipt : undefined
      },
    })),
    { ...wrap('configure', z.object({ installationId: id, expectedRevision: z.number().int().positive(), contributionId: id, expectedSourceRevision: z.number().int().positive(), credential: z.string().max(32000) }).strict(), (input, requestId) => service.configure(input, requestId!), 'write', '通过原SecretStore配置本包贡献凭据；不会测试连接或修改权限。'), recover: requestId => service.configureReceipt(requestId),
      validate: async input => { if (packages.get(input.installationId).revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '能力包版本已变化') } },
    { ...wrap('recover', z.object({ originalRequestId: id }).strict(), (input, requestId) => packages.recover(input.originalRequestId, requestId!), 'write', '核对并清理原中断准备，不重放MCP或业务调用。'), recover: requestId => packages.recoveryReceipt(requestId) },
  ]
}
