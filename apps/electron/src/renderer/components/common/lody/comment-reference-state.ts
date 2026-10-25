/*
 * [INPUT]: Lody固定源码 packages/components/src/components/chat/comment-reference-state.ts @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/comment-reference-state.ts；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
'use client';

import { useState, useCallback, useMemo } from 'react';
import type { CommentReferencePayload } from './shared-types';
import type { CommentReferenceChipItem } from './shared-types';

export const EMPTY_COMMENT_REFERENCE_KEYS: readonly string[] = [];

export function getCommentReferenceKey(reference: CommentReferencePayload): string {
  return JSON.stringify([
    reference.source,
    reference.path,
    reference.lineNumber,
    reference.side,
    reference.threadId ?? null,
    reference.githubThreadId ?? null,
  ]);
}

export function getCommentReferenceKeys(items: readonly CommentReferenceChipItem[]): string[] {
  return items.map((item) => getCommentReferenceKey(item.reference));
}

export function hasCommentReference(
  items: readonly CommentReferenceChipItem[],
  reference: CommentReferencePayload
): boolean {
  const key = getCommentReferenceKey(reference);
  return items.some((item) => getCommentReferenceKey(item.reference) === key);
}

export function addCommentReferenceItem(
  items: readonly CommentReferenceChipItem[],
  reference: CommentReferencePayload,
  createLocalId: () => string
): { items: CommentReferenceChipItem[]; selected: true; changed: boolean } {
  if (hasCommentReference(items, reference)) {
    return { items: items as CommentReferenceChipItem[], selected: true, changed: false };
  }
  return {
    items: [...items, { localId: createLocalId(), reference }],
    selected: true,
    changed: true,
  };
}

export function toggleCommentReferenceItem(
  items: readonly CommentReferenceChipItem[],
  reference: CommentReferencePayload,
  createLocalId: () => string
): { items: CommentReferenceChipItem[]; selected: boolean; changed: true } {
  const key = getCommentReferenceKey(reference);
  const idx = items.findIndex((item) => getCommentReferenceKey(item.reference) === key);
  if (idx >= 0) {
    return {
      items: items.filter((_, i) => i !== idx),
      selected: false,
      changed: true,
    };
  }
  return {
    items: [...items, { localId: createLocalId(), reference }],
    selected: true,
    changed: true,
  };
}

/**
 * Shared hook for the controlled/uncontrolled "sent to chat" toggle state
 * used by GitHub comment threads.
 */
export function useSendToChatState(
  chatReference: CommentReferencePayload | null,
  commentReferenceKeys: readonly string[] | undefined,
  onSendToChat: ((reference: CommentReferencePayload) => boolean | void) | undefined
): { isSentToChat: boolean; handleSendToChat: () => void } {
  const [localSentToChat, setLocalSentToChat] = useState(false);

  const controlledSentToChat = useMemo(
    () =>
      chatReference && commentReferenceKeys
        ? commentReferenceKeys.includes(getCommentReferenceKey(chatReference))
        : undefined,
    [chatReference, commentReferenceKeys]
  );
  const isSentToChat = controlledSentToChat ?? localSentToChat;

  const handleSendToChat = useCallback(() => {
    if (!onSendToChat || !chatReference) return;
    const selected = onSendToChat(chatReference);
    if (commentReferenceKeys === undefined) {
      setLocalSentToChat(typeof selected === 'boolean' ? selected : true);
    }
  }, [chatReference, commentReferenceKeys, onSendToChat]);

  return { isSentToChat, handleSendToChat };
}
