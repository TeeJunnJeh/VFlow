import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Brush, Eraser, Hand, Maximize2, Minus, Plus, Redo2, RotateCcw, Trash2, Undo2,
} from 'lucide-react';
import { getAgentImageEditingCopy } from './i18n';

type Tool = 'brush' | 'eraser' | 'pan';

export interface MaskCanvasHandle {
  exportMask: () => Promise<Blob>;
}

interface MaskCanvasProps {
  imageUrl: string;
  language: string;
  onSelectionChange?: (hasSelection: boolean) => void;
  onLoadError?: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const MAX_EDIT_PIXELS = 20_000_000;
const actionButtonClass = 'flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-zinc-900 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30';

const hasPaint = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) return true;
  }
  return false;
};

export const MaskCanvas = forwardRef<MaskCanvasHandle, MaskCanvasProps>(({
  imageUrl,
  language,
  onSelectionChange,
  onLoadError,
}, ref) => {
  const copy = getAgentImageEditingCopy(language);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(64);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });

  const syncHistoryAvailability = () => {
    setHistoryAvailability({ canUndo: undoRef.current.length > 0, canRedo: redoRef.current.length > 0 });
  };

  const updateSelection = () => {
    const canvas = canvasRef.current;
    onSelectionChange?.(Boolean(canvas && hasPaint(canvas)));
  };

  const snapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoRef.current = [...undoRef.current.slice(-19), canvas.toDataURL('image/png')];
    redoRef.current = [];
    syncHistoryAvailability();
  };

  const restore = (dataUrl: string, callback?: () => void) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!dataUrl) {
      callback?.();
      return;
    }
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      callback?.();
    };
    image.src = dataUrl;
  };

  useImperativeHandle(ref, () => ({
    exportMask: async () => {
      const selection = canvasRef.current;
      if (!selection || !hasPaint(selection)) throw new Error(copy.selectionRequired);
      const mask = document.createElement('canvas');
      mask.width = selection.width;
      mask.height = selection.height;
      const context = mask.getContext('2d');
      if (!context) throw new Error(copy.selectionRequired);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, mask.width, mask.height);
      context.globalCompositeOperation = 'destination-out';
      context.drawImage(selection, 0, 0);
      return await new Promise<Blob>((resolve, reject) => {
        mask.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to export mask')), 'image/png');
      });
    },
  }), [copy.selectionRequired]);

  const handleImageLoad = () => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const width = Math.max(1, image.naturalWidth);
    const height = Math.max(1, image.naturalHeight);
    if (width * height > MAX_EDIT_PIXELS) {
      onLoadError?.();
      return;
    }
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.clearRect(0, 0, width, height);
    setDimensions({ width, height });
    updateSelection();
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const drawTo = (point: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const previous = lastPointRef.current;
    if (!canvas || !context || !previous) return;
    context.save();
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = 'rgb(37, 99, 235)';
    context.lineWidth = brushSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.restore();
    lastPointRef.current = point;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'pan') {
      panStartRef.current = { x: event.clientX, y: event.clientY, left: pan.x, top: pan.y };
      return;
    }
    snapshot();
    drawingRef.current = true;
    const point = pointFromEvent(event);
    lastPointRef.current = point;
    drawTo({ x: point.x + 0.01, y: point.y + 0.01 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan' && panStartRef.current) {
      const start = panStartRef.current;
      setPan({ x: start.left + event.clientX - start.x, y: start.top + event.clientY - start.y });
      return;
    }
    if (drawingRef.current) drawTo(pointFromEvent(event));
  };

  const finishPointer = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
    panStartRef.current = null;
    updateSelection();
  };

  const mutateMask = (mutation: (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    snapshot();
    mutation(context, canvas);
    updateSelection();
  };

  const undo = () => {
    const canvas = canvasRef.current;
    const previous = undoRef.current.pop();
    if (!canvas || previous === undefined) return;
    redoRef.current.push(canvas.toDataURL('image/png'));
    restore(previous, updateSelection);
    syncHistoryAvailability();
  };

  const redo = () => {
    const canvas = canvasRef.current;
    const next = redoRef.current.pop();
    if (!canvas || next === undefined) return;
    undoRef.current.push(canvas.toDataURL('image/png'));
    restore(next, updateSelection);
    syncHistoryAvailability();
  };

  const toolButton = (value: Tool, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTool(value)}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-md border transition ${
        tool === value ? 'border-blue-400 bg-blue-500/20 text-blue-200' : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/80 p-2">
        {toolButton('brush', copy.brush, <Brush className="h-4 w-4" />)}
        {toolButton('eraser', copy.eraser, <Eraser className="h-4 w-4" />)}
        {toolButton('pan', copy.pan, <Hand className="h-4 w-4" />)}
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button type="button" onClick={undo} disabled={!historyAvailability.canUndo} title={copy.undo} className={actionButtonClass}><Undo2 className="h-4 w-4" /></button>
        <button type="button" onClick={redo} disabled={!historyAvailability.canRedo} title={copy.redo} className={actionButtonClass}><Redo2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => mutateMask((context, canvas) => { context.fillStyle = 'rgb(37, 99, 235)'; context.fillRect(0, 0, canvas.width, canvas.height); })} title={copy.selectAll} className={actionButtonClass}><Maximize2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => mutateMask((context, canvas) => context.clearRect(0, 0, canvas.width, canvas.height))} title={copy.clear} className={actionButtonClass}><Trash2 className="h-4 w-4" /></button>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <label className="flex min-w-[150px] flex-1 items-center gap-2 text-xs text-zinc-400">
          <span className="whitespace-nowrap">{copy.brushSize}</span>
          <input type="range" min="8" max="240" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="min-w-20 flex-1 accent-blue-500" />
        </label>
        <button type="button" onClick={() => setZoom((value) => clamp(value - 0.25, 0.5, 3))} title={copy.zoomOut} className={actionButtonClass}><Minus className="h-4 w-4" /></button>
        <span className="w-12 text-center text-xs tabular-nums text-zinc-400">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => clamp(value + 0.25, 0.5, 3))} title={copy.zoomIn} className={actionButtonClass}><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title={copy.resetView} className={actionButtonClass}><RotateCcw className="h-4 w-4" /></button>
      </div>
      <div className="relative flex h-[min(56vh,620px)] min-h-[320px] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/70">
        <div
          className="relative max-h-full max-w-full origin-center"
          style={{
            aspectRatio: `${dimensions.width} / ${dimensions.height}`,
            width: dimensions.width >= dimensions.height ? '100%' : 'auto',
            height: dimensions.height > dimensions.width ? '100%' : 'auto',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <img ref={imageRef} src={imageUrl} alt="source" draggable={false} onLoad={handleImageLoad} onError={onLoadError} className="absolute inset-0 h-full w-full select-none object-contain" />
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            className={`absolute inset-0 h-full w-full opacity-70 ${tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
            style={{ touchAction: 'none' }}
          />
        </div>
      </div>
    </div>
  );
});

MaskCanvas.displayName = 'MaskCanvas';
