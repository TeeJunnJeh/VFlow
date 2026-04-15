import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Download, MoveDiagonal2, Plus, RotateCcw, Sparkles, Trash2, Type } from 'lucide-react';
import PptxGenJS from 'pptxgenjs';
import { AppDialog } from '../common/AppDialog';
import {
  videoApi,
  type TextSeparationSecondaryCreatePayload,
  type TextSeparationSecondaryResult,
  type TextSeparationSecondaryTask,
} from '../../services/video';

export interface TextSeparationBlock {
  id: string;
  text: string;
  bbox: [number, number, number, number];
  font_size?: number;
  color?: [number, number, number];
  bold?: boolean;
  outline?: boolean | { color?: [number, number, number]; width?: number };
  shadow?: boolean | { color?: [number, number, number]; blur?: number; offsetX?: number; offsetY?: number };
}

interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSizePx: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  prompt: string;
}

interface SecondaryTaskItem extends TextSeparationSecondaryTask {
  createdAt: string;
  previewUrl?: string | null;
  error?: string;
}

interface TextSeparationDemoViewProps {
  backgroundImageUrl: string;
  originalImageUrl: string;
  sampleTitle: string;
  textBlocks: TextSeparationBlock[];
  isZh: boolean;
  onBack: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const rgbArrayToHex = (color?: [number, number, number]) => {
  if (!color || color.length !== 3) return '#171717';
  return `#${color
    .map((channel) => clamp(Math.round(Number(channel) || 0), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
};

const wrapTextByWidth = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const rawLines = String(text || '').split(/\r?\n/);
  const wrapped: string[] = [];

  rawLines.forEach((line) => {
    const content = String(line || '');
    if (!content) {
      wrapped.push('');
      return;
    }

    let current = '';
    for (const char of content) {
      const next = current + char;
      if (ctx.measureText(next).width > maxWidth && current) {
        wrapped.push(current);
        current = char;
      } else {
        current = next;
      }
    }

    if (current) wrapped.push(current);
  });

  return wrapped;
};

const WEB_FONT_FAMILY =
  '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC", "Segoe UI", sans-serif';
const PPT_FONT_FACE_ZH = 'Microsoft YaHei';
const PPT_FONT_FACE_EN = 'Segoe UI';

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new Error('Failed to convert blob to data URL'));
    };
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

const hexToRgb = (hex: string) => {
  const normalized = String(hex || '').replace('#', '').trim();
  if (normalized.length !== 6) return '171717';
  return normalized.toUpperCase();
};

const resolveOutline = (outline: TextSeparationBlock['outline']) => {
  if (outline === false || outline == null) return { strokeColor: '#ffffff', strokeWidth: 0 };
  if (outline === true) return { strokeColor: '#ffffff', strokeWidth: 0.0025 };
  return {
    strokeColor: rgbArrayToHex(outline.color),
    strokeWidth: clamp(Number(outline.width) || 0.0025, 0.0005, 0.02),
  };
};

const resolveShadow = (shadow: TextSeparationBlock['shadow']) => {
  // Treat missing shadow (null/undefined) as no shadow by default.
  if (shadow === false || shadow == null) {
    return {
      shadowColor: '#000000',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    };
  }
  if (shadow === true) {
    return {
      shadowColor: '#000000',
      shadowBlur: 0.012,
      shadowOffsetX: 0,
      shadowOffsetY: 0.004,
    };
  }
  return {
    shadowColor: rgbArrayToHex(shadow.color),
    shadowBlur: clamp(Number(shadow.blur) || 0.012, 0, 0.08),
    shadowOffsetX: clamp(Number(shadow.offsetX) || 0, -0.05, 0.05),
    shadowOffsetY: clamp(Number(shadow.offsetY) || 0.004, -0.05, 0.05),
  };
};

const normalizeBlocks = (blocks: TextSeparationBlock[]): TextElement[] =>
  blocks.map((block) => {
    const [y0, x0, y1, x1] = block.bbox;
    const height = Math.max(0.04, (y1 - y0) / 1000);
    const fontSizeFromJson = Number(block.font_size);
    const outlineStyle = resolveOutline(block.outline);
    const shadowStyle = resolveShadow(block.shadow);
    return {
      id: block.id,
      text: String(block.text || '').replace(/u0026/g, '&'),
      x: x0 / 1000,
      y: y0 / 1000,
      w: Math.max(0.08, (x1 - x0) / 1000),
      h: Math.max(0.05, (y1 - y0) / 1000),
      fontSizePx: Number.isFinite(fontSizeFromJson)
        ? clamp(fontSizeFromJson, 6, 360)
        : clamp(Math.round(height * 1024), 10, 180),
      fontWeight: block.bold === false ? 400 : 700,
      color: rgbArrayToHex(block.color),
      align: 'center',
      strokeColor: outlineStyle.strokeColor,
      strokeWidth: outlineStyle.strokeWidth,
      shadowColor: shadowStyle.shadowColor,
      shadowBlur: shadowStyle.shadowBlur,
      shadowOffsetX: shadowStyle.shadowOffsetX,
      shadowOffsetY: shadowStyle.shadowOffsetY,
      prompt: '',
    };
  });

const createDefaultTextElement = (index: number): TextElement => ({
  id: `txt_${Date.now()}_${index}`,
  text: '新增文本',
  x: 0.12,
  y: 0.12,
  w: 0.32,
  h: 0.12,
  fontSizePx: 42,
  fontWeight: 700,
  color: '#171717',
  align: 'center',
  strokeColor: '#ffffff',
  strokeWidth: 0,
  shadowColor: '#000000',
  shadowBlur: 0.012,
  shadowOffsetX: 0,
  shadowOffsetY: 0.004,
  prompt: '',
});

const TextSeparationDemoView: React.FC<TextSeparationDemoViewProps> = ({
  backgroundImageUrl,
  originalImageUrl,
  sampleTitle,
  textBlocks,
  isZh,
  onBack,
}) => {
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);
  const initialElements = useMemo(() => normalizeBlocks(textBlocks), [textBlocks]);
  const [elements, setElements] = useState<TextElement[]>(initialElements);
  const [selectedId, setSelectedId] = useState<string | null>(initialElements[0]?.id || null);
  const [mode, setMode] = useState<'editor' | 'secondary'>('editor');
  const [secondaryGlobalPrompt, setSecondaryGlobalPrompt] = useState('');
  const [secondaryTasks, setSecondaryTasks] = useState<SecondaryTaskItem[]>([]);
  const [previewTask, setPreviewTask] = useState<SecondaryTaskItem | null>(null);
  const [isSecondarySubmitting, setIsSecondarySubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 1, height: 1 });
  const [surfaceViewport, setSurfaceViewport] = useState<{ width: number; height: number }>({ width: 560, height: 560 });
  const surfaceViewportRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [surfaceBaseSize, setSurfaceBaseSize] = useState(560);
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
  } | null>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setElements(initialElements);
      setSelectedId(initialElements[0]?.id || null);
      return;
    }

    const adjustedElements = initialElements.map((item) => {
      const normalizedText = String(item.text || '').replace(/\s+/g, ' ').trim() || ' ';
      const fontSize = Math.max(1, item.fontSizePx);
      ctx.font = `${item.fontWeight} ${fontSize}px ${WEB_FONT_FAMILY}`;
      const requiredPx = ctx.measureText(normalizedText).width + Math.max(10, fontSize * 0.7);
      const requiredW = clamp(requiredPx / Math.max(1, imageSize.width || 1), 0.06, 1);

      if (item.w >= requiredW) return item;

      const centerX = item.x + item.w / 2;
      let nextX = centerX - requiredW / 2;
      let nextW = requiredW;

      if (nextX < 0) {
        nextX = 0;
      }

      if (nextX + nextW > 1) {
        nextX = Math.max(0, 1 - nextW);
      }

      nextW = Math.min(nextW, 1 - nextX);
      return { ...item, x: nextX, w: nextW };
    });

    setElements(adjustedElements);
    setSelectedId(initialElements[0]?.id || null);
  }, [initialElements, imageSize.width]);

  useEffect(() => {
    setMode('editor');
    setSecondaryGlobalPrompt('');
    setSecondaryTasks([]);
    setPreviewTask(null);
  }, [initialElements]);

  useEffect(() => {
    setIsExportMenuOpen(false);
  }, [elements, selectedId, mode]);

  useEffect(() => {
    const pendingTasks = secondaryTasks.filter((item) => !['succeeded', 'completed', 'failed', 'error'].includes(String(item.status || '').toLowerCase()));
    if (pendingTasks.length === 0) return;

    const timer = window.setInterval(async () => {
      for (const task of pendingTasks) {
        try {
          const result: TextSeparationSecondaryResult = await videoApi.textSeparationSecondaryResult(task.request_id);
          setSecondaryTasks((prev) =>
            prev.map((item) =>
              item.request_id === task.request_id
                ? {
                    ...item,
                    status: result.status,
                    previewUrl: result.outputs?.[0] || item.previewUrl || null,
                    error: result.error || item.error,
                  }
                : item
            )
          );
        } catch (error) {
          setSecondaryTasks((prev) =>
            prev.map((item) =>
              item.request_id === task.request_id
                ? {
                    ...item,
                    status: 'failed',
                    error: error instanceof Error ? error.message : tr('鏌ヨ澶辫触', 'Failed to query task'),
                  }
                : item
            )
          );
        }
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [secondaryTasks, isZh]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setImageSize({
        width: Math.max(1, image.naturalWidth || image.width || 1),
        height: Math.max(1, image.naturalHeight || image.height || 1),
      });
    };
    image.src = backgroundImageUrl;
  }, [backgroundImageUrl]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const updateSize = () => {
      const rect = surface.getBoundingClientRect();
      const nextBase = Math.max(320, Math.min(rect.width || 560, rect.height || 560));
      setSurfaceBaseSize(nextBase);
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(surface);
    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    const viewport = surfaceViewportRef.current;
    if (!viewport) return;

    const updateViewport = () => {
      const rect = viewport.getBoundingClientRect();
      const availableWidth = Math.max(1, rect.width);
      const availableHeight = Math.max(1, rect.height);
      const ratio = imageSize.width / imageSize.height;

      let nextWidth = availableWidth;
      let nextHeight = nextWidth / ratio;

      if (nextHeight > availableHeight) {
        nextHeight = availableHeight;
        nextWidth = nextHeight * ratio;
      }

      setSurfaceViewport({
        width: Math.max(1, nextWidth),
        height: Math.max(1, nextHeight),
      });
    };

    updateViewport();
    const observer = new ResizeObserver(() => updateViewport());
    observer.observe(viewport);
    window.addEventListener('resize', updateViewport);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, [imageSize.width, imageSize.height]);

  const selectedElement = useMemo(
    () => elements.find((item) => item.id === selectedId) || null,
    [elements, selectedId]
  );

  const updateElement = (id: string, patch: Partial<TextElement>) => {
    setElements((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addTextElement = () => {
    const next = createDefaultTextElement(elements.length + 1);
    setElements((prev) => [...prev, next]);
    setSelectedId(next.id);
  };

  const deleteSelectedElement = () => {
    if (!selectedElement) return;
    setElements((prev) => {
      const filtered = prev.filter((item) => item.id !== selectedElement.id);
      setSelectedId(filtered[0]?.id || null);
      return filtered;
    });
  };

  const fitAllTextBoxesToSingleLine = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setElements((prev) =>
      prev.map((item) => {
        const normalizedText = String(item.text || '').replace(/\s+/g, ' ').trim() || ' ';
        const fontSize = Math.max(1, item.fontSizePx);
        ctx.font = `${item.fontWeight} ${fontSize}px ${WEB_FONT_FAMILY}`;
        const requiredPx = ctx.measureText(normalizedText).width + Math.max(10, fontSize * 0.7);
        const requiredW = clamp(requiredPx / Math.max(1, imageSize.width), 0.06, 1);

        if (item.w >= requiredW) return item;

        const centerX = item.x + item.w / 2;
        let nextX = centerX - requiredW / 2;
        let nextW = requiredW;

        if (nextX < 0) {
          nextX = 0;
        }

        if (nextX + nextW > 1) {
          nextX = Math.max(0, 1 - nextW);
        }

        nextW = Math.min(nextW, 1 - nextX);
        return { ...item, x: nextX, w: nextW };
      })
    );
  };

  const startDrag = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const current = elements.find((item) => item.id === id);
    const surface = surfaceRef.current;
    if (!current || !surface) return;

    const bounds = surface.getBoundingClientRect();
    dragRef.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: current.x,
      startY: current.y,
    };

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      const activeSurface = surfaceRef.current;
      if (!drag || !activeSurface) return;
      const rect = activeSurface.getBoundingClientRect();
      const dx = rect.width > 0 ? (ev.clientX - drag.startClientX) / rect.width : 0;
      const dy = rect.height > 0 ? (ev.clientY - drag.startClientY) / rect.height : 0;

      setElements((prev) =>
        prev.map((item) =>
          item.id === drag.id
            ? {
                ...item,
                x: clamp(drag.startX + dx, 0, Math.max(0, 1 - item.w)),
                y: clamp(drag.startY + dy, 0, Math.max(0, 1 - item.h)),
              }
            : item
        )
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResize = (id: string, e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const current = elements.find((item) => item.id === id);
    const surface = surfaceRef.current;
    if (!current || !surface) return;

    setSelectedId(id);
    resizeRef.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startW: current.w,
      startH: current.h,
    };

    const onMove = (ev: PointerEvent) => {
      const resize = resizeRef.current;
      const activeSurface = surfaceRef.current;
      if (!resize || !activeSurface) return;

      const rect = activeSurface.getBoundingClientRect();
      const dx = rect.width > 0 ? (ev.clientX - resize.startClientX) / rect.width : 0;
      const dy = rect.height > 0 ? (ev.clientY - resize.startClientY) / rect.height : 0;

      setElements((prev) =>
        prev.map((item) => {
          if (item.id !== resize.id) return item;
          const nextW = clamp(resize.startW + dx, 0.06, 1 - item.x);
          const nextH = clamp(resize.startH + dy, 0.04, 1 - item.y);
          return { ...item, w: nextW, h: nextH };
        })
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      resizeRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const renderCompositeImageDataUrl = async (format: 'png' | 'jpeg' = 'png', quality = 0.92) => {
    const resp = await fetch(backgroundImageUrl, { method: 'GET' });
    if (!resp.ok) throw new Error(tr('涓嬭浇鑳屾櫙澶辫触', 'Failed to download background'));
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);

    try {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(tr('鍔犺浇鑳屾櫙澶辫触', 'Failed to load background')));
      });
      image.src = blobUrl;
      await loaded;

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr('瀵煎嚭澶辫触', 'Export failed'));

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const base = Math.min(canvas.width, canvas.height);
      for (const item of elements) {
        const px = item.x * canvas.width;
        const py = item.y * canvas.height;
        const pw = item.w * canvas.width;
        const ph = item.h * canvas.height;
        const fontSize = Math.max(12, Math.round(item.fontSizePx * (canvas.width / imageSize.width)));
        const lineHeight = Math.round(fontSize * 1.22);
        const horizontalPadding = Math.max(8, Math.round(fontSize * 0.3));

        ctx.fillStyle = item.color;
        ctx.font = `${item.fontWeight} ${fontSize}px system-ui`;
        ctx.textBaseline = 'top';
        ctx.textAlign = item.align;
        ctx.shadowColor = item.shadowColor;
        ctx.shadowBlur = Math.max(0, item.shadowBlur * base);
        ctx.shadowOffsetX = item.shadowOffsetX * canvas.width;
        ctx.shadowOffsetY = item.shadowOffsetY * canvas.height;
        ctx.lineJoin = 'round';

        const lines = wrapTextByWidth(ctx, item.text, Math.max(10, pw - horizontalPadding * 2));
        let cursorY = py + 4;
        const drawX =
          item.align === 'center'
            ? px + pw / 2
            : item.align === 'right'
              ? px + pw - horizontalPadding
              : px + horizontalPadding;

        for (const line of lines) {
          if (item.strokeWidth > 0) {
            ctx.lineWidth = Math.max(1, item.strokeWidth * base);
            ctx.strokeStyle = item.strokeColor;
            ctx.strokeText(line, drawX, cursorY);
          }
          ctx.fillText(line, drawX, cursorY);
          cursorY += lineHeight;
          if (cursorY > py + ph - lineHeight) break;
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      if (format === 'jpeg') {
        return canvas.toDataURL('image/jpeg', quality);
      }
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const url = await renderCompositeImageDataUrl('png');
      const link = document.createElement('a');
      link.href = url;
      link.download = 'text-separation-editor.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExporting(false);
    }
  };

  const startSecondaryCreation = async () => {
    setIsSecondarySubmitting(true);
    try {
      const referenceImageDataUrl = await renderCompositeImageDataUrl('jpeg', 0.82);
      const payload: TextSeparationSecondaryCreatePayload = {
        sample_title: sampleTitle,
        background_image_url: backgroundImageUrl,
        reference_image_data_url: referenceImageDataUrl,
        global_prompt: secondaryGlobalPrompt,
        elements: elements.map((item) => ({
          id: item.id,
          text: item.text,
          bbox: [
            Math.round(item.y * 1000),
            Math.round(item.x * 1000),
            Math.round((item.y + item.h) * 1000),
            Math.round((item.x + item.w) * 1000),
          ],
          prompt: item.prompt,
        })),
      };
      const task = await videoApi.textSeparationSecondaryCreate(payload);
      setSecondaryTasks((prev) => [
        {
          ...task,
          createdAt: new Date().toISOString(),
          previewUrl: null,
        },
        ...prev,
      ]);
    } finally {
      setIsSecondarySubmitting(false);
    }
  };

  const exportTextJson = () => {
    const payload = {
      text_blocks: elements.map((item) => ({
        id: item.id,
        text: item.text,
        bbox: [
          Math.round(item.y * 1000),
          Math.round(item.x * 1000),
          Math.round((item.y + item.h) * 1000),
          Math.round((item.x + item.w) * 1000),
        ],
        font_size: Math.round(item.fontSizePx),
        color: [
          parseInt(item.color.slice(1, 3), 16),
          parseInt(item.color.slice(3, 5), 16),
          parseInt(item.color.slice(5, 7), 16),
        ],
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'text-blocks.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPptx = async () => {
    setIsExportingPptx(true);
    try {
      const resp = await fetch(backgroundImageUrl, { method: 'GET' });
      if (!resp.ok) throw new Error(tr('下载背景失败', 'Failed to download background'));
      const blob = await resp.blob();
      const dataUrl = await blobToDataUrl(blob);

      const pptx = new PptxGenJS();
      const ratio = imageSize.width / imageSize.height;
      const slideHeight = 7.5;
      const slideWidth = Math.max(4, Number((slideHeight * ratio).toFixed(3)));

      pptx.layout = 'LAYOUT_WIDE';
      pptx.defineLayout({ name: 'VFLOW_TEXT_SEP', width: slideWidth, height: slideHeight });
      pptx.layout = 'VFLOW_TEXT_SEP';
      pptx.author = 'VFlow';
      pptx.subject = sampleTitle;
      pptx.title = `${sampleTitle} - Text Separation`;
      pptx.company = 'VFlow';

      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      slide.addImage({
        data: dataUrl,
        x: 0,
        y: 0,
        w: slideWidth,
        h: slideHeight,
      });

      const pptScale = Math.min((slideWidth * 96) / imageSize.width, (slideHeight * 96) / imageSize.height);
      elements.forEach((item) => {
        const fontSizePt = Math.max(6, Number(((item.fontSizePx * pptScale * 72) / 96).toFixed(1)));
        const shadowDx = item.shadowOffsetX * imageSize.width;
        const shadowDy = item.shadowOffsetY * imageSize.height;
        const shadowOffset = Math.sqrt(shadowDx * shadowDx + shadowDy * shadowDy);
        const shadowAngle = ((Math.atan2(shadowDy, shadowDx) * 180) / Math.PI + 360) % 360;
        slide.addText(item.text, {
          x: Number((item.x * slideWidth).toFixed(3)),
          y: Number((item.y * slideHeight).toFixed(3)),
          w: Number((item.w * slideWidth).toFixed(3)),
          h: Number((item.h * slideHeight).toFixed(3)),
          fontFace: isZh ? PPT_FONT_FACE_ZH : PPT_FONT_FACE_EN,
          fontSize: fontSizePt,
          bold: item.fontWeight >= 600,
          color: hexToRgb(item.color),
          align: item.align,
          margin: 0,
          breakLine: false,
          valign: 'middle',
          fit: 'none',
          fill: { color: 'FFFFFF', transparency: 100 },
          line: { color: 'FFFFFF', transparency: 100 },
          outline:
            item.strokeWidth > 0
              ? {
                  color: hexToRgb(item.strokeColor),
                  size: Math.max(0.5, Number((item.strokeWidth * Math.min(imageSize.width, imageSize.height) * pptScale * 0.75).toFixed(2))),
                }
              : undefined,
          shadow:
            item.shadowBlur > 0 || item.shadowOffsetX !== 0 || item.shadowOffsetY !== 0
              ? {
                  type: 'outer',
                  color: hexToRgb(item.shadowColor),
                  blur: Math.max(1, Math.round(item.shadowBlur * Math.min(imageSize.width, imageSize.height) * pptScale)),
                  angle: Math.round(shadowAngle),
                  offset: Math.max(
                    1,
                    Math.round(
                      shadowOffset
                    )
                  ),
                  opacity: 0.35,
                }
              : undefined,
        });
      });

      await pptx.writeFile({ fileName: 'text-separation-editor.pptx' });
    } finally {
      setIsExportingPptx(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/2 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (mode === 'secondary') {
                setMode('editor');
                return;
              }
              onBack();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/5 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            {tr('返回生成记录', 'Back to Generation Records')}
          </button>
          <div className="min-w-0">
            <div className="text-sm font-bold text-zinc-100">
              {mode === 'secondary' ? tr('AI 二次创作', 'AI Secondary Creation') : tr('海报文字编辑', 'Poster Text Editor')}
            </div>
            <div className="text-xs text-zinc-500 truncate">{sampleTitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'editor' ? (
            <>
              <button
                type="button"
                onClick={() => setMode('secondary')}
                className="inline-flex items-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-200 hover:bg-orange-500/20 transition"
              >
                <Sparkles className="w-4 h-4" />
                {tr('AI 二次创作', 'AI Secondary Creation')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setElements(initialElements);
                  setSelectedId(initialElements[0]?.id || null);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/5 transition"
              >
                <RotateCcw className="w-4 h-4" />
                {tr('恢复初始布局', 'Reset Layout')}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsExportMenuOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-black hover:bg-orange-400 transition"
                >
                  <Download className="w-4 h-4" />
                  {tr('导出', 'Export')}
                  <ChevronDown className={`h-4 w-4 transition ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isExportMenuOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur">
                    <button
                      type="button"
                      onClick={() => {
                        exportTextJson();
                        setIsExportMenuOpen(false);
                      }}
                      className="flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-bold text-zinc-200 hover:bg-white/5 transition"
                    >
                      {tr('导出文本 JSON', 'Export Text JSON')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsExportMenuOpen(false);
                        await exportPptx();
                      }}
                      disabled={isExportingPptx}
                      className="flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-bold text-zinc-200 hover:bg-white/5 disabled:opacity-60 transition"
                    >
                      {isExportingPptx ? tr('导出 PPTX 中...', 'Exporting PPTX...') : tr('导出 PPTX', 'Export PPTX')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsExportMenuOpen(false);
                        await handleExport();
                      }}
                      disabled={isExporting}
                      className="flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-bold text-zinc-200 hover:bg-white/5 disabled:opacity-60 transition"
                    >
                      {isExporting ? tr('导出 PNG 中...', 'Exporting PNG...') : tr('导出 PNG', 'Export PNG')}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_320px] gap-5">
        <div className="min-h-0 rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-bold text-zinc-100">
                {mode === 'secondary' ? tr('创作参考画布', 'Creation Reference Canvas') : tr('编辑画布', 'Editor Canvas')}
              </div>
              <div className="text-xs text-zinc-500">
                {mode === 'secondary'
                  ? tr('选择文本框并为整体效果或单个文本块填写创作提示词。', 'Select text blocks and describe the desired overall or per-block creative result.')
                  : tr('拖拽文本框移动，拖动右下角缩放，并在右侧面板编辑文字与样式。', 'Drag text blocks to move, use the bottom-right handle to resize, and edit text and styles in the right panel.')}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[11px] text-zinc-500">{tr(`共有 ${elements.length} 个文本框`, `${elements.length} text block(s)`)}</div>
              {mode === 'editor' ? (
                <>
                  <button
                    type="button"
                    onClick={addTextElement}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/5 transition"
                  >
                    <Plus className="h-4 w-4" />
                    {tr('添加文本框', 'Add Text Box')}
                  </button>
                  <button
                    type="button"
                    onClick={fitAllTextBoxesToSingleLine}
                    disabled={elements.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/5 disabled:opacity-50 transition"
                  >
                    {tr('调整到同一行', 'Fit to One Line')}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/30 p-4 overflow-hidden">
            <div ref={surfaceViewportRef} className="flex h-full w-full items-start justify-center overflow-hidden">
              <div
                ref={surfaceRef}
                className="relative shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-white"
                style={{
                  width: `${surfaceViewport.width}px`,
                  height: `${surfaceViewport.height}px`,
                }}
              >
                <img src={backgroundImageUrl} alt={sampleTitle} className="absolute inset-0 h-full w-full object-contain select-none pointer-events-none" />
                {elements.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(item.id)}
                    onPointerDown={mode === 'editor' ? (e) => startDrag(item.id, e) : undefined}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(item.id);
                      }
                    }}
                    className={`absolute rounded-lg border px-2 py-1 transition ${
                      selectedId === item.id ? 'border-orange-400 ring-2 ring-orange-500/60' : 'border-white/20 hover:border-white/40'
                    }`}
                    style={{
                      left: `${item.x * 100}%`,
                      top: `${item.y * 100}%`,
                      width: `${item.w * 100}%`,
                      minHeight: `${item.h * 100}%`,
                    }}
                  >
                    {(() => {
                      const fontSizePx = Math.max(12, Math.round(item.fontSizePx * (surfaceViewport.width / imageSize.width)));
                      return (
                        <div
                          className="w-full h-full break-words whitespace-pre-wrap leading-tight pointer-events-none"
                          style={{
                            color: item.color,
                            fontSize: `${fontSizePx}px`,
                            fontWeight: item.fontWeight,
                            fontFamily: WEB_FONT_FAMILY,
                            textAlign: item.align,
                            WebkitTextStroke: item.strokeWidth > 0 ? `${Math.max(1, item.strokeWidth * surfaceBaseSize)}px ${item.strokeColor}` : undefined,
                            textShadow:
                              item.shadowBlur > 0
                                ? `${Math.round(item.shadowOffsetX * surfaceBaseSize)}px ${Math.round(item.shadowOffsetY * surfaceBaseSize)}px ${Math.max(1, Math.round(item.shadowBlur * surfaceBaseSize))}px ${item.shadowColor}`
                                : undefined,
                          }}
                        >
                          {item.text}
                        </div>
                      );
                    })()}
                    {selectedId === item.id && mode === 'editor' ? (
                      <button
                        type="button"
                        onPointerDown={(e) => startResize(item.id, e)}
                        className="absolute -bottom-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-orange-300 bg-orange-500 text-black shadow"
                        aria-label={tr('缩放文本框', 'Resize text box')}
                      >
                        <MoveDiagonal2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex flex-col gap-5">
          <div className="rounded-2xl border border-white/5 bg-white/2 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
              {mode === 'secondary' ? <Sparkles className="w-4 h-4 text-orange-300" /> : <Type className="w-4 h-4 text-orange-300" />}
              {mode === 'secondary' ? tr('AI 二次创作', 'AI Secondary Creation') : tr('文本属性', 'Text Settings')}
            </div>
            {mode === 'secondary' ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{tr('整体效果描述', 'Global Prompt')}</div>
                  <textarea
                    value={secondaryGlobalPrompt}
                    onChange={(e) => setSecondaryGlobalPrompt(e.target.value)}
                    placeholder={tr('例如：整体海报更具艺术感，文字自然融入环境光影。', 'Example: Make the poster more artistic and blend the text naturally into the scene lighting.')}
                    className="min-h-[120px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-orange-500/60"
                  />
                </div>
                {selectedElement ? (
                  <div>
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{tr('当前文本框期望效果', 'Selected Block Prompt')}</div>
                    <div className="mb-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">{selectedElement.text || selectedElement.id}</div>
                    <textarea
                      value={selectedElement.prompt}
                      onChange={(e) => updateElement(selectedElement.id, { prompt: e.target.value })}
                      placeholder={tr('例如：金属质感、柔和发光、与背景边缘融合。', 'Example: Metallic texture, subtle glow, and soft edge blending with the background.')}
                      className="min-h-[120px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-orange-500/60"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-zinc-500">
                    {tr('先在左侧画布中选择一个文本框，再为该文本块填写期望效果。', 'Select a text block on the left canvas before writing a per-block prompt.')}
                  </div>
                )}
                <button
                  type="button"
                  onClick={startSecondaryCreation}
                  disabled={isSecondarySubmitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400 disabled:opacity-60 transition"
                >
                  <Sparkles className="h-4 w-4" />
                  {isSecondarySubmitting ? tr('开始二次创作中...', 'Starting Secondary Creation...') : tr('开始二次创作', 'Start Secondary Creation')}
                </button>
              </div>
            ) : selectedElement ? (
              <div className="mt-4 space-y-4">
                <button
                  type="button"
                  onClick={deleteSelectedElement}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/20 transition"
                >
                  <Trash2 className="h-4 w-4" />
                  {tr('删除文本框', 'Delete Text Box')}
                </button>

                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">ID</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">{selectedElement.id}</div>
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{tr('文本内容', 'Text')}</div>
                  <textarea
                    value={selectedElement.text}
                    onChange={(e) => updateElement(selectedElement.id, { text: e.target.value })}
                    className="min-h-[110px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-orange-500/60"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <span>{tr('字号', 'Font Size')}</span>
                    <span>{Math.round(selectedElement.fontSizePx)} px</span>
                  </div>
                  <input
                    type="range"
                    min="6"
                    max="240"
                    value={Math.round(selectedElement.fontSizePx)}
                    onChange={(e) => updateElement(selectedElement.id, { fontSizePx: Number(e.target.value) })}
                    className="w-full accent-orange-500"
                  />
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{tr('字重', 'Weight')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      [400, tr('常规', 'Regular')],
                      [700, tr('加粗', 'Bold')],
                    ] as Array<[number, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateElement(selectedElement.id, { fontWeight: value })}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                          selectedElement.fontWeight === value ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <span>{tr('字体颜色', 'Text Color')}</span>
                    <span className="font-mono normal-case tracking-normal">{selectedElement.color}</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                    <input
                      type="color"
                      value={selectedElement.color}
                      onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })}
                      className="h-10 w-14 cursor-pointer rounded border border-white/10 bg-transparent"
                    />
                    <div className="h-8 w-8 rounded-full border border-white/10" style={{ backgroundColor: selectedElement.color }} />
                    <input
                      value={selectedElement.color}
                      onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })}
                      className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-orange-500/60"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <span>{tr('描边颜色', 'Stroke Color')}</span>
                    <span className="font-mono normal-case tracking-normal">{selectedElement.strokeColor}</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                    <input
                      type="color"
                      value={selectedElement.strokeColor}
                      onChange={(e) => updateElement(selectedElement.id, { strokeColor: e.target.value })}
                      className="h-10 w-14 cursor-pointer rounded border border-white/10 bg-transparent"
                    />
                    <div className="h-8 w-8 rounded-full border border-white/10" style={{ backgroundColor: selectedElement.strokeColor }} />
                    <input
                      value={selectedElement.strokeColor}
                      onChange={(e) => updateElement(selectedElement.id, { strokeColor: e.target.value })}
                      className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-orange-500/60"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <span>{tr('描边粗细', 'Stroke Width')}</span>
                    <span>{Math.round(selectedElement.strokeWidth * 1000)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={Math.round(selectedElement.strokeWidth * 1000)}
                    onChange={(e) => updateElement(selectedElement.id, { strokeWidth: Number(e.target.value) / 1000 })}
                    className="w-full accent-orange-500"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <span>{tr('阴影颜色', 'Shadow Color')}</span>
                    <span className="font-mono normal-case tracking-normal">{selectedElement.shadowColor}</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                    <input
                      type="color"
                      value={selectedElement.shadowColor}
                      onChange={(e) => updateElement(selectedElement.id, { shadowColor: e.target.value })}
                      className="h-10 w-14 cursor-pointer rounded border border-white/10 bg-transparent"
                    />
                    <div className="h-8 w-8 rounded-full border border-white/10" style={{ backgroundColor: selectedElement.shadowColor }} />
                    <input
                      value={selectedElement.shadowColor}
                      onChange={(e) => updateElement(selectedElement.id, { shadowColor: e.target.value })}
                      className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-orange-500/60"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <span>{tr('阴影模糊', 'Shadow Blur')}</span>
                    <span>{Math.round(selectedElement.shadowBlur * 1000)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    value={Math.round(selectedElement.shadowBlur * 1000)}
                    onChange={(e) => updateElement(selectedElement.id, { shadowBlur: Number(e.target.value) / 1000 })}
                    className="w-full accent-orange-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                      <span>{tr('阴影 X', 'Shadow X')}</span>
                      <span>{Math.round(selectedElement.shadowOffsetX * 1000)}</span>
                    </div>
                    <input
                      type="range"
                      min="-30"
                      max="30"
                      value={Math.round(selectedElement.shadowOffsetX * 1000)}
                      onChange={(e) => updateElement(selectedElement.id, { shadowOffsetX: Number(e.target.value) / 1000 })}
                      className="w-full accent-orange-500"
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                      <span>{tr('阴影 Y', 'Shadow Y')}</span>
                      <span>{Math.round(selectedElement.shadowOffsetY * 1000)}</span>
                    </div>
                    <input
                      type="range"
                      min="-30"
                      max="30"
                      value={Math.round(selectedElement.shadowOffsetY * 1000)}
                      onChange={(e) => updateElement(selectedElement.id, { shadowOffsetY: Number(e.target.value) / 1000 })}
                      className="w-full accent-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{tr('对齐', 'Align')}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['left', tr('左对齐', 'Left')],
                      ['center', tr('居中', 'Center')],
                      ['right', tr('右对齐', 'Right')],
                    ] as Array<[TextElement['align'], string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateElement(selectedElement.id, { align: value })}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                          selectedElement.align === value ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-zinc-500">
                {tr('先在画布中选择一个文本框。', 'Select a text block on the canvas first.')}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/2 p-4">
            <div className="text-sm font-bold text-zinc-100">{tr('原图参考', 'Original Reference')}</div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-2">
              <img
                src={originalImageUrl}
                alt={tr('原始海报', 'Original poster')}
                className="block w-full h-auto max-h-[360px] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      </div>

      {mode === 'secondary' ? (
        <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
          <div>
            <div className="text-sm font-bold text-zinc-100">{tr('二次创作任务', 'Secondary Creation Tasks')}</div>
            <div className="text-xs text-zinc-500">{tr('这里展示待生成与已完成的二次创作任务。', 'Queued and completed secondary creation tasks appear here.')}</div>
          </div>
          {secondaryTasks.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {secondaryTasks.map((task) => (
                <button
                  key={task.request_id}
                  type="button"
                  onClick={() => {
                    if (task.previewUrl) {
                      setPreviewTask(task);
                    }
                  }}
                  disabled={!task.previewUrl}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-white/20 hover:bg-black/30 disabled:cursor-default disabled:hover:border-white/10 disabled:hover:bg-black/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-bold text-zinc-200">{task.request_id}</div>
                    <div
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        task.status === 'succeeded'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : task.status === 'failed'
                            ? 'bg-red-500/15 text-red-300'
                            : 'bg-orange-500/15 text-orange-200'
                      }`}
                    >
                      {task.status}
                    </div>
                  </div>
                  <div className="mt-3 aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    {task.previewUrl ? (
                      <img src={task.previewUrl} alt={task.request_id} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-500">
                        {task.status === 'failed'
                          ? tr('生成失败，请调整提示词后重试。', 'Generation failed. Refine the prompts and try again.')
                          : tr('等待生成结果...', 'Waiting for generated preview...')}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-zinc-500">
              {tr('开始一次 AI 二次创作后，任务会显示在这里。', 'Tasks will appear here after you start an AI secondary creation run.')}
            </div>
          )}
        </div>
      ) : null}

      <AppDialog
        isOpen={Boolean(previewTask?.previewUrl)}
        onClose={() => setPreviewTask(null)}
        title={tr('二次创作预览', 'Secondary Creation Preview')}
        subtitle={previewTask?.request_id || ''}
        widthClassName="max-w-5xl"
        contentClassName="overflow-auto"
      >
        {previewTask?.previewUrl ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <img
              src={previewTask.previewUrl}
              alt={previewTask.request_id}
              className="block max-h-[75vh] w-full object-contain rounded-xl"
            />
          </div>
        ) : null}
      </AppDialog>
    </div>
  );
};

export default TextSeparationDemoView;
