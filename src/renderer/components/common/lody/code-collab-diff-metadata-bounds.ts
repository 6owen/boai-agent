/*
 * [INPUT]: Lody固定源码 packages/components/src/lib/code-collab-diff-metadata-bounds.ts @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/code-collab-diff-metadata-bounds.ts；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { FileDiffMetadata } from '@pierre/diffs';

export const DEFAULT_CODE_COLLAB_FRONTIER_DIFF_MAX_PARSED_CHANGED_LINES = 20_000;
export const DEFAULT_CODE_COLLAB_FRONTIER_DIFF_MAX_PARSED_HUNK_LINES = 40_000;
export const DEFAULT_CODE_COLLAB_FRONTIER_DIFF_MAX_PARSED_HUNK_TEXT_LENGTH = 1024 * 1024;

export type CodeCollabFrontierDiffTooLargeReason =
  | 'source-text-too-large'
  | 'parsed-changed-lines-too-large'
  | 'parsed-hunk-lines-too-large'
  | 'parsed-hunk-text-too-large';

type ParsedFileDiffComplexity = {
  readonly hunkCount: number;
  readonly changedLines: number;
  readonly hunkLines: number;
  readonly hunkTextLength: number;
};

type ParsedFileDiffBounds = {
  readonly maxChangedLines?: number;
  readonly maxHunkLines?: number;
  readonly maxHunkTextLength?: number;
};

type BoundedParsedFileDiffResult =
  | {
      readonly status: 'ready';
      readonly fileDiff: FileDiffMetadata;
      readonly complexity: ParsedFileDiffComplexity;
    }
  | {
      readonly status: 'too-large';
      readonly reason: CodeCollabFrontierDiffTooLargeReason;
      readonly complexity: ParsedFileDiffComplexity;
    };

export function boundParsedFileDiffForMainThread(
  fileDiff: FileDiffMetadata,
  bounds: ParsedFileDiffBounds = {}
): BoundedParsedFileDiffResult {
  const complexity = measureParsedFileDiffComplexity(fileDiff);
  if (bounds.maxChangedLines !== undefined && complexity.changedLines > bounds.maxChangedLines) {
    return {
      status: 'too-large',
      reason: 'parsed-changed-lines-too-large',
      complexity,
    };
  }
  if (bounds.maxHunkLines !== undefined && complexity.hunkLines > bounds.maxHunkLines) {
    return {
      status: 'too-large',
      reason: 'parsed-hunk-lines-too-large',
      complexity,
    };
  }
  if (
    bounds.maxHunkTextLength !== undefined &&
    complexity.hunkTextLength > bounds.maxHunkTextLength
  ) {
    return {
      status: 'too-large',
      reason: 'parsed-hunk-text-too-large',
      complexity,
    };
  }
  return {
    status: 'ready',
    fileDiff: stripParsedFileDiffFullText(fileDiff),
    complexity,
  };
}

export function stripParsedFileDiffFullText(fileDiff: FileDiffMetadata): FileDiffMetadata {
  const stripped: FileDiffMetadata = { ...fileDiff };
  delete stripped.oldLines;
  delete stripped.newLines;
  return stripped;
}

export function measureParsedFileDiffComplexity(
  fileDiff: FileDiffMetadata
): ParsedFileDiffComplexity {
  let changedLines = 0;
  let hunkLines = 0;
  let hunkTextLength = 0;

  for (const hunk of fileDiff.hunks) {
    changedLines += Math.max(hunk.additionLines, hunk.deletionLines);
    for (const content of hunk.hunkContent) {
      if (content.type === 'context') {
        hunkLines += content.lines.length;
        hunkTextLength += countLinesTextLength(content.lines);
      } else {
        hunkLines += content.additions.length + content.deletions.length;
        hunkTextLength +=
          countLinesTextLength(content.additions) + countLinesTextLength(content.deletions);
      }
    }
  }

  return {
    hunkCount: fileDiff.hunks.length,
    changedLines,
    hunkLines,
    hunkTextLength,
  };
}

function countLinesTextLength(lines: readonly string[]): number {
  let length = 0;
  for (const line of lines) {
    length += line.length;
  }
  return length;
}
