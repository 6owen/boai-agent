/*
 * [INPUT]: 显式选定的只读凭据来源、场景隔离目标、连接身份；不接收或输出明文密钥。
 * [OUTPUT]: 通过产品 CredentialVault 将一个已保存 API 凭据加密保存到本场目录；不启动模型、不修改来源。
 * [POS]: 真实混合运行时桌面验证的临时 Electron 凭据桥，不进入产品构建。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { app } from 'electron'
import { CredentialVault } from '../../src/main/vault'

app.setName('BoAI Agent')
app.setPath('userData', process.argv[2])
void (async () => {
  await app.whenReady(); app.dock?.hide()
  const key = await new CredentialVault(process.argv[3]).get(process.argv[5])
  if (!key) throw new Error('所选真实 API 连接没有可读取凭据')
  await new CredentialVault(process.argv[4]).set(process.argv[6], key)
  app.exit(0)
})().catch(() => {
  // Do not forward provider, Keychain or filesystem exception payloads into test output.
  process.stderr.write('无法安全读取所选模型凭据；未启动模型。\n')
  app.exit(1)
})
