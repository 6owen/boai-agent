/*
 * [INPUT]: Lody固定源码 packages/components/src/components/sessions/session-file-pdf-thumbnails.tsx @ 52e6eebe908641ea53d5a9aa3530499932f3064f 与BOAI局部接口适配。
 * [OUTPUT]: 保留上游实现；导入/控件/主题/声明样式接BOAI，来源差异见迁入清单。
 * [POS]: common/lody/session-file-pdf-thumbnails.tsx；Apache-2.0，保留上游注释。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { classProps } from './class-props';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from './translation';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { colors, shadow } from './tokens';
import { radius, space } from './tokens';

const ROW_HEIGHT = 190;
const THUMB_WIDTH = 112;
const THUMB_HEIGHT = 148;
const OVERSCAN = 3;

const styles = {
sidebar: { className: 'lody-session-file-pdf-thumbnails-sidebar' },
listSpace: (height: number) => ({ style: { position: 'relative', height } }),
row: (top: number) => ({ style: { position: 'absolute', top, left: 0, right: 0, height: ROW_HEIGHT, padding: space[2] } }),
item: { className: 'lody-session-file-pdf-thumbnails-item' },
selected: { className: 'lody-session-file-pdf-thumbnails-selected' },
page: { className: 'lody-session-file-pdf-thumbnails-page' },
canvas: (width: number, height: number) => ({ style: { display: 'block', width, height } }),
pageNumber: { className: 'lody-session-file-pdf-thumbnails-pageNumber' },
};

function PdfThumbnail({
  document,
  pageNumber,
  rotation,
}: {
  readonly document: PDFDocumentProxy;
  readonly pageNumber: number;
  readonly rotation: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: THUMB_WIDTH, height: THUMB_HEIGHT });

  useEffect(() => {
    let disposed = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null =
      null;

    void (async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (disposed || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const unscaled = page.getViewport({ scale: 1, rotation });
        const displayScale = Math.min(THUMB_WIDTH / unscaled.width, THUMB_HEIGHT / unscaled.height);
        const viewport = page.getViewport({
          scale: displayScale * Math.min(window.devicePixelRatio || 1, 2),
          rotation,
        });
        setDimensions({
          width: Math.round(unscaled.width * displayScale),
          height: Math.round(unscaled.height * displayScale),
        });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) return;
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      } catch {
        // A thumbnail may be cancelled as its virtual row leaves view.
      }
    })();

    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, rotation]);

  return (
    <canvas
      ref={canvasRef}
      {...classProps(styles.canvas(dimensions.width, dimensions.height))}
      aria-hidden="true"
    />
  );
}

export function SessionFilePdfThumbnails({
  document,
  pageCount,
  currentPage,
  rotation,
  onSelectPage,
}: {
  readonly document: PDFDocumentProxy;
  readonly pageCount: number;
  readonly currentPage: number;
  readonly rotation: number;
  readonly onSelectPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const sidebarRef = useRef<HTMLElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return undefined;
    const observer = new ResizeObserver(() => setHeight(sidebar.clientHeight));
    observer.observe(sidebar);
    setHeight(sidebar.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const top = (currentPage - 1) * ROW_HEIGHT;
    if (top < sidebar.scrollTop || top + ROW_HEIGHT > sidebar.scrollTop + sidebar.clientHeight) {
      sidebar.scrollTop = Math.max(0, top - ROW_HEIGHT);
    }
  }, [currentPage]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(pageCount, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);

  return (
    <aside
      ref={sidebarRef}
      {...classProps(styles.sidebar)}
      aria-label={t('sessions.fileViewer.pdf.pages', 'Pages')}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div {...classProps(styles.listSpace(pageCount * ROW_HEIGHT))}>
        {Array.from({ length: last - first }, (_, index) => {
          const page = first + index + 1;
          return (
            <div key={page} {...classProps(styles.row((page - 1) * ROW_HEIGHT))}>
              <button
                type="button"
                {...classProps(styles.item, page === currentPage && styles.selected)}
                aria-label={t('sessions.fileViewer.pdf.goToPage', 'Go to page {{page}}', { page })}
                aria-current={page === currentPage ? 'page' : undefined}
                onClick={() => onSelectPage(page)}
              >
                <span {...classProps(styles.page)}>
                  <PdfThumbnail document={document} pageNumber={page} rotation={rotation} />
                </span>
                <span {...classProps(styles.pageNumber)}>{page}</span>
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
