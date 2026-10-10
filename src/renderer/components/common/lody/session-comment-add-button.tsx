/*
 * [INPUT]: Lody固定源码 packages/components/src/ui/diff-viewer/session-comment-add-button.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-comment-add-button.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
'use client';

import { Plus } from './icons';
import { cn } from 'cn';

interface SessionCommentAddButtonProps {
  onClick: () => void;
  className?: string;
}

/**
 * The "+" button shown when hovering over a commentable line in the diff viewer.
 * Positioned in the gutter area, similar to GitHub's review button.
 */
export function SessionCommentAddButton({ onClick, className }: SessionCommentAddButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-sm',
        'bg-primary text-primary-foreground shadow-xs',
        'hover:bg-primary/90 active:scale-95',
        'transition-all duration-100',
        'touch-action-manipulation',
        className
      )}
      aria-label="Add comment"
    >
      <Plus className="h-3 w-3" />
    </button>
  );
}
