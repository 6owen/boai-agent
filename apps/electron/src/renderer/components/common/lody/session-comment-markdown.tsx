/*
 * [INPUT]: Lody固定源码 packages/components/src/ui/diff-viewer/session-comment-markdown.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-comment-markdown.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
'use client';

import { memo } from 'react';
import { MarkdownRenderer } from './ui';
import { cn } from 'cn';

interface SessionCommentMarkdownProps {
  body: string;
  /** Enable raw HTML rendering (sanitized). Use for GitHub comment bodies. */
  allowHtml?: boolean;
  className?: string;
}

/**
 * Chat prose sits 4px inside its rail (`tailwind/index.css`). A comment sits
 * under its author's name instead, and a PR description under its title, so
 * its prose starts flush on the text edge above it. A descendant rule, which
 * StyleX cannot express.
 */
const FLUSH_PROSE = '[&_:is(p,h1,h2,h3,h4,h5,h6)]:px-0';

/**
 * Renders comment body as Markdown using the shared MarkdownRenderer.
 * Uses 'sm' size for compact display inside diff annotations.
 */
export const SessionCommentMarkdown = memo(function SessionCommentMarkdown({
  body,
  allowHtml = false,
  className,
}: SessionCommentMarkdownProps) {
  return (
    <MarkdownRenderer
      text={body}
      size="sm"
      allowHtml={false}
      className={cn(FLUSH_PROSE, className)}
    />
  );
});
