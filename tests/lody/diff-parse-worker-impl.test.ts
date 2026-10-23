/*
 * [INPUT]: Lody固定提交52e6eebe原测试；仅适配被测文件导入。
 * [OUTPUT]: 保留原断言与测试流程，验证迁入模块。
 * [POS]: tests/lody/diff-parse-worker-impl.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type WorkerHarness = {
  onmessage:
    | ((
        event: MessageEvent<{
          readonly id: number;
          readonly path: string;
          readonly oldText: string;
          readonly newText: string;
        }>
      ) => void)
    | null;
  postMessage: ReturnType<typeof vi.fn>;
};

describe('diff-parse.worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('strips full old/new parsed text before posting results to the main thread', async () => {
    const worker: WorkerHarness = {
      onmessage: null,
      postMessage: vi.fn(),
    };
    vi.stubGlobal('self', worker);
    await import('../../src/renderer/components/common/lody/diff-parse.worker');

    worker.onmessage?.({
      data: {
        id: 1,
        path: 'src/example.ts',
        oldText: 'const value = 1;\n',
        newText: 'const value = 2;\n',
      },
    } as MessageEvent<{
      readonly id: number;
      readonly path: string;
      readonly oldText: string;
      readonly newText: string;
    }>);

    const response = worker.postMessage.mock.calls[0]?.[0];
    expect(response).toMatchObject({ id: 1 });
    const result = readResult(response);
    expect(result.hunks.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('oldLines');
    expect(result).not.toHaveProperty('newLines');
  });
});

function readResult(response: unknown): { readonly hunks: readonly unknown[] } {
  if (
    typeof response !== 'object' ||
    response === null ||
    !('result' in response) ||
    typeof response.result !== 'object' ||
    response.result === null ||
    !('hunks' in response.result) ||
    !Array.isArray(response.result.hunks)
  ) {
    throw new Error('Expected diff parse worker result');
  }
  return response.result as { readonly hunks: readonly unknown[] };
}
