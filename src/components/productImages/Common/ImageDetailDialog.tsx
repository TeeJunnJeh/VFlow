import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FolderPlus, Search, Wand2, X } from 'lucide-react';

export interface ImageDetailInfoRow {
  label: React.ReactNode;
  value: React.ReactNode;
}

export interface ImageDetailDialogProps {
  open: boolean;
  imageUrl: string;
  title: React.ReactNode;
  imageAlt: string;
  infoTitle: React.ReactNode;
  infoRows: ImageDetailInfoRow[];
  promptLabel?: React.ReactNode;
  promptValue?: string;
  onClose: () => void;
  onImageLoad?: (size: { width: number; height: number }) => void;
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  onInpaint?: () => void;
  inpaintLabel?: React.ReactNode;
  onDownload?: () => void;
  downloadLabel?: React.ReactNode;
  downloadDisabled?: boolean;
  onSave?: () => void;
  saveLabel?: React.ReactNode;
  saveDisabled?: boolean;
  zoomMode?: 'hover' | 'toggle';
  zoomLabel?: string;
  closeLabel?: string;
  expandLabel?: React.ReactNode;
  collapseLabel?: React.ReactNode;
}

type MagnifierState = {
  rx: number;
  ry: number;
  centerX: number;
  centerY: number;
  displayW: number;
  displayH: number;
  offsetX: number;
  offsetY: number;
  containerW: number;
  containerH: number;
};

export const ImageDetailDialog: React.FC<ImageDetailDialogProps> = ({
  open,
  imageUrl,
  title,
  imageAlt,
  infoTitle,
  infoRows,
  promptLabel,
  promptValue,
  onClose,
  onImageLoad,
  onPrev,
  onNext,
  canPrev = false,
  canNext = false,
  onInpaint,
  inpaintLabel,
  onDownload,
  downloadLabel,
  downloadDisabled,
  onSave,
  saveLabel,
  saveDisabled,
  zoomMode = 'hover',
  zoomLabel = 'Zoom',
  closeLabel = 'Close',
  expandLabel = 'Expand',
  collapseLabel = 'Collapse',
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [magnifier, setMagnifier] = useState<MagnifierState | null>(null);
  const [zoomEnabled, setZoomEnabled] = useState(zoomMode === 'hover');
  const [promptExpanded, setPromptExpanded] = useState(false);

  useEffect(() => {
    setNaturalSize(null);
    setMagnifier(null);
    setPromptExpanded(false);
    setZoomEnabled(zoomMode === 'hover');
  }, [imageUrl, open, zoomMode]);

  if (!open) return null;

  const updateMagnifier = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!zoomEnabled || !naturalSize) return;
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const scale = Math.min(rect.width / naturalSize.width, rect.height / naturalSize.height);
    if (!Number.isFinite(scale) || scale <= 0) return;
    const displayW = naturalSize.width * scale;
    const displayH = naturalSize.height * scale;
    const offsetX = (rect.width - displayW) / 2;
    const offsetY = (rect.height - displayH) / 2;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const rx = (localX - offsetX) / displayW;
    const ry = (localY - offsetY) / displayH;
    if (rx < 0 || rx > 1 || ry < 0 || ry > 1) {
      setMagnifier(null);
      return;
    }
    setMagnifier({
      rx,
      ry,
      centerX: offsetX + rx * displayW,
      centerY: offsetY + ry * displayH,
      displayW,
      displayH,
      offsetX,
      offsetY,
      containerW: rect.width,
      containerH: rect.height,
    });
  };

  const renderMagnifier = () => {
    if (!magnifier) return null;
    const lensSize = Math.max(80, Math.min(160, Math.floor(Math.min(magnifier.displayW, magnifier.displayH))));
    const zoom = 3;
    const zoomBox = 240;
    const lensLeft = Math.min(
      magnifier.offsetX + magnifier.displayW - lensSize,
      Math.max(magnifier.offsetX, magnifier.centerX - lensSize / 2)
    );
    const lensTop = Math.min(
      magnifier.offsetY + magnifier.displayH - lensSize,
      Math.max(magnifier.offsetY, magnifier.centerY - lensSize / 2)
    );
    const bgW = Math.round(magnifier.displayW * zoom);
    const bgH = Math.round(magnifier.displayH * zoom);
    const bgPosX = Math.min(0, Math.max(-(bgW - zoomBox), Math.round(-(magnifier.rx * bgW - zoomBox / 2))));
    const bgPosY = Math.min(0, Math.max(-(bgH - zoomBox), Math.round(-(magnifier.ry * bgH - zoomBox / 2))));
    const zoomLeft = Math.min(
      magnifier.containerW - zoomBox - 10,
      Math.max(10, lensLeft + lensSize + 12 <= magnifier.containerW - zoomBox - 10 ? lensLeft + lensSize + 12 : lensLeft - zoomBox - 12)
    );
    const zoomTop = Math.min(magnifier.containerH - zoomBox - 10, Math.max(10, lensTop));

    return (
      <>
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-black/15 bg-white/10 backdrop-blur-sm"
          style={{ width: lensSize, height: lensSize, left: lensLeft, top: lensTop }}
        />
        <div
          className="pointer-events-none absolute z-10 overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-lg"
          style={{
            width: zoomBox,
            height: zoomBox,
            left: zoomLeft,
            top: zoomTop,
            backgroundImage: `url(${imageUrl})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${bgW}px ${bgH}px`,
            backgroundPosition: `${bgPosX}px ${bgPosY}px`,
          }}
        />
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="flex h-[calc(100vh-3rem)] w-full max-w-6xl flex-col rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-zinc-100">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label={closeLabel}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="relative flex min-h-0 flex-1 overflow-hidden"
          style={{ '--detail-sidebar-width': '320px' } as React.CSSProperties}
        >
          {zoomMode === 'toggle' ? (
            <button
              type="button"
              onClick={() => {
                setZoomEnabled((prev) => !prev);
                setMagnifier(null);
              }}
              className={`absolute right-[calc(var(--detail-sidebar-width)+0.75rem)] top-0 z-30 inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                zoomEnabled ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
              }`}
              aria-label={zoomLabel}
            >
              <Search className="h-4 w-4" />
            </button>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center pr-6">
            <div className="relative flex h-full w-full items-center justify-center rounded-2xl bg-black/20">
              {onPrev ? (
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={!canPrev}
                  className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/60 text-zinc-200 transition hover:bg-black/75 disabled:opacity-40"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}
              <div
                ref={hostRef}
                className="relative h-full w-full overflow-hidden"
                onMouseMove={updateMagnifier}
                onMouseLeave={() => setMagnifier(null)}
              >
                <img
                  src={imageUrl}
                  alt={imageAlt}
                  className="h-full w-full object-contain"
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    const next = { width: img.naturalWidth, height: img.naturalHeight };
                    setNaturalSize(next);
                    onImageLoad?.(next);
                  }}
                />
                {renderMagnifier()}
              </div>
              {onNext ? (
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!canNext}
                  className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/60 text-zinc-200 transition hover:bg-black/75 disabled:opacity-40"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-0 w-[var(--detail-sidebar-width)] shrink-0 flex-col gap-3 border-l border-white/10 pl-6">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-bold text-zinc-200">{infoTitle}</div>
              <div className="mt-2 space-y-1.5 text-sm">
                {infoRows.map((row, index) => (
                  <div key={index} className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 whitespace-normal break-words text-zinc-500">{row.label}</span>
                    <span className="min-w-0 flex-1 whitespace-normal break-words text-right font-bold text-zinc-200">{row.value}</span>
                  </div>
                ))}
                {promptLabel ? (
                  <div className="pt-2">
                    <button type="button" onClick={() => setPromptExpanded((prev) => !prev)} className="flex w-full items-start justify-between gap-3 text-left">
                      <span className="min-w-0 flex-1 whitespace-normal break-words text-zinc-500">{promptLabel}</span>
                      <span className="min-w-0 max-w-[45%] whitespace-normal break-words text-right text-xs font-bold text-zinc-300">
                        {promptExpanded ? collapseLabel : expandLabel}
                      </span>
                    </button>
                    {promptExpanded ? (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-zinc-300">
                        {promptValue || '-'}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-2">
              {onInpaint ? (
                <button
                  type="button"
                  onClick={onInpaint}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 hover:text-violet-800 active:scale-[0.99] dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/20 dark:hover:text-violet-200"
                >
                  <Wand2 className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 whitespace-normal break-words text-center leading-snug">{inpaintLabel}</span>
                </button>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {onDownload ? (
                  <button
                    type="button"
                    onClick={onDownload}
                    disabled={downloadDisabled}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-900 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-indigo-400/40 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 whitespace-normal break-words text-center leading-snug">{downloadLabel}</span>
                  </button>
                ) : null}
                {onSave ? (
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saveDisabled}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-900 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-indigo-400/40 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <FolderPlus className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 whitespace-normal break-words text-center leading-snug">{saveLabel}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
