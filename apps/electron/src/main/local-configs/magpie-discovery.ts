/*
 * [INPUT]: Read-only hello probe and the fixed Magpie settings location under HOME/XDG_CONFIG_HOME.
 * [OUTPUT]: Verified running Magpie address/version; only the port field leaves settings parsing.
 * [POS]: Main-process local gateway discovery; never starts, updates or writes Magpie.
 * [PROTOCOL]: Update Header and local-configs/.folder.md when changing this module.
 */
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { MAGPIE_DEFAULT_URL, type GatewayIdentity } from '@boai/shared/domain/model-gateway'
import { readConfigFile } from './read-config-file'

export async function discoverLocalMagpie(probe: (baseUrl: string) => Promise<GatewayIdentity>, options: { home?: string; configHome?: string } = {}): Promise<GatewayIdentity> {
  try { return await probe(MAGPIE_DEFAULT_URL) } catch { /* Try only the documented local port fallback. */ }
  try {
    const configHome = options.configHome ?? process.env.XDG_CONFIG_HOME
    const root = configHome && isAbsolute(configHome) ? configHome : join(options.home ?? homedir(), '.config')
    const content = readConfigFile(join(root, 'magpie', 'settings.json'))
    const value: unknown = content === undefined ? undefined : JSON.parse(content)
    const port = value && typeof value === 'object' && 'port' in value ? value.port : undefined
    if (typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65535 && port !== 3425) return await probe(`http://127.0.0.1:${port}`)
  } catch { /* Do not expose private settings or paths in discovery failures. */ }
  throw new Error('未发现正在运行的 Magpie，请打开软件后重试，或手动填写网关根地址。')
}
