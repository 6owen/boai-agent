/*
 * [INPUT]: Lody固定源码 packages/components/src/components/sessions/session-file-docx-renderer.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-file-docx-renderer.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { classProps } from './class-props';
import { useEffect, useState } from 'react';
import { useTranslation } from './translation';
import { ZoomIn, ZoomOut } from './icons';
import {
  parseDocxForViewer,
  ReactDocxViewer,
  setWasmSource,
  type ParsedDocxDocument,
  type ViewerZoomLevel,
} from '@extend-ai/react-docx';
import wasmUrl from '@extend-ai/react-docx/docx_wasm_bg.wasm?url';
import { Button } from './ui';
import { Select } from './ui';
import { Spinner } from './ui';
import { colors } from './tokens';
import { space } from './tokens';
import type { SessionFileErrorActions } from './session-file-actions';
import { SessionFileNoticeCard } from './session-file-error-state';
import { OfficeViewerFrame, officeFrameStyles } from './session-file-office-frame';

setWasmSource(wasmUrl);

const styles = {
pageHost: { className: 'lody-session-file-docx-renderer-pageHost' },
loading: { className: 'lody-session-file-docx-renderer-loading' }
};

const ZOOM_LEVELS = ['fit-page', 'fit-width', 'automatic', 50, 75, 100, 125, 150, 200] as const;

export function SessionFileDocxRenderer({
  buffer,
  path,
  fileActions,
}: {
  readonly buffer: ArrayBuffer;
  readonly path: string;
  readonly fileActions?: SessionFileErrorActions;
}) {
  const { t } = useTranslation();
  const [document, setDocument] = useState<ParsedDocxDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState<ViewerZoomLevel>('fit-width');

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    setDocument(null);
    setFailed(false);
    void parseDocxForViewer(buffer, {
      signal: controller.signal,
      useWorker: 'required',
      loadEmbeddedFonts: 'defer',
      fileName: path.split('/').pop(),
    }).then(
      (parsed) => {
        if (disposed) parsed.dispose();
        else setDocument(parsed);
      },
      () => {
        if (!disposed) setFailed(true);
      }
    );
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [buffer, path]);

  useEffect(() => () => document?.dispose(), [document]);

  if (failed) {
    return (
      <SessionFileNoticeCard
        presentation={{
          title: t('sessions.fileViewer.office.failedTitle', 'Document preview unavailable'),
          description: t(
            'sessions.fileViewer.office.failedMessage',
            'This document could not be opened. Try opening it in the default app.'
          ),
        }}
        fileActions={fileActions}
      />
    );
  }

  const zoomOptions = ZOOM_LEVELS.map((level) => ({
    value: String(level),
    label:
      level === 'fit-page'
        ? t('sessions.fileViewer.pdf.fitPage', 'Fit page')
        : level === 'fit-width'
          ? t('sessions.fileViewer.pdf.fitWidth', 'Fit width')
          : level === 'automatic'
            ? t('sessions.fileViewer.pdf.automaticZoom', 'Automatic')
            : `${level}%`,
  }));
  return (
    <OfficeViewerFrame
      label={t('sessions.fileViewer.office.docxViewer', 'DOCX viewer')}
      toolbar={
        <div {...classProps(officeFrameStyles.group)}>
          <Button
            type="button"
            variant="ghost"
            size="mini"
            icon
            aria-label={t('sessions.fileViewer.pdf.zoomOut', 'Zoom out')}
            disabled={!document}
            onClick={() =>
              setZoom((current) => Math.max(25, (typeof current === 'number' ? current : 100) - 25))
            }
          >
            <ZoomOut size={16} aria-hidden />
          </Button>
          <span {...classProps(officeFrameStyles.zoom)}>
            <Select.Root
              items={zoomOptions}
              value={String(zoom)}
              onValueChange={(value) => {
                if (value)
                  setZoom(Number.isNaN(Number(value)) ? (value as ViewerZoomLevel) : Number(value));
              }}
            >
              <Select.Trigger
                size="small"
                aria-label={t('sessions.fileViewer.pdf.zoomLevel', 'Zoom level')}
              >
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {zoomOptions.map((option) => (
                  <Select.Item key={option.value} value={option.value}>
                    {option.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="mini"
            icon
            aria-label={t('sessions.fileViewer.pdf.zoomIn', 'Zoom in')}
            disabled={!document}
            onClick={() =>
              setZoom((current) =>
                Math.min(200, (typeof current === 'number' ? current : 100) + 25)
              )
            }
          >
            <ZoomIn size={16} aria-hidden />
          </Button>
        </div>
      }
    >
      {document ? (
        <div {...classProps(styles.pageHost)} data-native-selection-allow>
          <ReactDocxViewer document={document} zoom={zoom} />
        </div>
      ) : (
        <div {...classProps(styles.loading)} role="status">
          <Spinner label={null} />
          {t('sessions.fileViewer.office.loading', 'Loading document…')}
        </div>
      )}
    </OfficeViewerFrame>
  );
}
