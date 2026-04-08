import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, ImagePlus, Plus, Replace, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-react';
import { AppDialog } from '../common/AppDialog';
import { galleryApi } from '../../services/galleryApi';
import type { GalleryAiLayoutProposal } from '../../types/gallery';

export type GalleryBoardAsset = {
  localId: string;
  requestId: string;
  imageUrl?: string;
  layout?: unknown;
};

type TrFn = (zhText: string, enText: string) => string;

type BoardImageLayer = {
  id: string;
  type: 'image';
  name: string;
  assetLocalId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  fit: 'cover' | 'contain';
  radius: number;
  opacity: number;
  showOriginal: boolean;
  keepAspectRatio: boolean;
  cropScale: number;
  cropOffsetX: number;
  cropOffsetY: number;
};

type BoardTextLayer = {
  id: string;
  type: 'text';
  name: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  color: string;
  background: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  padding: number;
};

type BoardLayer = BoardImageLayer | BoardTextLayer;

type BoardState = {
  templateId: string;
  canvasWidth: number;
  canvasHeight: number;
  background: string;
  backgroundImageAssetLocalId: string | null;
  backgroundImageX: number;
  backgroundImageY: number;
  backgroundImageW: number;
  backgroundImageH: number;
  backgroundImageFit: 'cover' | 'contain';
  backgroundImageOpacity: number;
  layers: BoardLayer[];
  selectedLayerId: string | null;
  selectedBackground: boolean;
};

type TemplateSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
  fit?: 'cover' | 'contain';
};

type TemplateDefinition = {
  id: string;
  imageCount: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  previewAssetPath: string;
  canvasWidth: number;
  canvasHeight: number;
  background: string;
  slots: TemplateSlot[];
  titleBox: { x: number; y: number; w: number; h: number };
  subtitleBox: { x: number; y: number; w: number; h: number };
};

type PointerAction =
  | {
      mode: 'drag';
      targetType: 'layer' | 'background';
      layerId?: string;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
    }
  | {
      mode: 'resize';
      targetType: 'layer' | 'background';
      layerId?: string;
      startClientX: number;
      startClientY: number;
      startW: number;
      startH: number;
      startX: number;
      startY: number;
    };

export interface GalleryBoardEditorProps {
  assets: GalleryBoardAsset[];
  productName: string;
  sellingPoints: string[];
  tr: TrFn;
  initialTemplateId?: string;
  initialTitle?: string;
  initialSubtitle?: string;
  initialBackground?: string;
  onClose?: () => void;
  onAlert?: (message: string) => void;
}

type PickerColorState = {
  hex: string;
  alpha: number;
  transparent: boolean;
};

type AssetImageSize = {
  width: number;
  height: number;
};

type RightPanelSectionKey = 'board' | 'inspector' | 'assets';
type LeftPanelSectionKey = 'templates' | 'aiLayouts';

const FONT_FAMILY_OPTIONS = ['system-ui', 'Microsoft YaHei', 'PingFang SC', 'SimHei', 'serif'];
const CANVAS_SIZE_OPTIONS = [
  { id: '1:1', label: '1:1', width: 1200, height: 1200 },
  { id: '4:5', label: '4:5', width: 1200, height: 1500 },
  { id: '3:4', label: '3:4', width: 1200, height: 1600 },
  { id: '9:16', label: '9:16', width: 1080, height: 1920 },
  { id: '16:9', label: '16:9', width: 1600, height: 900 },
] as const;

const TEMPLATE_MODE_OPTIONS: Array<TemplateDefinition['imageCount']> = [1, 2, 3, 4];
const TEMPLATE_MODE_LABELS: Record<TemplateDefinition['imageCount'], { zh: string; en: string }> = {
  1: { zh: '1图', en: '1 Image' },
  2: { zh: '2图', en: '2 Images' },
  3: { zh: '3图', en: '3 Images' },
  4: { zh: '4图', en: '4 Images' },
};

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: 'single_hero',
    imageCount: 1,
    name: 'Single Hero',
    description: '单图主视觉，适合商品首图和封面场景。',
    previewAssetPath: '/templates/gallery-board/single-hero-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#111827',
    slots: [{ x: 84, y: 230, w: 1032, h: 1180, fit: 'cover' }],
    titleBox: { x: 84, y: 72, w: 780, h: 96 },
    subtitleBox: { x: 84, y: 170, w: 900, h: 64 },
  },
  {
    id: 'single_center_card',
    imageCount: 1,
    name: 'Single Center Card',
    description: '中置单图留白排版，适合品牌感与高端视觉。',
    previewAssetPath: '/templates/gallery-board/single-center-card-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#0f172a',
    slots: [{ x: 150, y: 300, w: 900, h: 940, fit: 'contain' }],
    titleBox: { x: 96, y: 84, w: 820, h: 98 },
    subtitleBox: { x: 96, y: 186, w: 940, h: 76 },
  },
  {
    id: 'single_full_bleed',
    imageCount: 1,
    name: 'Single Full Bleed',
    description: '满版单图，适合冲击感强的场景封面。',
    previewAssetPath: '/templates/gallery-board/single-full-bleed-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#101010',
    slots: [{ x: 0, y: 0, w: 1200, h: 1500, fit: 'cover' }],
    titleBox: { x: 68, y: 1080, w: 900, h: 140 },
    subtitleBox: { x: 68, y: 1226, w: 980, h: 96 },
  },
  {
    id: 'dual_split',
    imageCount: 2,
    name: 'Dual Split',
    description: '左右双图对比，适合前后对比或双卖点展示。',
    previewAssetPath: '/templates/gallery-board/dual-split-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#1f2937',
    slots: [
      { x: 72, y: 360, w: 518, h: 1020, fit: 'cover' },
      { x: 610, y: 360, w: 518, h: 1020, fit: 'cover' },
    ],
    titleBox: { x: 72, y: 84, w: 800, h: 110 },
    subtitleBox: { x: 72, y: 200, w: 980, h: 84 },
  },
  {
    id: 'dual_stack',
    imageCount: 2,
    name: 'Dual Stack',
    description: '上下双图，适合步骤展示与体验流程。',
    previewAssetPath: '/templates/gallery-board/dual-stack-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#0b1120',
    slots: [
      { x: 84, y: 280, w: 1032, h: 520, fit: 'cover' },
      { x: 84, y: 860, w: 1032, h: 520, fit: 'cover' },
    ],
    titleBox: { x: 84, y: 80, w: 760, h: 100 },
    subtitleBox: { x: 84, y: 182, w: 940, h: 72 },
  },
  {
    id: 'hero_split',
    imageCount: 2,
    name: 'Hero Split',
    description: '右侧主图 + 左侧信息区，适合重点商品宣传。',
    previewAssetPath: '/templates/gallery-board/hero-split-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#151515',
    slots: [
      { x: 500, y: 240, w: 640, h: 1040, fit: 'cover' },
      { x: 86, y: 980, w: 320, h: 300, fit: 'cover' },
    ],
    titleBox: { x: 86, y: 120, w: 340, h: 180 },
    subtitleBox: { x: 86, y: 330, w: 340, h: 260 },
  },
  {
    id: 'story_triptych',
    imageCount: 3,
    name: 'Story Triptych',
    description: '三段式叙事结构，适合场景图和卖点图组合。',
    previewAssetPath: '/templates/gallery-board/story-triptych-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#111827',
    slots: [
      { x: 72, y: 300, w: 320, h: 420, fit: 'cover' },
      { x: 72, y: 760, w: 320, h: 420, fit: 'cover' },
      { x: 430, y: 300, w: 700, h: 880, fit: 'cover' },
    ],
    titleBox: { x: 72, y: 80, w: 680, h: 120 },
    subtitleBox: { x: 72, y: 200, w: 860, h: 84 },
  },
  {
    id: 'tri_columns',
    imageCount: 3,
    name: 'Tri Columns',
    description: '三列等宽结构，适合多规格或多场景对比。',
    previewAssetPath: '/templates/gallery-board/tri-columns-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#0f172a',
    slots: [
      { x: 72, y: 320, w: 336, h: 1080, fit: 'cover' },
      { x: 432, y: 320, w: 336, h: 1080, fit: 'cover' },
      { x: 792, y: 320, w: 336, h: 1080, fit: 'cover' },
    ],
    titleBox: { x: 72, y: 84, w: 820, h: 100 },
    subtitleBox: { x: 72, y: 190, w: 980, h: 80 },
  },
  {
    id: 'tri_top_two_bottom_one',
    imageCount: 3,
    name: 'Tri Top Two + Bottom One',
    description: '上两图下单图，适合细节补充 + 主视觉收束。',
    previewAssetPath: '/templates/gallery-board/tri-top-two-bottom-one-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#13131a',
    slots: [
      { x: 72, y: 280, w: 518, h: 470, fit: 'cover' },
      { x: 610, y: 280, w: 518, h: 470, fit: 'cover' },
      { x: 72, y: 800, w: 1056, h: 600, fit: 'cover' },
    ],
    titleBox: { x: 72, y: 80, w: 760, h: 100 },
    subtitleBox: { x: 72, y: 188, w: 960, h: 72 },
  },
  {
    id: 'quad_mosaic',
    imageCount: 4,
    name: 'Quad Mosaic',
    description: '四宫格拼贴，适合同类款式快速排版。',
    previewAssetPath: '/templates/gallery-board/quad-mosaic-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1200,
    background: '#0f172a',
    slots: [
      { x: 72, y: 220, w: 498, h: 398, fit: 'cover' },
      { x: 630, y: 220, w: 498, h: 398, fit: 'cover' },
      { x: 72, y: 680, w: 498, h: 398, fit: 'cover' },
      { x: 630, y: 680, w: 498, h: 398, fit: 'cover' },
    ],
    titleBox: { x: 72, y: 72, w: 640, h: 80 },
    subtitleBox: { x: 72, y: 150, w: 900, h: 56 },
  },
  {
    id: 'quad_equal_grid',
    imageCount: 4,
    name: 'Quad Equal Grid',
    description: '四图等分，适合统一风格的套餐图输出。',
    previewAssetPath: '/templates/gallery-board/quad-equal-grid-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#111827',
    slots: [
      { x: 72, y: 320, w: 498, h: 538, fit: 'cover' },
      { x: 630, y: 320, w: 498, h: 538, fit: 'cover' },
      { x: 72, y: 878, w: 498, h: 538, fit: 'cover' },
      { x: 630, y: 878, w: 498, h: 538, fit: 'cover' },
    ],
    titleBox: { x: 72, y: 84, w: 740, h: 100 },
    subtitleBox: { x: 72, y: 188, w: 960, h: 72 },
  },
  {
    id: 'quad_focus',
    imageCount: 4,
    name: 'Quad Focus',
    description: '一张主图 + 三张辅助图，适合主次关系明显的商品套图。',
    previewAssetPath: '/templates/gallery-board/quad-focus-preview.png',
    canvasWidth: 1200,
    canvasHeight: 1500,
    background: '#101827',
    slots: [
      { x: 72, y: 290, w: 690, h: 1120, fit: 'cover' },
      { x: 792, y: 290, w: 336, h: 350, fit: 'cover' },
      { x: 792, y: 675, w: 336, h: 350, fit: 'cover' },
      { x: 792, y: 1060, w: 336, h: 350, fit: 'cover' },
    ],
    titleBox: { x: 72, y: 84, w: 760, h: 100 },
    subtitleBox: { x: 72, y: 188, w: 940, h: 72 },
  },
];

const resolveTemplateModeById = (templateId?: string): TemplateDefinition['imageCount'] => {
  const matched = TEMPLATE_DEFINITIONS.find((item) => item.id === templateId);
  return matched?.imageCount || TEMPLATE_DEFINITIONS[0].imageCount;
};

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const clampFramePosition = (position: number, canvasSize: number, frameSize: number) => {
  const min = Math.min(0, canvasSize - frameSize);
  const max = Math.max(0, canvasSize - frameSize);
  return clamp(position, min, max);
};

const normalizeHexColor = (value: string) => {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  return '#ffffff';
};

const rgbaToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((item) => clamp(Math.round(item), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`.toLowerCase();

const parseColorToState = (value: string, fallback: string): PickerColorState => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'transparent') {
    return { hex: normalizeHexColor(fallback), alpha: 0, transparent: true };
  }

  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) {
    return { hex: normalizeHexColor(raw), alpha: 1, transparent: false };
  }

  const rgbaMatch = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((item) => item.trim());
    if (parts.length >= 3) {
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      const a = parts.length > 3 ? clamp(Number(parts[3]), 0, 1) : 1;
      return {
        hex: rgbaToHex(r, g, b),
        alpha: a,
        transparent: a === 0,
      };
    }
  }

  return { hex: normalizeHexColor(fallback), alpha: 1, transparent: false };
};

const buildColorString = ({ hex, alpha, transparent }: PickerColorState) => {
  if (transparent || alpha <= 0) return 'transparent';
  if (alpha >= 0.999) return normalizeHexColor(hex);
  const normalized = normalizeHexColor(hex);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
};

type ColorFieldProps = {
  label: string;
  value: string;
  fallback: string;
  tr: TrFn;
  onChange: (next: string) => void;
  allowTransparent?: boolean;
};

const ColorField: React.FC<ColorFieldProps> = ({ label, value, fallback, tr, onChange, allowTransparent = false }) => {
  const state = useMemo(() => parseColorToState(value, fallback), [fallback, value]);

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={state.hex}
            onChange={(event) =>
              onChange(
                buildColorString({
                  ...state,
                  hex: event.target.value,
                  transparent: false,
                  alpha: state.transparent ? 1 : state.alpha,
                })
              )
            }
            className="h-10 w-14 cursor-pointer rounded border border-white/10 bg-transparent"
          />
          <div className="min-w-0 flex-1">
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-300">
              {value || state.hex}
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>{tr('透明度', 'Opacity')}</span>
            <span>{Math.round(state.transparent ? 0 : state.alpha * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round((state.transparent ? 0 : state.alpha) * 100)}
            onChange={(event) =>
              onChange(
                buildColorString({
                  ...state,
                  alpha: clamp(Number(event.target.value) / 100, 0, 1),
                  transparent: Number(event.target.value) <= 0,
                })
              )
            }
            className="w-full accent-orange-400"
          />
        </div>

        {allowTransparent ? (
          <button
            type="button"
            onClick={() => onChange('transparent')}
            className="mt-3 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            {tr('设为透明', 'Set Transparent')}
          </button>
        ) : null}
      </div>
    </div>
  );
};


const buildFetchOptions = (url: string): RequestInit => {
  const raw = String(url || '').trim();
  const isAbsolute = /^https?:\/\//i.test(raw);
  if (!isAbsolute) return { method: 'GET', credentials: 'include' };

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return { method: 'GET', credentials: 'include' };
    }
  } catch {
    return { method: 'GET', credentials: 'include' };
  }

  return { method: 'GET', credentials: 'omit', mode: 'cors' };
};

const fitImageRect = (
  fit: 'cover' | 'contain',
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
) => {
  const safeSourceWidth = Math.max(sourceWidth, 1);
  const safeSourceHeight = Math.max(sourceHeight, 1);
  const safeTargetWidth = Math.max(targetWidth, 1);
  const safeTargetHeight = Math.max(targetHeight, 1);
  const sourceRatio = safeSourceWidth / safeSourceHeight;
  const targetRatio = safeTargetWidth / safeTargetHeight;

  if (fit === 'contain') {
    if (sourceRatio > targetRatio) {
      const drawHeight = safeTargetWidth / sourceRatio;
      return {
        sx: 0,
        sy: 0,
        sw: safeSourceWidth,
        sh: safeSourceHeight,
        dx: 0,
        dy: (safeTargetHeight - drawHeight) / 2,
        dw: safeTargetWidth,
        dh: drawHeight,
      };
    }
    const drawWidth = safeTargetHeight * sourceRatio;
    return {
      sx: 0,
      sy: 0,
      sw: safeSourceWidth,
      sh: safeSourceHeight,
      dx: (safeTargetWidth - drawWidth) / 2,
      dy: 0,
      dw: drawWidth,
      dh: safeTargetHeight,
    };
  }

  if (sourceRatio > targetRatio) {
    const cropWidth = safeSourceHeight * targetRatio;
    return {
      sx: (safeSourceWidth - cropWidth) / 2,
      sy: 0,
      sw: cropWidth,
      sh: safeSourceHeight,
      dx: 0,
      dy: 0,
      dw: safeTargetWidth,
      dh: safeTargetHeight,
    };
  }

  const cropHeight = safeSourceWidth / targetRatio;
  return {
    sx: 0,
    sy: (safeSourceHeight - cropHeight) / 2,
    sw: safeSourceWidth,
    sh: cropHeight,
    dx: 0,
    dy: 0,
    dw: safeTargetWidth,
    dh: safeTargetHeight,
  };
};

const resolveImageFitMode = (layer: Pick<BoardImageLayer, 'fit' | 'showOriginal'>): 'cover' | 'contain' =>
  layer.showOriginal ? 'contain' : layer.fit;

const getLayerImageDrawRect = (
  layer: Pick<BoardImageLayer, 'w' | 'h' | 'fit' | 'showOriginal' | 'cropScale' | 'cropOffsetX' | 'cropOffsetY'>,
  sourceWidth: number,
  sourceHeight: number
) => {
  const safeSourceWidth = Math.max(sourceWidth, 1);
  const safeSourceHeight = Math.max(sourceHeight, 1);
  const targetWidth = Math.max(layer.w, 1);
  const targetHeight = Math.max(layer.h, 1);
  const fitMode = resolveImageFitMode(layer);
  const baseScale =
    fitMode === 'contain'
      ? Math.min(targetWidth / safeSourceWidth, targetHeight / safeSourceHeight)
      : Math.max(targetWidth / safeSourceWidth, targetHeight / safeSourceHeight);
  const cropScale = clamp(layer.cropScale ?? 1, 1, 6);
  const drawW = safeSourceWidth * baseScale * cropScale;
  const drawH = safeSourceHeight * baseScale * cropScale;
  const overflowX = Math.max(drawW - targetWidth, 0);
  const overflowY = Math.max(drawH - targetHeight, 0);
  const offsetX = clamp(layer.cropOffsetX ?? 0, -1, 1) * (overflowX / 2);
  const offsetY = clamp(layer.cropOffsetY ?? 0, -1, 1) * (overflowY / 2);

  return {
    dx: (targetWidth - drawW) / 2 + offsetX,
    dy: (targetHeight - drawH) / 2 + offsetY,
    dw: drawW,
    dh: drawH,
  };
};

const alignFrameToContainedImage = (
  layer: Pick<BoardImageLayer, 'x' | 'y' | 'w' | 'h'>,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
) => {
  const rect = fitImageRect('contain', sourceWidth, sourceHeight, layer.w, layer.h);
  const nextW = clamp(rect.dw, 24, canvasWidth);
  const nextH = clamp(rect.dh, 24, canvasHeight);
  const nextX = clamp(layer.x + rect.dx, 0, Math.max(canvasWidth - nextW, 0));
  const nextY = clamp(layer.y + rect.dy, 0, Math.max(canvasHeight - nextH, 0));

  return {
    x: nextX,
    y: nextY,
    w: nextW,
    h: nextH,
  };
};

const wrapTextLines = (ctx: CanvasRenderingContext2D, content: string, maxWidth: number) => {
  const paragraphs = String(content || '').split(/\r?\n/);
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      result.push('');
      continue;
    }

    let current = '';
    for (const char of Array.from(paragraph)) {
      const next = `${current}${char}`;
      if (ctx.measureText(next).width <= maxWidth || !current) {
        current = next;
        continue;
      }
      result.push(current);
      current = char;
    }
    if (current) result.push(current);
  }

  return result;
};

const loadImageFromUrl = async (url: string) => {
  const response = await fetch(url, buildFetchOptions(url));
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const blobToDataUrl = async (blob: Blob) => {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file as data URL'));
    reader.readAsDataURL(blob);
  });
};

const inferAspectRatioId = (width: number, height: number) => {
  const matched = CANVAS_SIZE_OPTIONS.find((item) => item.width === width && item.height === height);
  if (matched) return matched.id;

  const safeWidth = Math.max(Math.round(width || 1), 1);
  const safeHeight = Math.max(Math.round(height || 1), 1);
  const ratio = safeWidth / safeHeight;

  if (Math.abs(ratio - 1) < 0.02) return '1:1';
  if (Math.abs(ratio - 4 / 5) < 0.02) return '4:5';
  if (Math.abs(ratio - 3 / 4) < 0.02) return '3:4';
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16';
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9';
  return 'custom';
};

const GalleryBoardEditor: React.FC<GalleryBoardEditorProps> = ({
  assets,
  productName,
  sellingPoints,
  tr,
  initialTemplateId,
  initialTitle,
  initialSubtitle,
  initialBackground,
  onClose,
  onAlert,
}) => {
  const layerIdSeedRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const pointerActionRef = useRef<PointerAction | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const localAssetUrlsRef = useRef<string[]>([]);
  const assetImageSizeCacheRef = useRef<Map<string, AssetImageSize>>(new Map());
  const [zoom, setZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 960, height: 720 });
  const [localAssets, setLocalAssets] = useState<GalleryBoardAsset[]>([]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [textFontSizeDraft, setTextFontSizeDraft] = useState('');
  const [selectedAssetLocalIds, setSelectedAssetLocalIds] = useState<string[]>([]);
  const [isGeneratingAiLayouts, setIsGeneratingAiLayouts] = useState(false);
  const [aiLayoutProposals, setAiLayoutProposals] = useState<GalleryAiLayoutProposal[]>([]);
  const [aiLayoutFallbackUsed, setAiLayoutFallbackUsed] = useState(false);
  const [aiLayoutMessage, setAiLayoutMessage] = useState('');
  const [templateMode, setTemplateMode] = useState<TemplateDefinition['imageCount']>(() => resolveTemplateModeById(initialTemplateId));
  const [, setAssetImageMetaVersion] = useState(0);
  const [rightPanelSections, setRightPanelSections] = useState<Record<RightPanelSectionKey, boolean>>({
    board: true,
    inspector: true,
    assets: false,
  });
  const [leftPanelSections, setLeftPanelSections] = useState<Record<LeftPanelSectionKey, boolean>>({
    templates: true,
    aiLayouts: true,
  });

  const nextLayerId = () => {
    layerIdSeedRef.current += 1;
    return `board-layer-${layerIdSeedRef.current}`;
  };

  const mergedAssets = useMemo(() => [...localAssets, ...assets], [assets, localAssets]);
  const selectedAssets = useMemo(
    () => selectedAssetLocalIds.map((localId) => mergedAssets.find((item) => item.localId === localId)).filter(Boolean) as GalleryBoardAsset[],
    [mergedAssets, selectedAssetLocalIds]
  );

  useEffect(() => {
    localAssetUrlsRef.current = localAssets
      .map((item) => String(item.imageUrl || ''))
      .filter((url) => url.startsWith('blob:'));
  }, [localAssets]);

  useEffect(() => {
    return () => {
      localAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const availableIds = new Set(mergedAssets.map((item) => item.localId));
    setSelectedAssetLocalIds((prev) => prev.filter((item) => availableIds.has(item)));
  }, [mergedAssets]);

  const assetMap = useMemo(() => {
    const entries = mergedAssets
      .filter((item) => Boolean(String(item.imageUrl || '').trim()))
      .map((item) => [item.localId, item] as const);
    return new Map(entries);
  }, [mergedAssets]);

  const assetIds = useMemo(() => Array.from(assetMap.keys()), [assetMap]);

  const buildBoardFromTemplate = (
    templateId: string,
    previous?: Partial<BoardState>
  ): BoardState => {
    const template = TEMPLATE_DEFINITIONS.find((item) => item.id === templateId) || TEMPLATE_DEFINITIONS[0];
    const previousCanvasWidth = Math.max(previous?.canvasWidth || template.canvasWidth, 1);
    const previousCanvasHeight = Math.max(previous?.canvasHeight || template.canvasHeight, 1);
    const scaleX = template.canvasWidth / previousCanvasWidth;
    const scaleY = template.canvasHeight / previousCanvasHeight;
    const titleText =
      String(initialTitle || '').trim() ||
      String(productName || '').trim() ||
      tr('商品主标题', 'Product Headline');
    const subtitleFallback = String(initialSubtitle || '').trim();
    const sellingPointTexts = Array.from({ length: template.imageCount }, (_, index) => {
      const current = String(sellingPoints[index] || '').trim();
      if (current) return current;
      if (index === 0 && subtitleFallback) return subtitleFallback;
      return `${tr('卖点', 'Selling Point')} ${index + 1}`;
    });

    const imageLayers: BoardLayer[] = template.slots.map((slot, index) => ({
      id: nextLayerId(),
      type: 'image' as const,
      name: `${tr('图片', 'Image')} ${index + 1}`,
      assetLocalId: assetIds[index] || null,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      fit: slot.fit || 'cover',
      radius: 0,
      opacity: 1,
      showOriginal: false,
      keepAspectRatio: false,
      cropScale: 1,
      cropOffsetX: 0,
      cropOffsetY: 0,
    }));

    const sellingPointLayers: BoardLayer[] = template.slots
      .slice(0, template.imageCount)
      .map((slot, index) => {
        const boxHeight = clamp(Math.round(slot.h * 0.2), 56, 132);
        const x = clamp(slot.x + 12, 0, template.canvasWidth - 120);
        const y = clamp(slot.y + slot.h - boxHeight - 12, 0, template.canvasHeight - boxHeight);
        const maxWidth = Math.max(template.canvasWidth - x, 120);
        return {
          id: nextLayerId(),
          type: 'text',
          name: `${tr('卖点', 'Selling Point')} ${index + 1}`,
          text: sellingPointTexts[index],
          x,
          y,
          w: clamp(slot.w - 24, 120, maxWidth),
          h: boxHeight,
          fontSize: clamp(Math.round(slot.h * 0.08), 20, 38),
          fontWeight: 600,
          fontFamily: 'Microsoft YaHei',
          color: '#ffffff',
          background: 'rgba(0,0,0,0.35)',
          align: 'left',
          lineHeight: 1.2,
          padding: 12,
        } as BoardTextLayer;
      });

    const layers: BoardLayer[] = [
      ...imageLayers,
      ...sellingPointLayers,
      {
        id: nextLayerId(),
        type: 'text',
        name: tr('主标题', 'Title'),
        text: titleText,
        x: template.titleBox.x,
        y: template.titleBox.y,
        w: template.titleBox.w,
        h: template.titleBox.h,
        fontSize: template.canvasWidth >= 1200 ? 64 : 54,
        fontWeight: 700,
        fontFamily: 'Microsoft YaHei',
        color: '#ffffff',
        background: 'transparent',
        align: 'left',
        lineHeight: 1.1,
        padding: 0,
      },
    ];

    return {
      templateId: template.id,
      canvasWidth: template.canvasWidth,
      canvasHeight: template.canvasHeight,
      background: String(previous?.background || initialBackground || template.background || '#111111'),
      backgroundImageAssetLocalId: previous?.backgroundImageAssetLocalId || null,
      backgroundImageX: (previous?.backgroundImageX ?? 0) * scaleX,
      backgroundImageY: (previous?.backgroundImageY ?? 0) * scaleY,
      backgroundImageW: clamp(
        (previous?.backgroundImageW ?? template.canvasWidth) * scaleX,
        120,
        3200
      ),
      backgroundImageH: clamp(
        (previous?.backgroundImageH ?? template.canvasHeight) * scaleY,
        120,
        3200
      ),
      backgroundImageFit: previous?.backgroundImageFit || 'cover',
      backgroundImageOpacity: previous?.backgroundImageOpacity ?? 1,
      layers,
      selectedLayerId: null,
      selectedBackground: false,
    };
  };

  const [board, setBoard] = useState<BoardState>(() => buildBoardFromTemplate(initialTemplateId || TEMPLATE_DEFINITIONS[0].id));
  const filteredTemplates = useMemo(
    () => TEMPLATE_DEFINITIONS.filter((item) => item.imageCount === templateMode),
    [templateMode]
  );

  useEffect(() => {
    const matched = TEMPLATE_DEFINITIONS.find((item) => item.id === board.templateId);
    if (!matched) return;
    setTemplateMode((prev) => (prev === matched.imageCount ? prev : matched.imageCount));
  }, [board.templateId]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const boardScale = useMemo(() => {
    const fitX = (viewportSize.width - 32) / Math.max(board.canvasWidth, 1);
    const fitY = (viewportSize.height - 32) / Math.max(board.canvasHeight, 1);
    const fit = clamp(Math.min(fitX, fitY, 1), 0.28, 1);
    return clamp(fit * zoom, 0.2, 2);
  }, [board.canvasHeight, board.canvasWidth, viewportSize.height, viewportSize.width, zoom]);

  const selectedLayer = useMemo(
    () => board.layers.find((layer) => layer.id === board.selectedLayerId) || null,
    [board.layers, board.selectedLayerId]
  );
  useEffect(() => {
    if (selectedLayer?.type === 'text') {
      setTextFontSizeDraft(String(Math.round(selectedLayer.fontSize)));
      return;
    }
    setTextFontSizeDraft('');
  }, [selectedLayer]);
  const backgroundAsset = useMemo(
    () => (board.backgroundImageAssetLocalId ? assetMap.get(board.backgroundImageAssetLocalId) || null : null),
    [assetMap, board.backgroundImageAssetLocalId]
  );
  const backgroundImageUrl = String(backgroundAsset?.imageUrl || '').trim();
  const currentCanvasPresetId = useMemo(() => {
    const matched = CANVAS_SIZE_OPTIONS.find(
      (item) => item.width === board.canvasWidth && item.height === board.canvasHeight
    );
    return matched?.id || 'custom';
  }, [board.canvasHeight, board.canvasWidth]);
  const backgroundBounds = useMemo(
    () => ({
      x: board.backgroundImageX,
      y: board.backgroundImageY,
      w: board.backgroundImageW,
      h: board.backgroundImageH,
    }),
    [board.backgroundImageH, board.backgroundImageW, board.backgroundImageX, board.backgroundImageY]
  );
  const isBackgroundSelected = board.selectedBackground && Boolean(backgroundImageUrl);
  useEffect(() => {
    if (!selectedLayer && !isBackgroundSelected) return;
    setRightPanelSections((prev) => ({ ...prev, inspector: true }));
  }, [isBackgroundSelected, selectedLayer]);

  const updateBoard = (updater: (prev: BoardState) => BoardState) => {
    setBoard((prev) => updater(prev));
  };

  const getAssetImageSize = async (assetLocalId: string | null | undefined) => {
    const asset = assetLocalId ? assetMap.get(assetLocalId) : undefined;
    const imageUrl = String(asset?.imageUrl || '').trim();
    if (!imageUrl) return null;

    const cached = assetImageSizeCacheRef.current.get(imageUrl);
    if (cached) return cached;

    const image = await loadImageFromUrl(imageUrl);
    const size = {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
    assetImageSizeCacheRef.current.set(imageUrl, size);
    return size;
  };

  const cacheAssetImageSize = (imageUrl: string, width: number, height: number) => {
    if (!imageUrl || width <= 0 || height <= 0) return;
    const current = assetImageSizeCacheRef.current.get(imageUrl);
    if (current && current.width === width && current.height === height) return;
    assetImageSizeCacheRef.current.set(imageUrl, { width, height });
    setAssetImageMetaVersion((prev) => prev + 1);
  };

  const rememberAssetImageSize = (imageUrl: string, element: HTMLImageElement) => {
    const width = element.naturalWidth || element.width;
    const height = element.naturalHeight || element.height;
    cacheAssetImageSize(imageUrl, width, height);
  };

  const alignImageLayerToSourceBounds = async (layerId: string, assetLocalIdOverride?: string | null) => {
    const layer = board.layers.find((item) => item.id === layerId);
    if (!layer || layer.type !== 'image') return;

    const imageSize = await getAssetImageSize(assetLocalIdOverride ?? layer.assetLocalId);
    if (!imageSize) return;

    updateBoard((prev) => ({
      ...prev,
      layers: prev.layers.map((item) => {
        if (item.id !== layerId || item.type !== 'image') return item;
        const nextBounds = alignFrameToContainedImage(
          item,
          imageSize.width,
          imageSize.height,
          prev.canvasWidth,
          prev.canvasHeight
        );
        return {
          ...item,
          ...nextBounds,
          keepAspectRatio: true,
        };
      }),
    }));
  };

  const updateLayer = (layerId: string, updater: (layer: BoardLayer) => BoardLayer) => {
    updateBoard((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)),
    }));
  };

  const selectLayer = (layerId: string | null) => {
    setBoard((prev) => ({ ...prev, selectedLayerId: layerId, selectedBackground: false }));
  };

  const selectBackground = () => {
    setBoard((prev) => ({ ...prev, selectedLayerId: null, selectedBackground: true }));
  };

  const clearSelection = () => {
    setBoard((prev) => ({ ...prev, selectedLayerId: null, selectedBackground: false }));
  };

  const toggleRightPanelSection = (section: RightPanelSectionKey) => {
    setRightPanelSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleLeftPanelSection = (section: LeftPanelSectionKey) => {
    setLeftPanelSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleAssetSelection = (assetLocalId: string) => {
    setSelectedAssetLocalIds((prev) => {
      if (prev.includes(assetLocalId)) return prev.filter((item) => item !== assetLocalId);
      return [...prev, assetLocalId];
    });
  };

  const applyAiLayoutProposal = (proposal: GalleryAiLayoutProposal) => {
    const canvasWidth = clamp(Math.round(proposal.canvas?.width || board.canvasWidth), 600, 2400);
    const canvasHeight = clamp(Math.round(proposal.canvas?.height || board.canvasHeight), 600, 2400);
    const palette = proposal.design_tokens?.palette || [];
    const backgroundColor = String(proposal.background?.color || palette[0] || board.background || '#111111').trim() || '#111111';
    const fontFamily = String(proposal.design_tokens?.font_family || 'Microsoft YaHei').trim() || 'Microsoft YaHei';
    const nextLayers = [...(proposal.layers || [])]
      .sort((a, b) => (a.z_index || 0) - (b.z_index || 0))
      .reduce<BoardLayer[]>((result, layer, index) => {
        const rect = layer.rect || { x: 0.1, y: 0.1, w: 0.3, h: 0.2 };
        const x = clamp(Number(rect.x || 0) * canvasWidth, 0, canvasWidth);
        const y = clamp(Number(rect.y || 0) * canvasHeight, 0, canvasHeight);
        const w = clamp(Number(rect.w || 0.3) * canvasWidth, 80, canvasWidth);
        const h = clamp(Number(rect.h || 0.2) * canvasHeight, 60, canvasHeight);
        const layerId = nextLayerId();

        if (layer.type === 'image') {
          const source = layer.source || {};
          const assetIndex = clamp(Number(source.asset_index || 0), 0, Math.max(selectedAssetLocalIds.length - 1, 0));
          const assetLocalId = selectedAssetLocalIds[assetIndex] || selectedAssets[assetIndex]?.localId || null;
          if (!assetLocalId) return result;
          const style = layer.style || {};
          result.push({
            id: layerId,
            type: 'image',
            name: String(layer.name || layer.role || `图片 ${index + 1}`),
            assetLocalId,
            x,
            y,
            w: clamp(w, 120, canvasWidth),
            h: clamp(h, 120, canvasHeight),
            fit: 'contain',
            radius: clamp(Number(style.radius || 0), 0, 160),
            opacity: clamp(Number(style.opacity ?? 1), 0, 1),
            showOriginal: true,
            keepAspectRatio: true,
            cropScale: 1,
            cropOffsetX: 0,
            cropOffsetY: 0,
          });
          return result;
        }

        const style = layer.style || {};
        result.push({
          id: layerId,
          type: 'text',
          name: String(layer.name || layer.role || `文字 ${index + 1}`),
          text: String(layer.text_content || '').trim(),
          x,
          y,
          w: clamp(w, 120, canvasWidth),
          h: clamp(h, 60, canvasHeight),
          fontSize: clamp((Number(style.font_size || 0.03) || 0.03) * canvasHeight, 12, 160),
          fontWeight: clamp(Number(style.font_weight || 600), 300, 900),
          fontFamily,
          color: String(style.color || '#1F1F1F'),
          background: String(style.background || 'transparent'),
          align: style.align === 'center' || style.align === 'right' ? style.align : 'left',
          lineHeight: 1.2,
          padding: 0,
        });
        return result;
      }, []);

    if (nextLayers.length < 1) {
      onAlert?.(tr('AI 排版方案中没有可用图层。', 'No usable layers were returned in this AI layout.'));
      return;
    }

    setBoard({
      templateId: String(proposal.id || inferAspectRatioId(canvasWidth, canvasHeight)),
      canvasWidth,
      canvasHeight,
      background: backgroundColor,
      backgroundImageAssetLocalId: null,
      backgroundImageX: 0,
      backgroundImageY: 0,
      backgroundImageW: canvasWidth,
      backgroundImageH: canvasHeight,
      backgroundImageFit: 'cover',
      backgroundImageOpacity: 1,
      layers: nextLayers,
      selectedLayerId: nextLayers[0]?.id || null,
      selectedBackground: false,
    });
    setLeftPanelSections((prev) => ({ ...prev, aiLayouts: true }));
  };

  const generateAiLayouts = async () => {
    if (selectedAssets.length < 1) {
      onAlert?.(tr('请先在右侧素材区勾选至少一张素材图。', 'Select at least one asset from the asset panel first.'));
      return;
    }

    setIsGeneratingAiLayouts(true);
    try {
      setAiLayoutMessage('');
      const selectedAssetsForLlm = await Promise.all(
        selectedAssets.map(async (asset, index) => {
          let imageUrl = String(asset.imageUrl || '').trim();
          if (imageUrl.startsWith('blob:')) {
            try {
              const blobResponse = await fetch(imageUrl);
              if (blobResponse.ok) {
                const blob = await blobResponse.blob();
                imageUrl = await blobToDataUrl(blob);
              }
            } catch {
              imageUrl = String(asset.imageUrl || '').trim();
            }
          }

          return {
            local_id: asset.localId,
            name: `${tr('图片', 'Image')} ${index + 1}`,
            image_url: imageUrl,
          };
        })
      );
      const response = await galleryApi.generateLayouts({
        product_name: productName,
        core_selling_points: sellingPoints.filter((item) => String(item || '').trim()),
        aspect_ratio: currentCanvasPresetId === 'custom' ? inferAspectRatioId(board.canvasWidth, board.canvasHeight) : currentCanvasPresetId,
        count: 3,
        selected_assets: selectedAssetsForLlm,
      });

      const proposals = response?.data?.proposals || [];
      setAiLayoutProposals(proposals);
      setAiLayoutFallbackUsed(Boolean(response?.data?.fallback_used));
      setAiLayoutMessage(String(response?.data?.warning || ''));
      setLeftPanelSections((prev) => ({ ...prev, aiLayouts: true }));
      if (proposals.length < 1) {
        onAlert?.(tr('未生成可用的排版方案。', 'No usable layout proposals were generated.'));
      }
    } catch (error: any) {
      setAiLayoutFallbackUsed(false);
      setAiLayoutMessage('');
      onAlert?.(String(error?.message || error || tr('生成 AI 排版失败。', 'Failed to generate AI layouts.')));
    } finally {
      setIsGeneratingAiLayouts(false);
    }
  };

  const removeSelectedLayer = () => {
    if (!board.selectedLayerId) return;
    updateBoard((prev) => {
      const nextLayers = prev.layers.filter((layer) => layer.id !== prev.selectedLayerId);
      return {
        ...prev,
        layers: nextLayers,
        selectedLayerId: null,
      };
    });
  };

  const resizeCanvas = (nextWidth: number, nextHeight: number) => {
    const safeWidth = clamp(Math.round(nextWidth), 600, 2400);
    const safeHeight = clamp(Math.round(nextHeight), 600, 2400);

    updateBoard((prev) => {
      const scaleX = safeWidth / Math.max(prev.canvasWidth, 1);
      const scaleY = safeHeight / Math.max(prev.canvasHeight, 1);

      return {
        ...prev,
        canvasWidth: safeWidth,
        canvasHeight: safeHeight,
        backgroundImageX: prev.backgroundImageX * scaleX,
        backgroundImageY: prev.backgroundImageY * scaleY,
        backgroundImageW: clamp(prev.backgroundImageW * scaleX, 120, 3200),
        backgroundImageH: clamp(prev.backgroundImageH * scaleY, 120, 3200),
        layers: prev.layers.map((layer) => ({
          ...layer,
          x: layer.x * scaleX,
          y: layer.y * scaleY,
          w: layer.w * scaleX,
          h: layer.h * scaleY,
          ...(layer.type === 'text' ? { fontSize: layer.fontSize * Math.min(scaleX, scaleY) } : {}),
        })),
      };
    });
  };

  const setCanvasPreset = (presetId: string) => {
    const preset = CANVAS_SIZE_OPTIONS.find((item) => item.id === presetId);
    if (!preset) return;
    resizeCanvas(preset.width, preset.height);
  };

  const addTextLayer = () => {
    const layer: BoardTextLayer = {
      id: nextLayerId(),
      type: 'text',
      name: tr('新文字', 'New Text'),
      text: tr('在右侧属性区修改这段文案', 'Edit this copy in the inspector on the right'),
      x: 80,
      y: 80,
      w: 360,
      h: 140,
      fontSize: 36,
      fontWeight: 700,
      fontFamily: 'Microsoft YaHei',
      color: '#ffffff',
      background: 'rgba(0,0,0,0.18)',
      align: 'left',
      lineHeight: 1.25,
      padding: 16,
    };

    updateBoard((prev) => ({
      ...prev,
      layers: [...prev.layers, layer],
      selectedLayerId: layer.id,
      selectedBackground: false,
    }));
  };

  const addImageLayer = (assetLocalId: string, x?: number, y?: number) => {
    const layer: BoardImageLayer = {
      id: nextLayerId(),
      type: 'image',
      name: tr('新增图片', 'New Image'),
      assetLocalId,
      x: clamp(x ?? board.canvasWidth * 0.16, 0, Math.max(board.canvasWidth - 320, 0)),
      y: clamp(y ?? board.canvasHeight * 0.2, 0, Math.max(board.canvasHeight - 320, 0)),
      w: clamp(board.canvasWidth * 0.28, 180, board.canvasWidth),
      h: clamp(board.canvasHeight * 0.28, 180, board.canvasHeight),
      fit: 'cover',
      radius: 0,
      opacity: 1,
      showOriginal: false,
      keepAspectRatio: false,
      cropScale: 1,
      cropOffsetX: 0,
      cropOffsetY: 0,
    };

    updateBoard((prev) => ({
      ...prev,
      layers: [...prev.layers, layer],
      selectedLayerId: layer.id,
      selectedBackground: false,
    }));
  };

  const replaceSelectedImage = (assetLocalId: string) => {
    if (!selectedLayer || selectedLayer.type !== 'image') {
      onAlert?.(tr('请先在画板上选中一个图片图层。', 'Select an image layer on the board first.'));
      return;
    }

    updateLayer(selectedLayer.id, (layer) => (layer.type === 'image' ? { ...layer, assetLocalId } : layer));
    if (selectedLayer.showOriginal) {
      void alignImageLayerToSourceBounds(selectedLayer.id, assetLocalId);
    }
  };

  const setBackgroundImage = (assetLocalId: string | null) => {
    updateBoard((prev) => ({
      ...prev,
      backgroundImageAssetLocalId: assetLocalId,
      backgroundImageX: assetLocalId && !prev.backgroundImageAssetLocalId ? 0 : prev.backgroundImageX,
      backgroundImageY: assetLocalId && !prev.backgroundImageAssetLocalId ? 0 : prev.backgroundImageY,
      backgroundImageW: assetLocalId && !prev.backgroundImageAssetLocalId ? prev.canvasWidth : prev.backgroundImageW,
      backgroundImageH: assetLocalId && !prev.backgroundImageAssetLocalId ? prev.canvasHeight : prev.backgroundImageH,
      selectedBackground: assetLocalId ? prev.selectedBackground : false,
    }));
  };

  const openBoardImagePreview = (url?: string) => {
    const cleaned = String(url || '').trim();
    if (!cleaned) return;
    setPreviewImageUrl(cleaned);
  };

  const handleLocalAssetUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length < 1) return;

    const nextAssets = files.map((file, index) => ({
      localId: `local-upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      requestId: file.name,
      imageUrl: URL.createObjectURL(file),
      layout: null,
    }));

    setLocalAssets((prev) => [...nextAssets, ...prev]);
    event.target.value = '';
  };

  const moveSelectedLayer = (direction: 'forward' | 'backward' | 'front' | 'back') => {
    if (!board.selectedLayerId) return;

    updateBoard((prev) => {
      const index = prev.layers.findIndex((layer) => layer.id === prev.selectedLayerId);
      if (index < 0) return prev;

      const nextLayers = [...prev.layers];
      const [layer] = nextLayers.splice(index, 1);

      if (direction === 'front') nextLayers.push(layer);
      else if (direction === 'back') nextLayers.unshift(layer);
      else if (direction === 'forward') nextLayers.splice(Math.min(index + 1, nextLayers.length), 0, layer);
      else nextLayers.splice(Math.max(index - 1, 0), 0, layer);

      return { ...prev, layers: nextLayers };
    });
  };

  const applyTemplate = (templateId: string) => {
    const template = TEMPLATE_DEFINITIONS.find((item) => item.id === templateId);
    if (template) setTemplateMode(template.imageCount);
    setBoard((prev) => buildBoardFromTemplate(templateId, prev));
  };

  const toBoardPoint = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * board.canvasWidth,
      y: ((clientY - rect.top) / rect.height) * board.canvasHeight,
      scaleX: rect.width / board.canvasWidth,
      scaleY: rect.height / board.canvasHeight,
    };
  };

  const startPointerAction = (
    target: { type: 'layer'; layer: BoardLayer } | { type: 'background' },
    event: React.PointerEvent<HTMLDivElement>,
    mode: PointerAction['mode']
  ) => {
    event.stopPropagation();
    const initialFrame =
      target.type === 'background'
        ? backgroundBounds
        : {
            x: target.layer.x,
            y: target.layer.y,
            w: target.layer.w,
            h: target.layer.h,
          };

    if (target.type === 'background') selectBackground();
    else selectLayer(target.layer.id);

    const point = toBoardPoint(event.clientX, event.clientY);
    if (!point) return;

    pointerActionRef.current =
      mode === 'drag'
        ? {
            mode,
            targetType: target.type,
            layerId: target.type === 'layer' ? target.layer.id : undefined,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: initialFrame.x,
            startY: initialFrame.y,
          }
        : {
            mode,
            targetType: target.type,
            layerId: target.type === 'layer' ? target.layer.id : undefined,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startW: initialFrame.w,
            startH: initialFrame.h,
            startX: initialFrame.x,
            startY: initialFrame.y,
          };

    const onMove = (moveEvent: PointerEvent) => {
      const action = pointerActionRef.current;
      if (!action) return;
      const currentPoint = toBoardPoint(moveEvent.clientX, moveEvent.clientY);
      if (!currentPoint) return;
      const dx = (moveEvent.clientX - action.startClientX) / currentPoint.scaleX;
      const dy = (moveEvent.clientY - action.startClientY) / currentPoint.scaleY;

      setBoard((prev) => {
        if (action.targetType === 'background') {
          const minWidth = 120;
          const minHeight = 120;

          if (action.mode === 'drag') {
            return {
              ...prev,
              backgroundImageX: clampFramePosition(action.startX + dx, prev.canvasWidth, prev.backgroundImageW),
              backgroundImageY: clampFramePosition(action.startY + dy, prev.canvasHeight, prev.backgroundImageH),
            };
          }

          const nextW = clamp(action.startW + dx, minWidth, 3200);
          const nextH = clamp(action.startH + dy, minHeight, 3200);

          return {
            ...prev,
            backgroundImageW: nextW,
            backgroundImageH: nextH,
            backgroundImageX: clampFramePosition(action.startX, prev.canvasWidth, nextW),
            backgroundImageY: clampFramePosition(action.startY, prev.canvasHeight, nextH),
          };
        }

        const nextLayers = prev.layers.map((currentLayer) => {
          if (currentLayer.id !== action.layerId) return currentLayer;
          const minWidth = currentLayer.type === 'text' ? 160 : 140;
          const minHeight = currentLayer.type === 'text' ? 72 : 140;

          if (action.mode === 'drag') {
            return {
              ...currentLayer,
              x: clamp(action.startX + dx, 0, Math.max(prev.canvasWidth - currentLayer.w, 0)),
              y: clamp(action.startY + dy, 0, Math.max(prev.canvasHeight - currentLayer.h, 0)),
            };
          }

          if (currentLayer.type === 'image' && currentLayer.keepAspectRatio) {
            const aspectRatio = Math.max(action.startW / Math.max(action.startH, 1), 0.1);
            let nextWidth = action.startW + dx;
            let nextHeight = action.startH + dy;

            if (Math.abs(dx) >= Math.abs(dy)) {
              nextWidth = clamp(nextWidth, minWidth, prev.canvasWidth - action.startX);
              nextHeight = nextWidth / aspectRatio;
            } else {
              nextHeight = clamp(nextHeight, minHeight, prev.canvasHeight - action.startY);
              nextWidth = nextHeight * aspectRatio;
            }

            if (action.startX + nextWidth > prev.canvasWidth) {
              nextWidth = prev.canvasWidth - action.startX;
              nextHeight = nextWidth / aspectRatio;
            }
            if (action.startY + nextHeight > prev.canvasHeight) {
              nextHeight = prev.canvasHeight - action.startY;
              nextWidth = nextHeight * aspectRatio;
            }

            return {
              ...currentLayer,
              w: clamp(nextWidth, minWidth, prev.canvasWidth - action.startX),
              h: clamp(nextHeight, minHeight, prev.canvasHeight - action.startY),
            };
          }

          return {
            ...currentLayer,
            w: clamp(action.startW + dx, minWidth, prev.canvasWidth - action.startX),
            h: clamp(action.startH + dy, minHeight, prev.canvasHeight - action.startY),
          };
        });

        return { ...prev, layers: nextLayers };
      });
    };

    const onUp = () => {
      pointerActionRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleLayerPointerDown = (layer: BoardLayer, event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (board.selectedLayerId !== layer.id) {
      selectLayer(layer.id);
      return;
    }
    startPointerAction({ type: 'layer', layer }, event, 'drag');
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!isBackgroundSelected) {
      selectBackground();
      return;
    }
    startPointerAction({ type: 'background' }, event, 'drag');
  };

  const handleAssetDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const assetLocalId = event.dataTransfer.getData('text/vflow-gallery-asset');
    if (!assetLocalId || !assetMap.has(assetLocalId)) return;
    const point = toBoardPoint(event.clientX, event.clientY);
    if (!point) return;
    addImageLayer(assetLocalId, point.x - 160, point.y - 160);
  };

  const exportBoardAsPng = async () => {
    setIsExporting(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = board.canvasWidth;
      canvas.height = board.canvasHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error(tr('导出失败', 'Export failed'));

      context.fillStyle = board.background || '#111111';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const imageCache = new Map<string, HTMLImageElement>();
      if (backgroundImageUrl && !imageCache.has(backgroundImageUrl)) {
        imageCache.set(backgroundImageUrl, await loadImageFromUrl(backgroundImageUrl));
      }
      for (const layer of board.layers) {
        if (layer.type === 'image') {
          const asset = layer.assetLocalId ? assetMap.get(layer.assetLocalId) : undefined;
          const url = String(asset?.imageUrl || '').trim();
          if (url && !imageCache.has(url)) {
            imageCache.set(url, await loadImageFromUrl(url));
          }
        }
      }

      if (backgroundImageUrl) {
        const image = imageCache.get(backgroundImageUrl);
        if (image) {
          context.save();
          context.globalAlpha = clamp(board.backgroundImageOpacity, 0, 1);
          const rect = fitImageRect(
            board.backgroundImageFit,
            image.naturalWidth || image.width,
            image.naturalHeight || image.height,
            board.backgroundImageW,
            board.backgroundImageH
          );
          context.drawImage(
            image,
            rect.sx,
            rect.sy,
            rect.sw,
            rect.sh,
            board.backgroundImageX + rect.dx,
            board.backgroundImageY + rect.dy,
            rect.dw,
            rect.dh
          );
          context.restore();
        }
      }

      for (const layer of board.layers) {
        if (layer.type === 'image') {
          context.save();
          context.globalAlpha = clamp(layer.opacity, 0, 1);
          context.beginPath();
          context.roundRect(layer.x, layer.y, layer.w, layer.h, layer.radius);
          context.clip();

          const asset = layer.assetLocalId ? assetMap.get(layer.assetLocalId) : undefined;
          const url = String(asset?.imageUrl || '').trim();
          const image = url ? imageCache.get(url) : undefined;

          if (image) {
            const sourceWidth = image.naturalWidth || image.width;
            const sourceHeight = image.naturalHeight || image.height;
            const rect = getLayerImageDrawRect(layer, sourceWidth, sourceHeight);
            context.drawImage(
              image,
              0,
              0,
              sourceWidth,
              sourceHeight,
              layer.x + rect.dx,
              layer.y + rect.dy,
              rect.dw,
              rect.dh
            );
          }

          context.restore();
          continue;
        }

        context.save();
        if (layer.background && layer.background !== 'transparent') {
          context.fillStyle = layer.background;
          context.fillRect(layer.x, layer.y, layer.w, layer.h);
        }
        context.fillStyle = layer.color;
        context.textBaseline = 'top';
        context.textAlign = layer.align;
        context.font = `${layer.fontWeight} ${Math.max(12, Math.round(layer.fontSize))}px ${layer.fontFamily || 'system-ui'}`;

        const padding = clamp(layer.padding, 0, 80);
        const textX =
          layer.align === 'center'
            ? layer.x + layer.w / 2
            : layer.align === 'right'
              ? layer.x + layer.w - padding
              : layer.x + padding;
        const maxTextWidth = Math.max(layer.w - padding * 2, 20);
        const lineHeight = Math.max(layer.fontSize * layer.lineHeight, layer.fontSize);
        const lines = wrapTextLines(context, layer.text, maxTextWidth);
        let offsetY = layer.y + padding;

        for (const line of lines) {
          if (offsetY + lineHeight > layer.y + layer.h) break;
          context.fillText(line, textX, offsetY, maxTextWidth);
          offsetY += lineHeight;
        }
        context.restore();
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(tr('导出失败', 'Export failed'));

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `product_gallery_board_${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      const message = String(error?.message || error || tr('导出失败', 'Export failed'));
      onAlert?.(message);
    } finally {
      setIsExporting(false);
    }
  };

  const updateSelectedTextLayer = (patch: Partial<BoardTextLayer>) => {
    if (!selectedLayer || selectedLayer.type !== 'text') return;
    updateLayer(selectedLayer.id, (layer) =>
      layer.type === 'text'
        ? {
            ...layer,
            ...patch,
            w: clamp(patch.w ?? layer.w, 120, board.canvasWidth - layer.x),
            h: clamp(patch.h ?? layer.h, 60, board.canvasHeight - layer.y),
            x: clamp(patch.x ?? layer.x, 0, Math.max(board.canvasWidth - (patch.w ?? layer.w), 0)),
            y: clamp(patch.y ?? layer.y, 0, Math.max(board.canvasHeight - (patch.h ?? layer.h), 0)),
            fontSize: clamp(patch.fontSize ?? layer.fontSize, 12, 160),
            fontWeight: clamp(patch.fontWeight ?? layer.fontWeight, 300, 900),
            lineHeight: clamp(patch.lineHeight ?? layer.lineHeight, 1, 2),
            padding: clamp(patch.padding ?? layer.padding, 0, 80),
          }
        : layer
    );
  };

  const updateSelectedImageLayer = (patch: Partial<BoardImageLayer>) => {
    if (!selectedLayer || selectedLayer.type !== 'image') return;
    updateLayer(selectedLayer.id, (layer) =>
      layer.type === 'image'
        ? (() => {
            const aspectRatio = Math.max(layer.w / Math.max(layer.h, 1), 0.1);
            let nextW = patch.w ?? layer.w;
            let nextH = patch.h ?? layer.h;

            if ((patch.keepAspectRatio ?? layer.keepAspectRatio) && patch.w !== undefined && patch.h === undefined) {
              nextH = nextW / aspectRatio;
            } else if ((patch.keepAspectRatio ?? layer.keepAspectRatio) && patch.h !== undefined && patch.w === undefined) {
              nextW = nextH * aspectRatio;
            }

            nextW = clamp(nextW, 120, board.canvasWidth - (patch.x ?? layer.x));
            nextH = clamp(nextH, 120, board.canvasHeight - (patch.y ?? layer.y));

            return {
              ...layer,
              ...patch,
              w: nextW,
              h: nextH,
              x: clamp(patch.x ?? layer.x, 0, Math.max(board.canvasWidth - nextW, 0)),
              y: clamp(patch.y ?? layer.y, 0, Math.max(board.canvasHeight - nextH, 0)),
              radius: clamp(patch.radius ?? layer.radius, 0, 160),
              opacity: clamp(patch.opacity ?? layer.opacity, 0, 1),
              cropScale: clamp(patch.cropScale ?? layer.cropScale ?? 1, 1, 6),
              cropOffsetX: clamp(patch.cropOffsetX ?? layer.cropOffsetX ?? 0, -1, 1),
              cropOffsetY: clamp(patch.cropOffsetY ?? layer.cropOffsetY ?? 0, -1, 1),
            };
          })()
        : layer
    );
  };

  const handleSelectedImageAssetChange = (assetLocalId: string | null) => {
    if (!selectedLayer || selectedLayer.type !== 'image') return;
    updateSelectedImageLayer({ assetLocalId });
    if (selectedLayer.showOriginal && assetLocalId) {
      void alignImageLayerToSourceBounds(selectedLayer.id, assetLocalId);
    }
  };

  const handleSelectedImageShowOriginalChange = (checked: boolean) => {
    if (!selectedLayer || selectedLayer.type !== 'image') return;
    updateSelectedImageLayer({
      showOriginal: checked,
      keepAspectRatio: checked ? true : selectedLayer.keepAspectRatio,
    });
    if (checked) {
      void alignImageLayerToSourceBounds(selectedLayer.id);
    }
  };

  const resetSelectedImageCrop = () => {
    if (!selectedLayer || selectedLayer.type !== 'image') return;
    updateSelectedImageLayer({
      cropScale: 1,
      cropOffsetX: 0,
      cropOffsetY: 0,
    });
  };

  const updateSelectedBackground = (
    patch: Partial<Pick<BoardState, 'backgroundImageX' | 'backgroundImageY' | 'backgroundImageW' | 'backgroundImageH' | 'backgroundImageFit' | 'backgroundImageOpacity'>>
  ) => {
    if (!backgroundImageUrl) return;

    updateBoard((prev) => {
      const nextW = clamp(patch.backgroundImageW ?? prev.backgroundImageW, 120, 3200);
      const nextH = clamp(patch.backgroundImageH ?? prev.backgroundImageH, 120, 3200);

      return {
        ...prev,
        backgroundImageW: nextW,
        backgroundImageH: nextH,
        backgroundImageX: clampFramePosition(
          patch.backgroundImageX ?? prev.backgroundImageX,
          prev.canvasWidth,
          nextW
        ),
        backgroundImageY: clampFramePosition(
          patch.backgroundImageY ?? prev.backgroundImageY,
          prev.canvasHeight,
          nextH
        ),
        backgroundImageFit: patch.backgroundImageFit ?? prev.backgroundImageFit,
        backgroundImageOpacity: clamp(patch.backgroundImageOpacity ?? prev.backgroundImageOpacity, 0, 1),
      };
    });
  };

  const commitSelectedTextFontSize = (rawValue: string) => {
    if (!selectedLayer || selectedLayer.type !== 'text') return;
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) {
      const fallback = String(Math.round(selectedLayer.fontSize));
      setTextFontSizeDraft(fallback);
      return;
    }

    const nextFontSize = Number(trimmed);
    if (!Number.isFinite(nextFontSize)) {
      setTextFontSizeDraft(String(Math.round(selectedLayer.fontSize)));
      return;
    }

    updateSelectedTextLayer({ fontSize: nextFontSize });
    setTextFontSizeDraft(String(Math.round(clamp(nextFontSize, 12, 160))));
  };

  return (
    <>
      <div className="grid min-h-[72vh] grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_360px]">
      <aside className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => toggleLeftPanelSection('templates')}
              className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {tr('拼图模板', 'Templates')}
                </div>
                <div className="mt-1 text-[11px] text-zinc-400">
                  {tr('点击模板后，会把当前素材自动铺到画板。', 'Templates will seed the board with current assets.')}
                </div>
              </div>
              <ChevronDown
                className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition ${leftPanelSections.templates ? 'rotate-180' : ''}`}
              />
            </button>

            {leftPanelSections.templates ? (
              <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-3">
                <div className="grid grid-cols-4 gap-2">
                  {TEMPLATE_MODE_OPTIONS.map((mode) => {
                    const active = templateMode === mode;
                    const label = TEMPLATE_MODE_LABELS[mode];
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTemplateMode(mode)}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                          active
                            ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                            : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {tr(label.zh, label.en)}
                      </button>
                    );
                  })}
                </div>

                {filteredTemplates.map((template) => {
                  const active = board.templateId === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => applyTemplate(template.id)}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        active
                          ? 'border-orange-500 bg-orange-500/10 text-orange-200'
                          : 'border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold">{template.name}</div>
                          <div className="mt-1 text-[11px] leading-5 text-zinc-400">{template.description}</div>
                        </div>
                        <div className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-zinc-400">
                          {template.canvasWidth}:{template.canvasHeight}
                        </div>
                      </div>
                      <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/70 p-1.5">
                        <div
                          className="relative mx-auto w-full rounded-md border border-white/5 bg-white/5"
                          style={{ aspectRatio: `${template.canvasWidth} / ${template.canvasHeight}` }}
                        >
                          {template.slots.map((slot, index) => (
                            <div
                              key={`${template.id}-${index}`}
                              className="absolute rounded-sm border border-white/30 bg-white/10"
                              style={{
                                left: `${(slot.x / template.canvasWidth) * 100}%`,
                                top: `${(slot.y / template.canvasHeight) * 100}%`,
                                width: `${(slot.w / template.canvasWidth) * 100}%`,
                                height: `${(slot.h / template.canvasHeight) * 100}%`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {filteredTemplates.length < 1 ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-xs text-zinc-500">
                    {tr('该模式下暂无模板。', 'No templates in this mode yet.')}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => toggleLeftPanelSection('aiLayouts')}
              className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {tr('AI排版方案', 'AI Layouts')}
                </div>
                <div className="mt-1 text-[11px] text-zinc-400">
                  {tr('先在右侧勾选素材，再生成多套可编辑排版。', 'Select assets on the right, then generate editable layout ideas.')}
                </div>
              </div>
              <ChevronDown
                className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition ${leftPanelSections.aiLayouts ? 'rotate-180' : ''}`}
              />
            </button>

            {leftPanelSections.aiLayouts ? (
              <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-3">
                {isGeneratingAiLayouts ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-sm text-zinc-400">
                    {tr('正在生成 AI 排版方案...', 'Generating AI layout proposals...')}
                  </div>
                ) : aiLayoutProposals.length > 0 ? (
                  aiLayoutProposals.map((proposal, index) => (
                    <div key={proposal.id || index} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-zinc-100">{proposal.name || `${tr('方案', 'Plan')} ${index + 1}`}</div>
                          <div className="mt-1 text-[10px] text-zinc-500">
                            {proposal.canvas?.aspect_ratio} · {proposal.canvas?.width} x {proposal.canvas?.height}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyAiLayoutProposal(proposal)}
                          className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold text-orange-200 transition hover:bg-orange-500/15"
                        >
                          {tr('应用', 'Apply')}
                        </button>
                      </div>
                      {proposal.reason ? (
                        <div className="mt-2 text-[11px] leading-5 text-zinc-400">{proposal.reason}</div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-sm text-zinc-500">
                    {tr('还没有生成方案。勾选素材后点击上方“生成AI排版”。', 'No proposals yet. Select assets and click Generate AI Layouts.')}
                  </div>
                )}

                {aiLayoutMessage ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-5 text-zinc-500">
                    {aiLayoutFallbackUsed ? tr('当前显示的是稳定回退方案：', 'Showing fallback proposals: ') : ''}
                    {aiLayoutMessage}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
              {tr('自由画板', 'Board')}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              {tr('先点选对象，再拖动或缩放；属性在右侧顶部修改。', 'Select a layer first, then drag or resize it. Edit its properties on the right.')}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateAiLayouts}
              disabled={isGeneratingAiLayouts || selectedAssets.length < 1}
              className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-200 transition hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGeneratingAiLayouts ? tr('生成中...', 'Generating...') : tr('生成AI排版', 'Generate AI Layouts')}
            </button>
            <button
              type="button"
              onClick={addTextLayer}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
            >
              <Type className="h-4 w-4" />
              {tr('新增文字', 'Add Text')}
            </button>
            <button
              type="button"
              onClick={() => setZoom((prev) => clamp(prev - 0.15, 0.6, 2))}
              className="rounded-xl border border-white/10 bg-zinc-900/70 p-2 text-zinc-200 transition hover:bg-zinc-800"
              aria-label={tr('缩小画板', 'Zoom out')}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <div className="min-w-[64px] text-center text-xs text-zinc-400">{Math.round(boardScale * 100)}%</div>
            <button
              type="button"
              onClick={() => setZoom((prev) => clamp(prev + 0.15, 0.6, 2))}
              className="rounded-xl border border-white/10 bg-zinc-900/70 p-2 text-zinc-200 transition hover:bg-zinc-800"
              aria-label={tr('放大画板', 'Zoom in')}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={exportBoardAsPng}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-black transition hover:bg-orange-400 disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {isExporting ? tr('导出中...', 'Exporting...') : tr('导出 PNG', 'Export PNG')}
            </button>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
              >
                {tr('关闭', 'Close')}
              </button>
            ) : null}
          </div>
        </div>

        <div
          ref={viewportRef}
          className="min-h-0 flex-1 overflow-auto rounded-2xl border border-dashed border-white/10 bg-zinc-950/60 p-4"
        >
          <div className="flex min-h-full min-w-full items-start justify-center">
            <div
              ref={boardRef}
              className="relative shrink-0 overflow-hidden border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
              style={{
                width: board.canvasWidth * boardScale,
                height: board.canvasHeight * boardScale,
                background: board.background || '#111111',
              }}
              onClick={clearSelection}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleAssetDrop}
            >
              {backgroundImageUrl ? (
                <div
                  className={`absolute ${isBackgroundSelected ? 'cursor-move' : 'cursor-pointer'}`}
                  style={{
                    left: backgroundBounds.x * boardScale,
                    top: backgroundBounds.y * boardScale,
                    width: backgroundBounds.w * boardScale,
                    height: backgroundBounds.h * boardScale,
                    opacity: board.backgroundImageOpacity,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectBackground();
                  }}
                  onPointerDown={handleBackgroundPointerDown}
                >
                  <img
                    src={backgroundImageUrl}
                    alt={tr('画板背景图', 'Board Background')}
                    className={`h-full w-full ${board.backgroundImageFit === 'contain' ? 'object-contain' : 'object-cover'}`}
                    draggable={false}
                  />
                </div>
              ) : null}
              {backgroundImageUrl && isBackgroundSelected ? (
                <div
                  className="pointer-events-none absolute border border-orange-400 ring-1 ring-orange-400/80"
                  style={{
                    left: backgroundBounds.x * boardScale,
                    top: backgroundBounds.y * boardScale,
                    width: backgroundBounds.w * boardScale,
                    height: backgroundBounds.h * boardScale,
                  }}
                >
                  <div
                    className="pointer-events-auto absolute bottom-[-4px] right-[-4px] h-2.5 w-2.5 cursor-se-resize rounded-full border border-black/40 bg-orange-400 shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
                    onPointerDown={(event) => startPointerAction({ type: 'background' }, event, 'resize')}
                  />
                </div>
              ) : null}
              {board.layers.map((layer) => {
                const isSelected = layer.id === board.selectedLayerId;
                const asset = layer.type === 'image' && layer.assetLocalId ? assetMap.get(layer.assetLocalId) : undefined;
                const imageUrl = layer.type === 'image' ? String(asset?.imageUrl || '').trim() : '';
                const imageRect =
                  layer.type === 'image' && imageUrl
                    ? (() => {
                        const size = assetImageSizeCacheRef.current.get(imageUrl);
                        if (!size) return null;
                        return getLayerImageDrawRect(layer, size.width, size.height);
                      })()
                    : null;

                return (
                  <div
                    key={layer.id}
                    className={`absolute ${isSelected ? 'cursor-move ring-2 ring-orange-400/90 ring-offset-2 ring-offset-black/20' : 'cursor-pointer'}`}
                    style={{
                      left: layer.x * boardScale,
                      top: layer.y * boardScale,
                      width: layer.w * boardScale,
                      height: layer.h * boardScale,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectLayer(layer.id);
                    }}
                    onPointerDown={(event) => handleLayerPointerDown(layer, event)}
                  >
                    {layer.type === 'image' ? (
                      <div
                        className={`relative h-full w-full overflow-hidden bg-transparent ${isSelected ? 'border border-white/40' : 'border border-transparent'}`}
                        style={{ borderRadius: layer.radius * boardScale, opacity: layer.opacity }}
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={layer.name}
                            draggable={false}
                            onLoad={(event) => rememberAssetImageSize(imageUrl, event.currentTarget)}
                            className={
                              imageRect
                                ? 'pointer-events-none absolute max-w-none select-none'
                                : `h-full w-full ${(layer.showOriginal || layer.fit === 'contain') ? 'object-contain' : 'object-cover'}`
                            }
                            style={
                              imageRect
                                ? {
                                    left: imageRect.dx * boardScale,
                                    top: imageRect.dy * boardScale,
                                    width: imageRect.dw * boardScale,
                                    height: imageRect.dh * boardScale,
                                  }
                                : {
                                    transform: `translate(${(clamp(layer.cropOffsetX ?? 0, -1, 1) * 50).toFixed(2)}%, ${(clamp(layer.cropOffsetY ?? 0, -1, 1) * 50).toFixed(2)}%) scale(${clamp(layer.cropScale ?? 1, 1, 6)})`,
                                    transformOrigin: 'center center',
                                  }
                            }
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-white/5 px-4 text-center text-xs text-zinc-500">
                            {tr('从右侧拖入素材，或选中图片图层后执行替换。', 'Drag an asset here or replace the selected image layer from the asset panel.')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className={`flex h-full w-full overflow-hidden whitespace-pre-wrap break-words ${isSelected ? 'border border-white/40' : 'border border-transparent'}`}
                        style={{
                          borderRadius: 16 * boardScale,
                          background: layer.background || 'transparent',
                          color: layer.color,
                          fontSize: layer.fontSize * boardScale,
                          fontWeight: layer.fontWeight,
                          fontFamily: layer.fontFamily,
                          lineHeight: layer.lineHeight,
                          textAlign: layer.align,
                          padding: layer.padding * boardScale,
                        }}
                      >
                        {layer.text}
                      </div>
                    )}

                    {isSelected ? (
                      <div
                        className="absolute bottom-[-4px] right-[-4px] h-2.5 w-2.5 cursor-se-resize rounded-full border border-black/40 bg-orange-400 shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
                        onPointerDown={(event) => startPointerAction({ type: 'layer', layer }, event, 'resize')}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => toggleRightPanelSection('board')}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {tr('画板设置', 'Board Settings')}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {tr('支持修改画板比例、尺寸和背景底图。', 'Change canvas ratio, size, and background image here.')}
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition ${rightPanelSections.board ? 'rotate-180' : ''}`}
              />
            </button>

            {rightPanelSections.board ? (
              <div className="border-t border-white/10 px-4 pb-4 pt-4 space-y-3">
            <label className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                {tr('预设比例', 'Canvas Ratio')}
              </div>
              <select
                value={currentCanvasPresetId}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value !== 'custom') setCanvasPreset(value);
                }}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
              >
                {CANVAS_SIZE_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} ({item.width} x {item.height})
                  </option>
                ))}
                <option value="custom">{tr('自定义尺寸', 'Custom')}</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {tr('画板宽度', 'Canvas Width')}
                </div>
                <input
                  type="number"
                  min="600"
                  max="2400"
                  value={Math.round(board.canvasWidth)}
                  onChange={(event) => resizeCanvas(Number(event.target.value) || board.canvasWidth, board.canvasHeight)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                />
              </label>
              <label className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {tr('画板高度', 'Canvas Height')}
                </div>
                <input
                  type="number"
                  min="600"
                  max="2400"
                  value={Math.round(board.canvasHeight)}
                  onChange={(event) => resizeCanvas(board.canvasWidth, Number(event.target.value) || board.canvasHeight)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                />
              </label>
            </div>

            <ColorField
              label={tr('画板底色', 'Board Color')}
              value={board.background}
              fallback="#111111"
              tr={tr}
              onChange={(next) => setBoard((prev) => ({ ...prev, background: next }))}
            />

            <label className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                {tr('背景底图', 'Background Asset')}
              </div>
              <select
                value={board.backgroundImageAssetLocalId || ''}
                onChange={(event) => setBackgroundImage(event.target.value || null)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
              >
                <option value="">{tr('不使用底图', 'No Background Image')}</option>
                {mergedAssets
                  .filter((item) => Boolean(String(item.imageUrl || '').trim()))
                  .map((asset, index) => (
                    <option key={asset.localId} value={asset.localId}>
                      {tr('图片', 'Image')} {index + 1}
                    </option>
                  ))}
              </select>
            </label>

            {backgroundImageUrl ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={selectBackground}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      isBackgroundSelected
                        ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                        : 'border-white/10 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {tr('选中底图', 'Select Background')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedBackground({
                        backgroundImageX: 0,
                        backgroundImageY: 0,
                        backgroundImageW: board.canvasWidth,
                        backgroundImageH: board.canvasHeight,
                      })
                    }
                    className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    {tr('重置铺满', 'Reset Fill')}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {tr('底图适配', 'Background Fit')}
                    </div>
                    <select
                      value={board.backgroundImageFit}
                      onChange={(event) =>
                        setBoard((prev) => ({
                          ...prev,
                          backgroundImageFit: event.target.value as BoardState['backgroundImageFit'],
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    >
                      <option value="cover">{tr('铺满裁切', 'Cover')}</option>
                      <option value="contain">{tr('完整显示', 'Contain')}</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {tr('底图透明度', 'Background Opacity')}
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={board.backgroundImageOpacity}
                      onChange={(event) =>
                        setBoard((prev) => ({
                          ...prev,
                          backgroundImageOpacity: clamp(Number(event.target.value) || 0, 0, 1),
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    />
                  </label>
                </div>

                <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  <img src={backgroundImageUrl} alt={tr('背景预览', 'Background Preview')} className="h-24 w-full object-cover" />
                </div>
              </>
            ) : null}
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => toggleRightPanelSection('inspector')}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {tr('选中对象属性', 'Selected Object')}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {tr('先在画板上选中对象，再在这里编辑位置、颜色、字体和大小。', 'Select a layer on the board first, then edit its position, color, font, and size here.')}
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition ${rightPanelSections.inspector ? 'rotate-180' : ''}`}
              />
            </button>

            {rightPanelSections.inspector ? (
              <div className="border-t border-white/10 px-4 pb-4 pt-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
                    {tr('属性面板', 'Inspector')}
                  </div>
                  {selectedLayer ? (
                    <button
                      type="button"
                      onClick={removeSelectedLayer}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-200 transition hover:bg-red-500/15"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {tr('删除', 'Delete')}
                    </button>
                  ) : null}
                </div>

                {isBackgroundSelected ? (
                  <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                {tr('背景底图', 'Background Image')}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">X</div>
                  <input
                    type="number"
                    value={Math.round(board.backgroundImageX)}
                    onChange={(event) => updateSelectedBackground({ backgroundImageX: Number(event.target.value) || 0 })}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Y</div>
                  <input
                    type="number"
                    value={Math.round(board.backgroundImageY)}
                    onChange={(event) => updateSelectedBackground({ backgroundImageY: Number(event.target.value) || 0 })}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">W</div>
                  <input
                    type="number"
                    value={Math.round(board.backgroundImageW)}
                    onChange={(event) => updateSelectedBackground({ backgroundImageW: Number(event.target.value) || 0 })}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">H</div>
                  <input
                    type="number"
                    value={Math.round(board.backgroundImageH)}
                    onChange={(event) => updateSelectedBackground({ backgroundImageH: Number(event.target.value) || 0 })}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  />
                </label>
              </div>

              <label className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {tr('底图适配', 'Background Fit')}
                </div>
                <select
                  value={board.backgroundImageFit}
                  onChange={(event) =>
                    updateSelectedBackground({
                      backgroundImageFit: event.target.value as BoardState['backgroundImageFit'],
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                >
                  <option value="cover">{tr('铺满裁切', 'Cover')}</option>
                  <option value="contain">{tr('完整显示', 'Contain')}</option>
                </select>
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {tr('底图透明度', 'Background Opacity')}
                </div>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={board.backgroundImageOpacity}
                  onChange={(event) =>
                    updateSelectedBackground({ backgroundImageOpacity: Number(event.target.value) || 0 })
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                />
              </label>
                  </div>
                ) : selectedLayer ? (
                  <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                {selectedLayer.name} · {selectedLayer.type === 'image' ? tr('图片图层', 'Image Layer') : tr('文字图层', 'Text Layer')}
              </div>

              <label className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {tr('图层名称', 'Layer Name')}
                </div>
                <input
                  type="text"
                  value={selectedLayer.name}
                  onChange={(event) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, name: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">X</div>
                  <input
                    type="number"
                    value={Math.round(selectedLayer.x)}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 0;
                      if (selectedLayer.type === 'image') updateSelectedImageLayer({ x: value });
                      else updateSelectedTextLayer({ x: value });
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Y</div>
                  <input
                    type="number"
                    value={Math.round(selectedLayer.y)}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 0;
                      if (selectedLayer.type === 'image') updateSelectedImageLayer({ y: value });
                      else updateSelectedTextLayer({ y: value });
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">W</div>
                  <input
                    type="number"
                    value={Math.round(selectedLayer.w)}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 0;
                      if (selectedLayer.type === 'image') updateSelectedImageLayer({ w: value });
                      else updateSelectedTextLayer({ w: value });
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">H</div>
                  <input
                    type="number"
                    value={Math.round(selectedLayer.h)}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 0;
                      if (selectedLayer.type === 'image') updateSelectedImageLayer({ h: value });
                      else updateSelectedTextLayer({ h: value });
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  />
                </label>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {tr('图层顺序', 'Layer Order')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => moveSelectedLayer('back')}
                    className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    {tr('置于底层', 'Send to Back')}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedLayer('backward')}
                    className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    {tr('下移一层', 'Send Backward')}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedLayer('forward')}
                    className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    {tr('上移一层', 'Bring Forward')}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedLayer('front')}
                    className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    {tr('置于顶层', 'Bring to Front')}
                  </button>
                </div>
              </div>

              {selectedLayer.type === 'image' ? (
                <>
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {tr('图片来源', 'Image Source')}
                    </div>
                    <select
                      value={selectedLayer.assetLocalId || ''}
                      onChange={(event) => handleSelectedImageAssetChange(event.target.value || null)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    >
                      <option value="">{tr('未绑定图片', 'No Image')}</option>
                      {mergedAssets
                        .filter((item) => Boolean(String(item.imageUrl || '').trim()))
                        .map((asset, index) => (
                          <option key={asset.localId} value={asset.localId}>
                            {tr('图片', 'Image')} {index + 1}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {tr('裁切方式', 'Image Fit')}
                    </div>
                    <select
                      value={selectedLayer.fit}
                      onChange={(event) => updateSelectedImageLayer({ fit: event.target.value as BoardImageLayer['fit'] })}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    >
                      <option value="cover">{tr('铺满裁切', 'Cover')}</option>
                      <option value="contain">{tr('完整显示', 'Contain')}</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
                      <input
                        type="checkbox"
                        checked={selectedLayer.showOriginal}
                        onChange={(event) => handleSelectedImageShowOriginalChange(event.target.checked)}
                        className="accent-orange-500"
                      />
                      <span>{tr('显示原图', 'Show Original')}</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
                      <input
                        type="checkbox"
                        checked={selectedLayer.keepAspectRatio}
                        onChange={(event) => updateSelectedImageLayer({ keepAspectRatio: event.target.checked })}
                        className="accent-orange-500"
                      />
                      <span>{tr('等比例缩放', 'Keep Aspect Ratio')}</span>
                    </label>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {tr('图片裁剪', 'Image Crop')}
                      </div>
                      <button
                        type="button"
                        onClick={resetSelectedImageCrop}
                        className="rounded-lg border border-white/10 bg-zinc-900/70 px-2 py-1 text-[10px] font-semibold text-zinc-200 transition hover:bg-zinc-800"
                      >
                        {tr('重置裁剪', 'Reset Crop')}
                      </button>
                    </div>

                    <label className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>{tr('缩放', 'Zoom')}</span>
                        <span>{selectedLayer.cropScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="0.01"
                        value={selectedLayer.cropScale}
                        onChange={(event) => updateSelectedImageLayer({ cropScale: Number(event.target.value) || 1 })}
                        className="w-full accent-orange-400"
                      />
                    </label>

                    <label className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>{tr('水平偏移', 'Horizontal Offset')}</span>
                        <span>{Math.round(selectedLayer.cropOffsetX * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={selectedLayer.cropOffsetX}
                        onChange={(event) => updateSelectedImageLayer({ cropOffsetX: Number(event.target.value) || 0 })}
                        className="w-full accent-orange-400"
                      />
                    </label>

                    <label className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>{tr('垂直偏移', 'Vertical Offset')}</span>
                        <span>{Math.round(selectedLayer.cropOffsetY * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={selectedLayer.cropOffsetY}
                        onChange={(event) => updateSelectedImageLayer({ cropOffsetY: Number(event.target.value) || 0 })}
                        className="w-full accent-orange-400"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {tr('圆角', 'Radius')}
                      </div>
                      <input
                        type="number"
                        value={Math.round(selectedLayer.radius)}
                        onChange={(event) => updateSelectedImageLayer({ radius: Number(event.target.value) || 0 })}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {tr('透明度', 'Opacity')}
                      </div>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedLayer.opacity}
                        onChange={(event) => updateSelectedImageLayer({ opacity: Number(event.target.value) || 0 })}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {tr('文字内容', 'Text')}
                    </div>
                    <textarea
                      rows={4}
                      value={selectedLayer.text}
                      onChange={(event) => updateSelectedTextLayer({ text: event.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {tr('字体', 'Font')}
                      </div>
                      <select
                        value={selectedLayer.fontFamily}
                        onChange={(event) => updateSelectedTextLayer({ fontFamily: event.target.value })}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      >
                        {FONT_FAMILY_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {tr('字号', 'Font Size')}
                      </div>
                      <input
                        type="number"
                        value={textFontSizeDraft}
                        onChange={(event) => setTextFontSizeDraft(event.target.value)}
                        onBlur={(event) => commitSelectedTextFontSize(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          commitSelectedTextFontSize(textFontSizeDraft);
                          (event.currentTarget as HTMLInputElement).blur();
                        }}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {tr('字重', 'Weight')}
                      </div>
                      <input
                        type="number"
                        min="300"
                        max="900"
                        step="100"
                        value={Math.round(selectedLayer.fontWeight)}
                        onChange={(event) => updateSelectedTextLayer({ fontWeight: Number(event.target.value) || 400 })}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {tr('对齐', 'Align')}
                      </div>
                      <select
                        value={selectedLayer.align}
                        onChange={(event) => updateSelectedTextLayer({ align: event.target.value as BoardTextLayer['align'] })}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      >
                        <option value="left">{tr('左对齐', 'Left')}</option>
                        <option value="center">{tr('居中', 'Center')}</option>
                        <option value="right">{tr('右对齐', 'Right')}</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {tr('行高', 'Line Height')}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="2"
                        step="0.05"
                        value={selectedLayer.lineHeight}
                        onChange={(event) => updateSelectedTextLayer({ lineHeight: Number(event.target.value) || 1.2 })}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {tr('内边距', 'Padding')}
                      </div>
                      <input
                        type="number"
                        min="0"
                        max="80"
                        step="2"
                        value={Math.round(selectedLayer.padding)}
                        onChange={(event) => updateSelectedTextLayer({ padding: Number(event.target.value) || 0 })}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      />
                    </label>
                  </div>
                  <ColorField
                    label={tr('文字颜色', 'Text Color')}
                    value={selectedLayer.color}
                    fallback="#ffffff"
                    tr={tr}
                    onChange={(next) => updateSelectedTextLayer({ color: next })}
                  />
                  <ColorField
                    label={tr('背景色', 'Background')}
                    value={selectedLayer.background}
                    fallback="#000000"
                    tr={tr}
                    allowTransparent
                    onChange={(next) => updateSelectedTextLayer({ background: next })}
                  />
                </>
              )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
                    {tr('请先在画板上选中一个对象，再在这里修改位置、大小、字体、颜色等属性。', 'Select a layer on the board to edit its properties here.')}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addTextLayer}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                >
                  <Plus className="h-4 w-4" />
                  {tr('新增文字图层', 'Add Text Layer')}
                </button>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => toggleRightPanelSection('assets')}
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {tr('当前素材', 'Assets')}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {tr('支持拖入画板，也支持在这里上传本地图片；选中图片图层后可直接替换。', 'Drag assets onto the board, upload local images here, or replace the selected image layer.')}
                </div>
              </div>
              <ChevronDown
                className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition ${rightPanelSections.assets ? 'rotate-180' : ''}`}
              />
            </button>

            {rightPanelSections.assets ? (
              <div className="border-t border-white/10 px-4 pb-4 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[11px] text-zinc-500">
                    {tr('已选素材', 'Selected')} {selectedAssetLocalIds.length}
                  </div>
                  <div className="shrink-0">
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleLocalAssetUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                    >
                      {tr('上传素材', 'Upload Images')}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {mergedAssets.length > 0 ? (
                    mergedAssets.map((asset, index) => {
                      const imageUrl = String(asset.imageUrl || '').trim();
                      const canRender = Boolean(imageUrl);
                      const canReplace = canRender && selectedLayer?.type === 'image';
                      const isAssetSelected = selectedAssetLocalIds.includes(asset.localId);
                      return (
                        <div
                          key={asset.localId}
                          className={`rounded-xl border p-2.5 ${
                            isAssetSelected ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/10 bg-black/20'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2 min-w-0">
                            <div className="truncate text-[11px] font-semibold text-zinc-200">
                              {tr('图片', 'Image')} {index + 1}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleAssetSelection(asset.localId)}
                              className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${
                                isAssetSelected
                                  ? 'border-orange-500/30 bg-orange-500/10 text-orange-200'
                                  : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800'
                              }`}
                            >
                              {isAssetSelected ? tr('已选中', 'Selected') : tr('选中排版', 'Select')}
                            </button>
                          </div>

                          <div
                            draggable={canRender}
                            onClick={() => {
                              if (!canRender) return;
                              openBoardImagePreview(imageUrl);
                            }}
                            onDragStart={(event) => {
                              if (!canRender) return;
                              event.dataTransfer.setData('text/vflow-gallery-asset', asset.localId);
                            }}
                            className={`overflow-hidden rounded-lg border border-white/10 bg-zinc-950/60 ${canRender ? 'cursor-pointer active:cursor-grabbing' : ''}`}
                          >
                            {canRender ? (
                              <img src={imageUrl} alt={asset.requestId} className="h-24 w-full object-cover" />
                            ) : (
                              <div className="flex h-24 items-center justify-center text-xs text-zinc-500">
                                {tr('当前素材没有可用图片地址', 'No valid image URL')}
                              </div>
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-2">
                            <button
                              type="button"
                              disabled={!canRender}
                              onClick={() => addImageLayer(asset.localId)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-900/70 px-2.5 py-2 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40"
                            >
                              <ImagePlus className="h-3.5 w-3.5" />
                              {tr('加入画板', 'Add to Board')}
                            </button>
                            <button
                              type="button"
                              disabled={!canReplace}
                              onClick={() => replaceSelectedImage(asset.localId)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-2 text-[11px] font-semibold text-orange-200 transition hover:bg-orange-500/15 disabled:opacity-40"
                            >
                              <Replace className="h-3.5 w-3.5" />
                              {tr('替换选中', 'Replace Selected')}
                            </button>
                            <button
                              type="button"
                              disabled={!canRender}
                              onClick={() => setBackgroundImage(asset.localId)}
                              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-zinc-900/70 px-2.5 py-2 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40"
                            >
                              {tr('设为背景', 'Set as Background')}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
                      {tr('当前预览区还没有成功生成的图片素材。', 'There are no successful preview images yet.')}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
      </div>

      <AppDialog
        isOpen={Boolean(previewImageUrl)}
        title={tr('图片预览', 'Image Preview')}
        onClose={() => setPreviewImageUrl(null)}
        widthClassName="max-w-5xl"
        footer={
          <button
            type="button"
            onClick={() => setPreviewImageUrl(null)}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            {tr('关闭', 'Close')}
          </button>
        }
      >
        {previewImageUrl ? (
          <div className="w-full flex items-center justify-center">
            <div className="relative inline-block overflow-hidden rounded-xl border border-white/10">
              <img src={previewImageUrl} alt={tr('图片预览', 'Image Preview')} className="max-h-[70vh] w-auto object-contain" />
            </div>
          </div>
        ) : null}
      </AppDialog>
    </>
  );
};

export default GalleryBoardEditor;
