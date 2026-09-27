import { safeStorage } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export class CredentialVault {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private file: string) {}
  private async read(): Promise<Record<string, string>> {
    try { return JSON.parse(await readFile(this.file, 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw new Error('无法读取已保存的模型凭据。') }
  }
  private check() {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
      throw new Error('系统密钥存储不可用，无法安全保存凭据。请启用系统钥匙串后重试。')
    }
  }
  async get(id: string): Promise<string | undefined> {
    await this.queue
    const value = (await this.read())[id]
    if (!value) return undefined
    this.check()
    try { return safeStorage.decryptString(Buffer.from(value, 'base64')) }
    catch { throw new Error('无法解密模型凭据，请重新填写 API Key。') }
  }
  private mutate(operation: (values: Record<string, string>) => void) {
    const next = this.queue.then(async () => {
      const values = await this.read()
      operation(values)
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(`${this.file}.tmp`, JSON.stringify(values), { mode: 0o600 })
      await rename(`${this.file}.tmp`, this.file)
    })
    this.queue = next.catch(() => undefined)
    return next
  }
  set(id: string, value: string) {
    this.check()
    return this.mutate((values) => { values[id] = safeStorage.encryptString(value).toString('base64') })
  }
  delete(id: string) { return this.mutate((values) => { delete values[id] }) }
}
