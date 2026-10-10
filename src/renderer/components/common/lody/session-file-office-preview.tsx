/*
 * [INPUT]: Lody固定源码 packages/components/src/components/sessions/session-file-office-preview.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-file-office-preview.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { classProps } from './class-props';
import { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from './translation';
import { Spinner } from './ui';
import { colors } from './tokens';
import { space } from './tokens';
import type { SessionFileErrorActions } from './session-file-actions';
import { scheduleFilePreviewWhenIdle } from './session-file-preview-idle';
import {
  OfficePreviewTooLargeError,
  readOfficePreviewBytes,
  type OfficePreviewKind,
} from './session-file-office-source';
import { SessionFileNoticeCard } from './session-file-error-state';

export type OfficeRenderer = ComponentType<{
  readonly buffer: ArrayBuffer;
  readonly path: string;
  readonly fileActions?: SessionFileErrorActions;
}>;

const styles = {
root: { className: 'lody-session-file-office-preview-root' },
loading: { className: 'lody-session-file-office-preview-loading' }
};

async function loadRenderer(kind: OfficePreviewKind): Promise<OfficeRenderer> {
  switch (kind) {
    case 'docx':
      return (await import('./session-file-docx-renderer')).SessionFileDocxRenderer;
    case 'xlsx':
      return (await import('./session-file-xlsx-renderer')).SessionFileXlsxRenderer;
    case 'pptx':
      return (await import('./session-file-pptx-renderer')).SessionFilePptxRenderer;
    default:
      throw new Error(`Unsupported office preview: ${kind}`);
  }
}

export function SessionFileOfficePreview({
  kind,
  path,
  bytes,
  url,
  active,
  fileActions,
}: {
  readonly kind: OfficePreviewKind;
  readonly path: string;
  readonly bytes?: Uint8Array;
  readonly url?: string;
  readonly active: boolean;
  readonly fileActions?: SessionFileErrorActions;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; buffer: ArrayBuffer; Renderer: OfficeRenderer }
    | { status: 'error'; tooLarge: boolean }
  >({ status: 'loading' });

  useEffect(() => {
    if (!active) {
      setState({ status: 'loading' });
      return undefined;
    }
    const controller = new AbortController();
    let disposed = false;
    const start = () => {
      void readOfficePreviewBytes({ bytes, url, signal: controller.signal })
        .then(async (buffer) => ({ buffer, Renderer: await loadRenderer(kind) }))
        .then(
          ({ buffer, Renderer }) => {
            if (!disposed) setState({ status: 'ready', buffer, Renderer });
          },
          (error: unknown) => {
            if (!disposed) {
              setState({ status: 'error', tooLarge: error instanceof OfficePreviewTooLargeError });
            }
          }
        );
    };
    setState({ status: 'loading' });
    const cancelIdle = scheduleFilePreviewWhenIdle(start);
    return () => {
      disposed = true;
      controller.abort();
      cancelIdle();
    };
  }, [active, bytes, kind, url]);

  if (state.status === 'error') {
    return (
      <SessionFileNoticeCard
        presentation={{
          title: t('sessions.fileViewer.office.failedTitle', 'Document preview unavailable'),
          description: state.tooLarge
            ? t(
                'sessions.fileViewer.office.tooLarge',
                'This document exceeds the 25 MB preview limit. Open it in the default app.'
              )
            : t(
                'sessions.fileViewer.office.failedMessage',
                'This document could not be opened. Try opening it in the default app.'
              ),
        }}
        fileActions={fileActions}
      />
    );
  }
  if (!active || state.status === 'loading') {
    return (
      <div {...classProps(styles.loading)} role="status">
        <Spinner label={null} />
        {t('sessions.fileViewer.office.loading', 'Loading document…')}
      </div>
    );
  }
  const { Renderer, buffer } = state;
  return (
    <div {...classProps(styles.root)}>
      <Renderer buffer={buffer} path={path} fileActions={fileActions} />
    </div>
  );
}
