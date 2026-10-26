/*
 * [INPUT]: Lody固定源码 packages/components/src/lib/diff-text-chunk-source.ts @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/diff-text-chunk-source.ts；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export type DiffTextChunkSide = 'old' | 'new';

export interface DiffTextChunkSource {
  readonly oldTextLength: number;
  readonly newTextLength: number;
  readonly readChunk: (input: {
    readonly side: DiffTextChunkSide;
    readonly startOffset: number;
    readonly endOffset: number;
  }) => Promise<string>;
  readonly dispose?: () => void;
}
