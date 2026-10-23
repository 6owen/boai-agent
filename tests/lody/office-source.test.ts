/*
 * [INPUT]: 上游Office字节读取入口与明确取消/超限数据。
 * [OUTPUT]: 核对原25MiB边界、取消与读取隔离；不模拟文档渲染成功。
 * [POS]: tests/lody宿主连接边界测试。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { describe, expect, it, vi } from 'vitest'
import { MAX_OFFICE_PREVIEW_BYTES, OfficePreviewTooLargeError, readOfficePreviewBytes } from '../../src/renderer/components/common/lody/session-file-office-source'
describe('copied Office input boundaries', () => {
  it('keeps bytes independent from a mutable host DTO and performs no fetch', async () => {
    const bytes = new Uint8Array([1, 2, 3]), fetcher = vi.fn()
    const result = await readOfficePreviewBytes({ bytes, signal: new AbortController().signal, fetcher })
    bytes[0] = 99
    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3])); expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects oversized input and cancellation before starting work', async () => {
    const fetcher = vi.fn(), signal = AbortSignal.abort()
    await expect(readOfficePreviewBytes({ bytes: new Uint8Array(MAX_OFFICE_PREVIEW_BYTES + 1), signal: new AbortController().signal, fetcher })).rejects.toBeInstanceOf(OfficePreviewTooLargeError)
    await expect(readOfficePreviewBytes({ bytes: new Uint8Array(1), signal, fetcher })).rejects.toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
