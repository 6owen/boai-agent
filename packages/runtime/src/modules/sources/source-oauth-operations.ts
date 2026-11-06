/*
 * [INPUT]: Original application authority, Source revision and explicit OAuth intent.
 * [OUTPUT]: Source authorization/status/cancel/disconnect adapters without tokens in receipts.
 * [POS]: WT2 application factory, aggregated only by WT1; SourceService owns lifecycle.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import { dataSourceIdentitySchema } from '@boai/shared/domain/sources'
import type { ApplicationOperation } from '../application/application-service'
import type { SourceService } from './source-service'
const authorization = z.object({ authorizationId: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export function sourceOAuthOperations(service: SourceService): ApplicationOperation[] {
  return [
    { name: 'sources.oauthStart', effect: 'write', resultType: 'SourceOAuthStatus', description: '明确为当前数据源发起PKCE授权；仅返回授权链接，不自动打开浏览器，不返回token。', input: dataSourceIdentitySchema.extend({ clientMetadataUrl: z.url().max(4000).optional() }).strict(),
      validate: async input => { service.oauthIdentity(input.id, input.expectedRevision); if (!service.get(input.id).enabled) throw new Error('请先启用数据源') },
      execute: (input, requestId) => service.startOAuth(input.id, input.expectedRevision, requestId!, input.clientMetadataUrl) },
    { name: 'sources.oauthStatus', effect: 'read', resultType: 'SourceOAuthStatus', description: '核对原授权请求，不重新发起登录。', input: authorization, execute: input => service.oauthStatus(input.authorizationId) },
    { name: 'sources.oauthCancel', effect: 'write', resultType: 'SourceOAuthStatus', description: '取消原授权请求；迟到回调不能更新任何连接。', input: authorization, execute: input => service.oauth.cancel(input.authorizationId) },
    { name: 'sources.oauthDisconnect', effect: 'write', resultType: 'DataSource', description: '删除本地OAuth凭据并关闭连接；不宣称撤销远端账号授权。', input: dataSourceIdentitySchema, execute: input => service.disconnectOAuth(input.id, input.expectedRevision) },
  ]
}
