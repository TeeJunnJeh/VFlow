import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Trash2, X, Zap } from 'lucide-react';

export interface ImageInpaintRunOptions {
  imageUrl: string;
  maskDataUrl: string;
  prompt: string;
  aspectRatio: string;
}

interface ImageInpaintDialogProps {
  open: boolean;
  imageUrl: string;
  onClose: () => void;
  onRun: (options: ImageInpaintRunOptions) => Promise<string>;
  onApply: (imageUrl: string) => Promise<void> | void;
  labels: {
    title: React.ReactNode;
    resultTitle: React.ReactNode;
    subtitle: React.ReactNode;
    resultSubtitle: React.ReactNode;
    original: React.ReactNode;
    edited: React.ReactNode;
    promptLabel: React.ReactNode;
    promptPlaceholder: string;
    promptHint: React.ReactNode;
    clearSelection: React.ReactNode;
    start: React.ReactNode;
    generating: React.ReactNode;
    continueEditing: React.ReactNode;
    apply: React.ReactNode;
    keepOriginal: React.ReactNode;
    selectAreaError: string;
    imageNotReadyError: string;
    promptError: string;
  };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const ImageInpaintDialog: React.FC<ImageInpaintDialogProps> = ({
  open,
  imageUrl,
  onClose,
  onRun,
  onApply,
  labels,
}) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [step, setStep] = useState<'edit' | 'compare'>('edit');
  const [prompt, setPrompt] = useState('');
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<'original' | 'edited'>('edited');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('edit');
    setRect(null);
    setDragStart(null);
    setIsDragging(false);
    setIsGenerating(false);
    setResultUrl(null);
    setSelectedVersion('edited');
    setError(null);
  }, [open, imageUrl]);

  if (!open) return null;

  const pointFromEvent = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box) return null;
    const boxRect = box.getBoundingClientRect();
    const localX = event.clientX - boxRect.left;
    const localY = event.clientY - boxRect.top;
    let x = clamp01(localX / boxRect.width);
    let y = clamp01(localY / boxRect.height);

    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const scale = Math.min(boxRect.width / img.naturalWidth, boxRect.height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const offsetX = (boxRect.width - drawW) / 2;
      const offsetY = (boxRect.height - drawH) / 2;
      x = clamp01(Math.min(offsetX + drawW, Math.max(offsetX, localX)) / boxRect.width);
      y = clamp01(Math.min(offsetY + drawH, Math.max(offsetY, localY)) / boxRect.height);
    }
    return { x, y };
  };

  const buildMaskDataUrl = (width: number, height: number, rectPx: { x: number; y: number; w: number; h: number }) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context unavailable');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(
      Math.max(0, Math.floor(rectPx.x)),
      Math.max(0, Math.floor(rectPx.y)),
      Math.max(1, Math.floor(rectPx.w)),
      Math.max(1, Math.floor(rectPx.h))
    );
    return canvas.toDataURL('image/png');
  };

  const handleRun = async () => {
    if (!rect) {
      setError(labels.selectAreaError);
      return;
    }
    const instruction = String(prompt || '').trim();
    if (!instruction) {
      setError(labels.promptError);
      return;
    }
    const img = imgRef.current;
    const box = boxRef.current;
    if (!img || !box || !img.naturalWidth || !img.naturalHeight) {
      setError(labels.imageNotReadyError);
      return;
    }

    const boxRect = box.getBoundingClientRect();
    const scale = Math.min(boxRect.width / img.naturalWidth, boxRect.height / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const offsetX = (boxRect.width - drawW) / 2;
    const offsetY = (boxRect.height - drawH) / 2;
    const imgX = clamp01((rect.x * boxRect.width - offsetX) / drawW);
    const imgY = clamp01((rect.y * boxRect.height - offsetY) / drawH);
    const imgW = clamp01((rect.w * boxRect.width) / drawW);
    const imgH = clamp01((rect.h * boxRect.height) / drawH);
    const maskDataUrl = buildMaskDataUrl(img.naturalWidth, img.naturalHeight, {
      x: imgX * img.naturalWidth,
      y: imgY * img.naturalHeight,
      w: Math.max(1, imgW * img.naturalWidth),
      h: Math.max(1, imgH * img.naturalHeight),
    });

    setIsGenerating(true);
    setError(null);
    try {
      const outputUrl = await onRun({
        imageUrl: resultUrl || imageUrl,
        maskDataUrl,
        prompt: instruction,
        aspectRatio: `${img.naturalWidth}:${img.naturalHeight}`,
      });
      setResultUrl(outputUrl);
      setSelectedVersion('edited');
      setStep('compare');
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="flex h-[calc(100vh-3rem)] max-h-[760px] w-full max-w-[1120px] flex-col rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <button type="button" onClick={onClose} className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-zinc-300 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              {step === 'compare' ? labels.resultTitle : labels.title}
            </button>
            <div className="text-xs text-zinc-500">{step === 'compare' ? labels.resultSubtitle : labels.subtitle}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 gap-6">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            {step === 'compare' && resultUrl ? (
              <div className="flex h-full gap-5 p-6">
                {[
                  { key: 'original' as const, label: labels.original, url: imageUrl },
                  { key: 'edited' as const, label: labels.edited, url: resultUrl },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedVersion(item.key)}
                    className={`relative h-full min-w-0 flex-1 overflow-hidden rounded-2xl bg-black/40 transition ${
                      selectedVersion === item.key ? 'border-2 border-indigo-500' : 'border border-white/10 hover:border-white/20'
                    }`}
                  >
                    <img src={item.url} alt="" className="h-full w-full object-contain" />
                    <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">{item.label}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div
                ref={boxRef}
                className="relative h-full w-full cursor-crosshair select-none"
                onMouseDown={(event) => {
                  if (isGenerating) return;
                  const point = pointFromEvent(event);
                  if (!point) return;
                  setIsDragging(true);
                  setDragStart(point);
                  setRect({ ...point, w: 0.001, h: 0.001 });
                }}
                onMouseMove={(event) => {
                  if (!isDragging || !dragStart) return;
                  const point = pointFromEvent(event);
                  if (!point) return;
                  setRect({
                    x: Math.min(dragStart.x, point.x),
                    y: Math.min(dragStart.y, point.y),
                    w: Math.max(0.001, Math.abs(point.x - dragStart.x)),
                    h: Math.max(0.001, Math.abs(point.y - dragStart.y)),
                  });
                }}
                onMouseUp={() => {
                  setIsDragging(false);
                  setDragStart(null);
                }}
                onMouseLeave={() => {
                  setIsDragging(false);
                  setDragStart(null);
                }}
              >
                <img ref={imgRef} src={resultUrl || imageUrl} alt="" className="h-full w-full object-contain" draggable={false} />
                {rect ? (
                  <>
                    <div
                      className="absolute border-2 border-white bg-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                      style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
                    />
                    <button
                      type="button"
                      onClick={() => setRect(null)}
                      disabled={isGenerating}
                      className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex w-[360px] shrink-0 flex-col rounded-2xl border border-white/10 bg-white p-6 text-zinc-900">
            {step === 'compare' ? (
              <>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 text-sm font-bold text-indigo-900">{labels.resultSubtitle}</div>
                <div className="mt-auto flex flex-col gap-3">
                  <button type="button" onClick={() => { setStep('edit'); setRect(null); setError(null); }} className="rounded-xl border border-rose-400 bg-white px-4 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-50">
                    {labels.continueEditing}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (selectedVersion === 'original') {
                        onClose();
                        return;
                      }
                      if (!resultUrl) return;
                      await onApply(resultUrl);
                      onClose();
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-500"
                  >
                    <Check className="h-4 w-4" />
                    {selectedVersion === 'original' ? labels.keepOriginal : labels.apply}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold">{labels.promptLabel}</div>
                  <button type="button" onClick={() => setRect(null)} className="text-xs font-bold text-zinc-500 hover:text-zinc-900">
                    {labels.clearSelection}
                  </button>
                </div>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={labels.promptPlaceholder}
                  className="mt-3 min-h-[140px] resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none focus:border-indigo-300"
                />
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-xs leading-relaxed text-amber-800">{labels.promptHint}</div>
                {error ? <div className="mt-3 text-xs font-bold text-rose-600">{error}</div> : null}
                <button
                  type="button"
                  onClick={() => void handleRun()}
                  disabled={isGenerating || !rect || !String(prompt || '').trim()}
                  className="mt-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-4 text-base font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-60"
                >
                  <Zap className="h-4 w-4" />
                  {isGenerating ? labels.generating : labels.start}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
