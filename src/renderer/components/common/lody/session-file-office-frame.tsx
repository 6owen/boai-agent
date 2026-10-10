/*
 * [INPUT]: Lody固定源码 packages/components/src/components/sessions/session-file-office-frame.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-file-office-frame.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { classProps } from './class-props';
import type { ReactNode } from 'react';
import { colors } from './tokens';
import { space } from './tokens';

const styles = {
root: { className: 'lody-session-file-office-frame-root' },
toolbar: { className: 'lody-session-file-office-frame-toolbar' },
body: { className: 'lody-session-file-office-frame-body' },
group: { className: 'lody-session-file-office-frame-group' },
spacer: { className: 'lody-session-file-office-frame-spacer' },
zoom: { className: 'lody-session-file-office-frame-zoom' },
label: { className: 'lody-session-file-office-frame-label' }
};

export const officeFrameStyles = styles;

export function OfficeViewerFrame({
  label,
  toolbar,
  children,
}: {
  readonly label: string;
  readonly toolbar: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section {...classProps(styles.root)} aria-label={label}>
      {toolbar !== null ? <div {...classProps(styles.toolbar)}>{toolbar}</div> : null}
      <div {...classProps(styles.body)}>{children}</div>
    </section>
  );
}
