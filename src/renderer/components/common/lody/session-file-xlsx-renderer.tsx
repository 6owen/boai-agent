/*
 * [INPUT]: Lody固定源码 packages/components/src/components/sessions/session-file-xlsx-renderer.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-file-xlsx-renderer.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { classProps } from './class-props';
import { useTranslation } from './translation';
import { ZoomIn, ZoomOut } from './icons';
import { setWasmSource, XlsxViewer, type XlsxViewerController } from '@extend-ai/react-xlsx';
import wasmUrl from '@extend-ai/react-xlsx/duke_sheets_wasm_bg.wasm?url';
import { Button } from './ui';
import { Spinner } from './ui';
import { colors } from './tokens';
import { space } from './tokens';
import { useResolvedTheme } from './theme';
import type { SessionFileErrorActions } from './session-file-actions';
import { SessionFileNoticeCard } from './session-file-error-state';
import { OfficeViewerFrame, officeFrameStyles } from './session-file-office-frame';

setWasmSource(wasmUrl);

const styles = {
viewer: { className: 'lody-session-file-xlsx-renderer-viewer' },
loading: { className: 'lody-session-file-xlsx-renderer-loading' }
};

function XlsxToolbar({ controller }: { readonly controller: XlsxViewerController }) {
  const { t } = useTranslation();
  return (
    <div {...classProps(officeFrameStyles.group)}>
      <Button
        type="button"
        variant="ghost"
        size="mini"
        icon
        aria-label={t('sessions.fileViewer.pdf.zoomOut', 'Zoom out')}
        disabled={!controller.canZoomOut}
        onClick={controller.zoomOut}
      >
        <ZoomOut size={16} aria-hidden />
      </Button>
      <span
        {...classProps(officeFrameStyles.label)}
        aria-label={t('sessions.fileViewer.pdf.zoomLevel', 'Zoom level')}
      >
        {Math.round(controller.zoomScale)}%
      </span>
      <Button
        type="button"
        variant="ghost"
        size="mini"
        icon
        aria-label={t('sessions.fileViewer.pdf.zoomIn', 'Zoom in')}
        disabled={!controller.canZoomIn}
        onClick={controller.zoomIn}
      >
        <ZoomIn size={16} aria-hidden />
      </Button>
      <span {...classProps(officeFrameStyles.spacer)} />
      <span {...classProps(officeFrameStyles.label)}>
        {controller.tabs.length > 0
          ? controller.tabs.length === 1
            ? t('sessions.fileViewer.office.oneSheet', '1 sheet')
            : t('sessions.fileViewer.office.sheetCount', '{{count}} sheets', {
                count: controller.tabs.length,
              })
          : ''}
      </span>
    </div>
  );
}

export function SessionFileXlsxRenderer({
  buffer,
  path,
  fileActions,
}: {
  readonly buffer: ArrayBuffer;
  readonly path: string;
  readonly fileActions?: SessionFileErrorActions;
}) {
  const { t } = useTranslation();
  const isDark = useResolvedTheme() === 'dark';
  const unavailable = (
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
  return (
    <OfficeViewerFrame
      label={t('sessions.fileViewer.office.xlsxViewer', 'XLSX viewer')}
      toolbar={null}
    >
      <div {...classProps(styles.viewer)}>
        <XlsxViewer
          file={buffer}
          fileName={path.split('/').pop()}
          height="100%"
          isDark={isDark}
          readOnly
          useWorker
          maxFileSizeBytes={25 * 1024 * 1024}
          showDefaultToolbar={false}
          toolbar={(controller) => <XlsxToolbar controller={controller} />}
          loadingState={
            <div {...classProps(styles.loading)} role="status">
              <Spinner label={null} />
              {t('sessions.fileViewer.office.loading', 'Loading document…')}
            </div>
          }
          errorState={unavailable}
          fileTooLargeState={unavailable}
        />
      </div>
    </OfficeViewerFrame>
  );
}
