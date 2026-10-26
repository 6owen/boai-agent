/*
 * [INPUT]: Lody固定源码 packages/components/src/ui/diff-viewer/session-comment-draft.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-comment-draft.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
'use client';

import { useState, useCallback } from 'react';
import { classProps } from './class-props';
import { useTranslation } from './translation';

import { UserAvatar } from './ui';
import { colors, shadow } from './tokens';
import { corner, radius, space } from './tokens';
import { Button } from './ui';
import { Textarea } from './ui';
import { withClassName } from './stylex';
import type { CommentAnchor, CommentUser } from './shared-types';

const styles = {
card: { className: 'lody-session-comment-draft-card' },
header: { className: 'lody-session-comment-draft-header' },
author: { className: 'lody-session-comment-draft-author' },
destination: { className: 'lody-session-comment-draft-destination' },
field: { className: 'lody-session-comment-draft-field' },
footer: { className: 'lody-session-comment-draft-footer' },
hint: { className: 'lody-session-comment-draft-hint' },
pushEnd: { className: 'lody-session-comment-draft-pushEnd' }
};

interface SessionCommentDraftProps {
  anchor: CommentAnchor;
  currentUser?: CommentUser | null;
  /** Whether a PR is linked to this session */
  prLinked?: boolean;
  onSubmitToGitHub?: (input: { anchor: CommentAnchor; body: string }) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
}

export function SessionCommentDraft({
  anchor,
  currentUser,
  prLinked = false,
  onSubmitToGitHub,
  onCancel,
  className,
}: SessionCommentDraftProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || isSubmitting) return;

    if (!prLinked || !onSubmitToGitHub) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitToGitHub({ anchor, body: trimmed });
      setBody('');
      onCancel?.();
    } catch {
      // The parent owns user-visible error reporting; keep the draft text intact.
    } finally {
      setIsSubmitting(false);
    }
  }, [anchor, body, isSubmitting, onCancel, onSubmitToGitHub, prLinked]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    },
    [handleSubmit, onCancel]
  );

  return (
    <div {...withClassName(classProps(styles.card), className)}>
      <div {...classProps(styles.header)}>
        {currentUser && (
          <UserAvatar
            user={{
              id: currentUser.id,
              name: currentUser.name,
              image: currentUser.image,
            }}
            size="small"
          />
        )}
        <span {...classProps(styles.author)}>
          {currentUser?.name ?? t('comments.anonymous', 'Anonymous')}
        </span>
        <span {...classProps(styles.destination)}>
          {t('comments.githubOnly', 'Posts to GitHub')}
        </span>
      </div>

      <div {...classProps(styles.field)}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('comments.placeholder', 'Leave a comment... (Markdown supported)')}
          rows={3}
          resize="none"
          disabled={isSubmitting}
          autoFocus
        />
      </div>

      <div {...classProps(styles.footer)}>
        <span {...classProps(styles.hint)}>Ctrl+Enter</span>
        <span {...classProps(styles.pushEnd)} />
        <Button
          type="button"
          size="small"
          variant="ghost"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          {t('comments.cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          size="small"
          variant="primary"
          disabled={!body.trim() || isSubmitting || !prLinked || !onSubmitToGitHub}
          onClick={() => void handleSubmit()}
        >
          {t('comments.comment', 'Comment')}
        </Button>
      </div>
    </div>
  );
}
