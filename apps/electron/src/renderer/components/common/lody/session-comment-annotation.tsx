/*
 * [INPUT]: Lody固定源码 packages/components/src/ui/diff-viewer/session-comment-annotation.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-comment-annotation.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
'use client';

import type { DiffLineAnnotation } from '@pierre/diffs';
import type {
  CommentAnnotationMeta,
  CommentUser,
  GitHubReviewThread,
  DiffCommentSide,
  DiffViewerCommentCallbacks,
} from './shared-types';
import { SessionCommentDraft } from './session-comment-draft';
import { GitHubCommentThread } from './github-comment-thread';
import type { DraftState } from './use-session-comments';

interface SessionCommentAnnotationProps {
  annotation: DiffLineAnnotation<CommentAnnotationMeta>;
  currentUser?: CommentUser | null;
  prLinked?: boolean;
  draft: DraftState | null;
  getGitHubThreadsAtLine: (side: DiffCommentSide, lineNumber: number) => GitHubReviewThread[];
  callbacks: DiffViewerCommentCallbacks;
  commentReferenceKeys?: readonly string[];
  onCancelDraft: () => void;
}

export function SessionCommentAnnotation({
  annotation,
  currentUser,
  prLinked,
  draft,
  getGitHubThreadsAtLine,
  callbacks,
  commentReferenceKeys,
  onCancelDraft,
}: SessionCommentAnnotationProps) {
  const { side, lineNumber } = annotation;
  const ghThreads = getGitHubThreadsAtLine(side, lineNumber);
  const isDraft = draft?.anchor.side === side && draft.anchor.lineNumber === lineNumber;

  return (
    <div
      data-diff-comment-line={lineNumber}
      data-diff-comment-side={side}
      className="space-y-2 py-2 px-1 font-sans text-sm text-foreground max-w-full overflow-hidden"
    >
      {ghThreads.map((thread) => (
        <GitHubCommentThread
          key={`gh-${thread.id}`}
          thread={thread}
          onReply={callbacks.onReplyGitHubThread}
          onSendToChat={callbacks.onSendToChat}
          commentReferenceKeys={commentReferenceKeys}
        />
      ))}

      {isDraft && (
        <SessionCommentDraft
          anchor={draft.anchor}
          currentUser={currentUser}
          prLinked={prLinked}
          onSubmitToGitHub={callbacks.onCreateThreadToGitHub}
          onCancel={onCancelDraft}
        />
      )}
    </div>
  );
}
