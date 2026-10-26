/*
 * [INPUT]: 有界读取的 Codex auth.json 文本与配置目录。
 * [OUTPUT]: 按来源与账号生成的无凭据登录标识；同账号 token 轮换保持标识。
 * [POS]: main/local-configs 的 Codex 登录识别；不验证或刷新登录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DetectedOAuthConfig } from '@boai/shared/domain/local-configs'

export function detectCodexLogin(directory: string, auth: string | undefined): DetectedOAuthConfig | undefined {
  try {
    const data = JSON.parse(auth ?? '{}')
    const mode = typeof data.auth_mode === 'string' ? data.auth_mode.toLowerCase() : undefined
    if (mode ? !['chatgpt', 'chatgptauthtokens'].includes(mode) : !!data.OPENAI_API_KEY) return
    const tokens = data.tokens
    if (typeof tokens?.access_token !== 'string' || !tokens.access_token.trim()) return
    let identity = typeof tokens.account_id === 'string' ? tokens.account_id : ''
    if (!identity && typeof tokens.id_token === 'string') {
      try {
        // Claims only identify the source account; they do not prove authentication.
        const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString())
        if (typeof claims.sub === 'string') identity = claims.sub
      } catch { /* Opaque credentials still get a non-reversible source identifier. */ }
    }
    return {
      authType: 'oauth', sourceId: 'codex-cli', usable: true,
      configId: createHash('sha256').update(JSON.stringify([directory, 'oauth', identity || tokens.access_token])).digest('hex'),
      sourcePath: join(directory, 'auth.json'),
    }
  } catch { return undefined }
}
