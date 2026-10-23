/*
 * [INPUT]: 场景独立 Desktop、生产成果/材料协议 fixture 与受管成果原件。
 * [OUTPUT]: 真实正文唯一标记、原件外改/恢复以及一次真实检索回执迟到控制；不替代检索仓库、来源核对或清理事务。
 * [POS]: Q1/Q2 Electron 支撑；文件操作只使用真实已登记成果身份，模型调用沿原离线协议。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { readFile, writeFile } from 'node:fs/promises'
import type { ArtifactVersion } from '../../../src/shared/domain/artifacts'
import type { Desktop } from './desktop'
export const SEARCH_ARTIFACT_BODY = 'ARTIFACT_V1'
export const SEARCH_MATERIAL_BODY = 'ARTIFACT_MATERIAL_EVIDENCE'
export const searchArtifactBytes = (artifact: ArtifactVersion) => readFile(artifact.path, 'utf8')
export const writeSearchArtifactBytes = (artifact: ArtifactVersion, text: string) => writeFile(artifact.path, text)

export async function delayNextSearchReply(runtime: Desktop, keyword: string) {
  await runtime.app.evaluate(({ ipcMain }, keyword) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const state = { captured: false, settled: false, released: false, release: () => {}, dispose: () => {} }
    const ready = new Promise<void>(resolve => { state.release = () => { state.released = true; resolve() } })
    state.dispose = () => { state.release(); ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', original) }
    Object.assign(globalThis, { __boaiSearchReplyDelay: state })
    ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', async (event, payload) => {
      if (state.captured || payload.method !== 'searchConversations' || payload.input?.keyword !== keyword) return original(event, payload)
      const result = await original(event, payload); state.captured = true
      await ready; state.settled = true; return result
    })
  }, keyword)
  type SearchGlobals = typeof globalThis & { __boaiSearchReplyDelay: { captured: boolean; settled: boolean; release(): void; dispose(): void } }
  return {
    captured: () => runtime.app.evaluate(() => (globalThis as SearchGlobals).__boaiSearchReplyDelay.captured),
    settled: () => runtime.app.evaluate(() => (globalThis as SearchGlobals).__boaiSearchReplyDelay.settled),
    release: () => runtime.app.evaluate(() => (globalThis as SearchGlobals).__boaiSearchReplyDelay.release()),
    dispose: () => runtime.app.evaluate(() => (globalThis as SearchGlobals).__boaiSearchReplyDelay.dispose()),
  }
}
