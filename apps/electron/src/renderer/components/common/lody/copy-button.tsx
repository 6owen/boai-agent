/*
 * [INPUT]: Lody固定源码 packages/components/src/ui/copy-button.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/copy-button.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
'use client';

import React, { useState } from 'react';

import { Check, Copy } from './icons';
import { Button } from './ui';
import { cn } from 'cn';

export const CopyButton = ({
  value,
  className,
  ...props
}: {
  value: string;
  className?: string;
} & React.ComponentProps<'button'>) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!value) return;
    e.stopPropagation();
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <Button
      variant="ghost"
      data-state={copied ? 'copied' : 'not-copied'}
      size="small"
      {...props}
      className={cn('relative shrink-0', className)}
      onClick={handleCopy}
    >
      <span className="sr-only">Copy</span>
      <Check
        className={cn(
          'w-2 h-2 absolute inset-0 m-auto transition-all duration-200',
          copied ? 'opacity-100 blur-0 scale-100' : 'opacity-0 blur-xs scale-75'
        )}
        aria-label="Copied"
      />
      <Copy
        className={cn(
          'w-2 h-2 absolute inset-0 m-auto transition-all duration-200',
          !copied ? 'opacity-100 blur-0 scale-100' : 'opacity-0 blur-xs scale-75'
        )}
        aria-label="Copy"
      />
    </Button>
  );
};
