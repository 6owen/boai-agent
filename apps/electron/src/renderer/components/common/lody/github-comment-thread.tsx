/*
 * [INPUT]: Lody固定源码 packages/components/src/ui/diff-viewer/github-comment-thread.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/github-comment-thread.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
'use client';

import { useState, useCallback, useMemo } from 'react';
import { Check, ChevronDown, ExternalLink, SendHorizontal } from './icons';
import { classProps } from './class-props';
import type { CommentReferencePayload } from './shared-types';
import { useTranslation } from './translation';

import { colors, shadow } from './tokens';
import { corner, duration, ease, focus, radius, space } from './tokens';
import { Avatar } from './ui';
import { Badge } from './ui';
import { Button } from './ui';
import { Textarea } from './ui';
import { withClassName } from './stylex';
import type { GitHubReviewThread, GitHubReviewComment } from './shared-types';
import { SessionCommentMarkdown } from './session-comment-markdown';
import { useSendToChatState } from './comment-reference-state';

const MONO = 'var(--font-mono)';
const FOCUS_RING = `0 0 0 ${focus.ringWidth} ${colors.accent}`;
/** Lines of the diff hunk a single-line thread quotes, ending at its line. */
const EXCERPT_LINES = 4;
/** A multi-line thread quotes its range, up to this many lines. */
const EXCERPT_MAX_LINES = 8;

const styles = {
card: { className: 'lody-github-comment-thread-card' },
inset: { className: 'lody-github-comment-thread-inset' },
root: { className: 'lody-github-comment-thread-root' },
header: { className: 'lody-github-comment-thread-header' },
toggle: { className: 'lody-github-comment-thread-toggle' },
chevron: { className: 'lody-github-comment-thread-chevron' },
chevronCollapsed: { className: 'lody-github-comment-thread-chevronCollapsed' },
path: { className: 'lody-github-comment-thread-path' },
pathText: { className: 'lody-github-comment-thread-pathText' },
lineNo: { className: 'lody-github-comment-thread-lineNo' },
count: { className: 'lody-github-comment-thread-count' },
preview: { className: 'lody-github-comment-thread-preview' },
glyph: { className: 'lody-github-comment-thread-glyph' },
mirrored: { className: 'lody-github-comment-thread-mirrored' },
sent: { className: 'lody-github-comment-thread-sent' },
excerpt: { className: 'lody-github-comment-thread-excerpt' },
excerptLine: { className: 'lody-github-comment-thread-excerptLine' },
excerptAdded: { className: 'lody-github-comment-thread-excerptAdded' },
excerptRemoved: { className: 'lody-github-comment-thread-excerptRemoved' },
comments: { className: 'lody-github-comment-thread-comments' },
comment: { className: 'lody-github-comment-thread-comment' },
commentAvatar: { className: 'lody-github-comment-thread-commentAvatar' },
commentHead: { className: 'lody-github-comment-thread-commentHead' },
commentAuthor: { className: 'lody-github-comment-thread-commentAuthor' },
commentTime: { className: 'lody-github-comment-thread-commentTime' },
commentLink: { className: 'lody-github-comment-thread-commentLink' },
commentBody: { className: 'lody-github-comment-thread-commentBody' },
replyArea: { className: 'lody-github-comment-thread-replyArea' },
replyActions: { className: 'lody-github-comment-thread-replyActions' },
hint: { className: 'lody-github-comment-thread-hint' },
pushEnd: { className: 'lody-github-comment-thread-pushEnd' },
replyPrompt: { className: 'lody-github-comment-thread-replyPrompt' }
};

type RelativeTimeT = (key: string, fallback: string, opts?: Record<string, unknown>) => string;

/** "5m ago", in the product language. Shared by every GitHub comment surface. */
export function formatGitHubRelativeTime(isoString: string, t: RelativeTimeT): string {
  const date = new Date(isoString);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return t('sessions.prTab.timeJustNow', 'just now');
  if (minutes < 60) return t('sessions.prTab.timeMinutesAgo', '{{count}}m ago', { count: minutes });
  if (hours < 24) return t('sessions.prTab.timeHoursAgo', '{{count}}h ago', { count: hours });
  if (days < 30) return t('sessions.prTab.timeDaysAgo', '{{count}}d ago', { count: days });
  return date.toLocaleDateString();
}

/**
 * The lines of a thread's diff hunk the thread is about. GitHub cuts a review
 * comment's hunk at the commented line, so the excerpt is the hunk's tail: the
 * range for a multi-line thread, a few lines of lead-in for a single one.
 */
export function threadHunkExcerpt(thread: GitHubReviewThread): string[] {
  if (thread.subjectType !== 'line' || !thread.diffHunk) return [];
  const lines = thread.diffHunk.split('\n').filter((line) => !line.startsWith('@@'));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const { line, startLine } = thread.anchor;
  const span =
    startLine != null && startLine < line
      ? Math.min(line - startLine + 1, EXCERPT_MAX_LINES)
      : EXCERPT_LINES;
  return lines.slice(-span);
}

// -- GitHubCommentItem --

interface GitHubCommentItemProps {
  comment: GitHubReviewComment;
}

export function GitHubCommentItem({ comment }: GitHubCommentItemProps) {
  const { t } = useTranslation();
  const login = comment.user?.login ?? 'ghost';
  const avatarUrl = comment.user?.avatarUrl;

  return (
    <div {...classProps({ className: 'lody-comment-marker' }, styles.comment)}>
      <Avatar.Root size="small" {...classProps(styles.commentAvatar)}>
        {avatarUrl && <Avatar.Image src={avatarUrl} alt={login} />}
        <Avatar.Fallback>{login.slice(0, 2).toUpperCase()}</Avatar.Fallback>
      </Avatar.Root>
      <div {...classProps(styles.commentBody)}>
        <div {...classProps(styles.commentHead)}>
          <span {...classProps(styles.commentAuthor)}>{login}</span>
          <span {...classProps(styles.commentTime)}>
            {formatGitHubRelativeTime(comment.createdAt, t)}
          </span>
          <a
            href={comment.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('sessions.prTab.openOnGitHub', 'Open on GitHub')}
            {...classProps(styles.commentLink)}
          >
            <ExternalLink {...classProps(styles.glyph)} />
          </a>
        </div>
        <SessionCommentMarkdown body={comment.body} allowHtml />
      </div>
    </div>
  );
}

// -- GitHubCommentThread --

interface GitHubCommentThreadProps {
  thread: GitHubReviewThread;
  /**
   * `card` beside the code in a diff; `inset` inside a surface that is already
   * a card, such as a review in the PR tab.
   */
  surface?: 'card' | 'inset';
  /**
   * Name the file and line and quote the code. A thread drawn beside its own
   * line needs neither; one listed away from the diff needs both.
   */
  showAnchor?: boolean;
  onReply?: (input: { githubCommentId: number; body: string }) => void | Promise<void>;
  onSendToChat?: (reference: CommentReferencePayload) => boolean | void;
  commentReferenceKeys?: readonly string[];
  className?: string;
}

function githubSideToLody(side: 'LEFT' | 'RIGHT'): 'additions' | 'deletions' {
  return side === 'RIGHT' ? 'additions' : 'deletions';
}

export function GitHubCommentThread({
  thread,
  surface = 'card',
  showAnchor = false,
  onReply,
  onSendToChat,
  commentReferenceKeys,
  className,
}: GitHubCommentThreadProps) {
  const { t } = useTranslation();
  const [isReplying, setIsReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(thread.outdated);
  const commentCount = thread.comments.length;
  const firstComment = thread.comments[0];
  const excerpt = useMemo(
    () => (showAnchor ? threadHunkExcerpt(thread) : []),
    [showAnchor, thread]
  );

  const chatReference = useMemo<CommentReferencePayload | null>(() => {
    if (!firstComment) return null;
    return {
      source: 'github',
      path: thread.anchor.path,
      lineNumber: thread.anchor.line,
      side: githubSideToLody(thread.anchor.side),
      commentBody: firstComment.body,
      authorName: firstComment.user?.login ?? 'ghost',
      authorImage: firstComment.user?.avatarUrl,
      replies: thread.comments.slice(1).map((c) => ({
        authorName: c.user?.login ?? 'ghost',
        body: c.body,
      })),
      githubThreadId: thread.id,
    };
  }, [firstComment, thread]);

  const { isSentToChat, handleSendToChat } = useSendToChatState(
    chatReference,
    commentReferenceKeys,
    onSendToChat
  );

  const handleSubmitReply = useCallback(async () => {
    const trimmed = replyBody.trim();
    if (!trimmed || !onReply || isSubmittingReply) return;
    setIsSubmittingReply(true);
    try {
      await onReply({ githubCommentId: thread.id, body: trimmed });
      setReplyBody('');
      setIsReplying(false);
    } catch {
      // The parent owns user-visible error reporting; keep the reply text intact.
    } finally {
      setIsSubmittingReply(false);
    }
  }, [isSubmittingReply, onReply, replyBody, thread.id]);

  const handleReplyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSubmitReply();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isSubmittingReply) return;
        setIsReplying(false);
        setReplyBody('');
      }
    },
    [handleSubmitReply, isSubmittingReply]
  );

  const countLabel =
    commentCount === 1
      ? t('comments.countOne', '1 comment')
      : t('comments.count', '{{count}} comments', { count: commentCount });
  const hasLine = thread.subjectType === 'line' && thread.anchor.line > 0;
  const sendLabel = t('comments.sendToChat', 'Send to chat');

  return (
    <div
      data-diff-comment-thread-source="github"
      data-diff-comment-thread-id={String(thread.id)}
      {...withClassName(
        classProps(styles.root, surface === 'inset' ? styles.inset : styles.card),
        className
      )}
    >
      <div {...classProps(styles.header)}>
        <button
          type="button"
          aria-expanded={!isCollapsed}
          onClick={() => setIsCollapsed((v) => !v)}
          {...classProps(styles.toggle)}
        >
          <ChevronDown
            aria-hidden
            {...classProps(styles.chevron, isCollapsed && styles.chevronCollapsed)}
          />
          {showAnchor ? (
            <>
              <span {...classProps(styles.path)} title={thread.anchor.path}>
                <span {...classProps(styles.pathText)}>{thread.anchor.path}</span>
              </span>
              {hasLine && <span {...classProps(styles.lineNo)}>:{thread.anchor.line}</span>}
            </>
          ) : (
            <span {...classProps(styles.count)}>{countLabel}</span>
          )}
          {thread.outdated && <Badge>{t('comments.outdated', 'Outdated')}</Badge>}
          {isCollapsed && firstComment && (
            <span {...classProps(styles.preview)}>
              {firstComment.user?.login ?? 'ghost'}: {firstComment.body}
            </span>
          )}
        </button>
        {onSendToChat && (
          <Button
            type="button"
            variant="ghost"
            size="mini"
            icon
            onClick={handleSendToChat}
            title={sendLabel}
            aria-label={sendLabel}
            aria-pressed={isSentToChat}
          >
            {isSentToChat ? (
              <Check {...classProps(styles.glyph, styles.sent)} />
            ) : (
              <SendHorizontal {...classProps(styles.glyph, styles.mirrored)} />
            )}
          </Button>
        )}
      </div>

      {isCollapsed ? null : (
        <>
          {excerpt.length > 0 && (
            <pre data-thread-excerpt="" {...classProps(styles.excerpt)}>
              {excerpt.map((line, index) => (
                <code
                  key={index}
                  {...classProps(
                    styles.excerptLine,
                    line.startsWith('+') && styles.excerptAdded,
                    line.startsWith('-') && styles.excerptRemoved
                  )}
                >
                  {line || ' '}
                </code>
              ))}
            </pre>
          )}

          <div {...classProps(styles.comments)}>
            {thread.comments.map((comment) => (
              <GitHubCommentItem key={comment.id} comment={comment} />
            ))}
          </div>

          {onReply &&
            (isReplying ? (
              <div {...classProps(styles.replyArea)}>
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={handleReplyKeyDown}
                  placeholder={t('comments.replyOnGitHub', 'Reply (will be posted to GitHub)...')}
                  rows={2}
                  resize="none"
                  disabled={isSubmittingReply}
                  autoFocus
                />
                <div {...classProps(styles.replyActions)}>
                  <span {...classProps(styles.hint)}>Ctrl+Enter</span>
                  <span {...classProps(styles.pushEnd)} />
                  <Button
                    type="button"
                    size="small"
                    variant="ghost"
                    disabled={isSubmittingReply}
                    onClick={() => {
                      setIsReplying(false);
                      setReplyBody('');
                    }}
                  >
                    {t('comments.cancel', 'Cancel')}
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    variant="primary"
                    disabled={!replyBody.trim() || isSubmittingReply}
                    onClick={() => void handleSubmitReply()}
                  >
                    {t('comments.replyToGitHub', 'Reply on GitHub')}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsReplying(true)}
                {...classProps(styles.replyPrompt)}
              >
                {t('comments.writeReply', 'Write a reply...')}
              </button>
            ))}
        </>
      )}
    </div>
  );
}
