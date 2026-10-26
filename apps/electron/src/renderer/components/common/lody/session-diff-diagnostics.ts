/*
 * [INPUT]: Lody固定源码 packages/components/src/lib/session-diff-diagnostics.ts @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-diff-diagnostics.ts；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export type SessionDiffSnapshotLike =
  | {
      kind: string;
      text?: string | null;
    }
  | null
  | undefined;

export const getSessionDiffErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === 'string'
        ? record.message
        : error instanceof Error
          ? error.message
          : String(error);
    const details = [
      typeof record.code === 'string' ? `code=${record.code}` : null,
      typeof record.path === 'string' ? `path=${record.path}` : null,
      typeof record.tag === 'string' ? `tag=${record.tag}` : null,
      typeof record.tagName === 'string' ? `tagName=${record.tagName}` : null,
      typeof record.fileType === 'string' ? `fileType=${record.fileType}` : null,
      typeof record.commitHash === 'string' ? `commitHash=${record.commitHash}` : null,
    ].filter((value): value is string => Boolean(value));

    return details.length > 0 ? `${message} (${details.join(', ')})` : message;
  }
  return String(error);
};

export const serializeSessionDiffError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    const record = error as unknown as Record<string, unknown>;
    return {
      name: error.name,
      message: error.message,
      ...(typeof record.code === 'string' ? { code: record.code } : {}),
      ...(typeof record.path === 'string' ? { path: record.path } : {}),
      ...(typeof record.tag === 'string' ? { tag: record.tag } : {}),
      ...(typeof record.tagName === 'string' ? { tagName: record.tagName } : {}),
      ...(typeof record.fileType === 'string' ? { fileType: record.fileType } : {}),
      ...(typeof record.commitHash === 'string' ? { commitHash: record.commitHash } : {}),
      ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
};

export const describeSessionDiffSnapshot = (
  snapshot: SessionDiffSnapshotLike
): Record<string, unknown> | null => {
  if (!snapshot) {
    return null;
  }

  if (snapshot.kind === 'text') {
    return {
      kind: snapshot.kind,
      textLength: typeof snapshot.text === 'string' ? snapshot.text.length : 0,
    };
  }

  return {
    kind: snapshot.kind,
  };
};
