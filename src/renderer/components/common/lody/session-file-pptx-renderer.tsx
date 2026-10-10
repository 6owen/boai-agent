/*
 * [INPUT]: Lody固定源码 packages/components/src/components/sessions/session-file-pptx-renderer.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-file-pptx-renderer.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { classProps } from './class-props';
import { useEffect, useState } from 'react';
import { useTranslation } from './translation';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from './icons';
import { ReactPptxViewer, setWasmSource, type ViewerZoomLevel } from '@extend-ai/react-pptx';
// A CSS import in this lazy renderer also moves the app's extracted StyleX rules
// into the lazy CSS chunk. Keep only the PPTX vendor CSS here as deferred text.
import pptxStylesText from '@extend-ai/react-pptx/styles.css?raw';
import wasmUrl from '@extend-ai/react-pptx/pptx_wasm_bg.wasm?url';
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
viewer: { className: 'lody-session-file-pptx-renderer-viewer' },
loading: { className: 'lody-session-file-pptx-renderer-loading' }
};

const ZOOM_LEVELS = ['fit-page', 'fit-width', 'automatic', 50, 75, 100, 125, 150, 200] as const;

export function SessionFilePptxRenderer({
  buffer,
  fileActions,
}: {
  readonly buffer: ArrayBuffer;
  readonly path: string;
  readonly fileActions?: SessionFileErrorActions;
}) {
  const { t } = useTranslation();
  const [slide, setSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [zoom, setZoom] = useState<ViewerZoomLevel>('fit-page');
  const [failed, setFailed] = useState(false);
  const [stylesReady, setStylesReady] = useState(false);

  useEffect(() => {
    const stylesheet = document.createElement('style');
    stylesheet.textContent = pptxStylesText;
    document.head.append(stylesheet);
    setStylesReady(true);
    return () => {
      stylesheet.remove();
    };
  }, []);
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
      label={t('sessions.fileViewer.office.pptxViewer', 'PowerPoint viewer')}
      toolbar={
        <>
          <div {...classProps(officeFrameStyles.group)}>
            <Button
              type="button"
              variant="ghost"
              size="mini"
              icon
              aria-label={t('sessions.fileViewer.office.previousSlide', 'Previous slide')}
              disabled={slide <= 0}
              onClick={() => setSlide((current) => current - 1)}
            >
              <ChevronLeft size={16} aria-hidden />
            </Button>
            <span {...classProps(officeFrameStyles.label)} aria-live="polite">
              {t('sessions.fileViewer.office.slideCount', '{{current}} of {{count}}', {
                current: slide + 1,
                count: slideCount,
              })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="mini"
              icon
              aria-label={t('sessions.fileViewer.office.nextSlide', 'Next slide')}
              disabled={slideCount === 0 || slide >= slideCount - 1}
              onClick={() => setSlide((current) => current + 1)}
            >
              <ChevronRight size={16} aria-hidden />
            </Button>
          </div>
          <span {...classProps(officeFrameStyles.spacer)} />
          <div {...classProps(officeFrameStyles.group)}>
            <Button
              type="button"
              variant="ghost"
              size="mini"
              icon
              aria-label={t('sessions.fileViewer.pdf.zoomOut', 'Zoom out')}
              disabled={slideCount === 0}
              onClick={() =>
                setZoom((current) =>
                  Math.max(25, (typeof current === 'number' ? current : 100) - 25)
                )
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
                    setZoom(
                      Number.isNaN(Number(value)) ? (value as ViewerZoomLevel) : Number(value)
                    );
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
              disabled={slideCount === 0}
              onClick={() =>
                setZoom((current) =>
                  Math.min(200, (typeof current === 'number' ? current : 100) + 25)
                )
              }
            >
              <ZoomIn size={16} aria-hidden />
            </Button>
          </div>
        </>
      }
    >
      <div {...classProps(styles.viewer)}>
        {stylesReady ? (
          <ReactPptxViewer
            source={buffer}
            mode="continuous"
            slideIndex={slide}
            zoom={zoom}
            height="100%"
            showToolbar={false}
            showThumbnails
            virtualization
            onLoad={(presentation) => setSlideCount(presentation.document.slides.length)}
            onSlideChange={setSlide}
            onError={() => setFailed(true)}
            renderLoading={() => (
              <div {...classProps(styles.loading)} role="status">
                <Spinner label={null} />
                {t('sessions.fileViewer.office.loading', 'Loading document…')}
              </div>
            )}
          />
        ) : (
          <div {...classProps(styles.loading)} role="status">
            <Spinner label={null} />
            {t('sessions.fileViewer.office.loading', 'Loading document…')}
          </div>
        )}
      </div>
    </OfficeViewerFrame>
  );
}
