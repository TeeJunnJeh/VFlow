import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Folder, Loader2, Plus, Redo2, Replace, Trash2, Type, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import PptxGenJS from 'pptxgenjs';
import { AppDialog } from '../common/AppDialog';
import { assetsApi, type Asset as LibraryAsset, type AssetFolder } from '../../services/assets';
import { useLanguage } from '../../context/LanguageContext';

export type GalleryBoardAsset = {
  localId: string;
  requestId: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  source?: 'current' | 'upload' | 'library' | 'history';
  layout?: unknown;
};

export type GalleryBoardHistoryItem = {
  id: string;
  createdAt: string;
  images: string[];
  settings?: {
    typeSelections?: Record<string, { enabled?: boolean; count?: number }>;
  };
  metadata?: Record<string, unknown>;
};

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
  rotationQuarterTurns: 0 | 1 | 2 | 3;
  flipX: boolean;
  flipY: boolean;
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
  assetCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  ratioId: '3:4' | '1:1' | '4:3' | '2:3' | '3:2' | '16:9' | '9:16';
  layoutStyle: 'vertical' | 'horizontal' | 'balanced';
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
  historyItems?: GalleryBoardHistoryItem[];
  productName: string;
  sellingPoints: string[];
  initialCanvasRatio?: '3:4' | '1:1' | '4:3' | '2:3' | '3:2' | '16:9' | '9:16';
  initialTemplateId?: string;
  initialTitle?: string;
  initialSubtitle?: string;
  initialBackground?: string;
  initialLocalAssets?: GalleryBoardAsset[];
  initialDraft?: GalleryBoardDraft | null;
  onAlert?: (message: string) => void;
  onLocalAssetsChange?: (assets: GalleryBoardAsset[]) => void;
  onDraftChange?: (draft: GalleryBoardDraft) => void;
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

export type GalleryBoardDraft = {
  board: BoardState;
  selectedAssetLocalIds: string[];
  zoom: number;
  templateRatioId: TemplateDefinition['ratioId'];
  gapScale: number;
  cornerRadiusRatio: number;
};

type EditorHistorySnapshot = {
  board: BoardState;
  templateRatioId: TemplateDefinition['ratioId'];
  gapScale: number;
  cornerRadiusRatio: number;
};

type RightPanelSectionKey = 'board' | 'inspector' | 'assets';
type LeftPanelSectionKey = 'templates';
type TemplateTooltipState = {
  text: string;
  top: number;
  left: number;
};
type TemplateFilterRatio = 'all' | TemplateDefinition['ratioId'];

const FONT_FAMILY_OPTIONS = ['system-ui', 'Microsoft YaHei', 'PingFang SC', 'SimHei', 'serif'];
const EDITOR_HISTORY_LIMIT = 80;
const CANVAS_SIZE_OPTIONS = [
  { id: '1:1', label: '1:1', width: 1200, height: 1200 },
  { id: '4:5', label: '4:5', width: 1200, height: 1500 },
  { id: '3:4', label: '3:4', width: 1200, height: 1600 },
  { id: '4:3', label: '4:3', width: 1600, height: 1200 },
  { id: '2:3', label: '2:3', width: 1200, height: 1800 },
  { id: '3:2', label: '3:2', width: 1500, height: 1000 },
  { id: '9:16', label: '9:16', width: 1080, height: 1920 },
  { id: '16:9', label: '16:9', width: 1600, height: 900 },
] as const;
const TEMPLATE_RATIO_OPTIONS: Array<TemplateDefinition['ratioId']> = ['3:4', '1:1', '4:3', '2:3', '3:2', '16:9', '9:16'];
const TEMPLATE_PREVIEW_BACKGROUND = '#111827';
const LIBRARY_PICKER_TYPE_OPTIONS = [
  { value: 'product', labelKey: 'pg_board_picker_product' as const },
  { value: 'scene', labelKey: 'pg_board_picker_scene' as const },
] as const;

const getCanvasSizeByRatio = (ratioId: TemplateDefinition['ratioId']) => {
  const matched = CANVAS_SIZE_OPTIONS.find((item) => item.id === ratioId);
  return matched || CANVAS_SIZE_OPTIONS[2];
};

const createTemplateDefinition = (
  id: string,
  ratioId: TemplateDefinition['ratioId'],
  assetCount: TemplateDefinition['assetCount'],
  name: string,
  description: string,
  layoutStyle: TemplateDefinition['layoutStyle'],
  slots: TemplateSlot[]
): TemplateDefinition => {
  const canvas = getCanvasSizeByRatio(ratioId);
  return {
    id,
    ratioId,
    assetCount,
    layoutStyle,
    name,
    description,
    previewAssetPath: '',
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    background: '#111827',
    slots,
    titleBox: { x: 0, y: 0, w: 0, h: 0 },
    subtitleBox: { x: 0, y: 0, w: 0, h: 0 },
  };
};

type NormalizedTemplateSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
  fit?: 'cover' | 'contain';
};

const TEMPLATE_MARGIN = 0.06;
const TEMPLATE_GAP = 0.02;
const PORTRAIT_TEMPLATE_RATIOS: TemplateDefinition['ratioId'][] = ['3:4', '2:3', '9:16'];
const LANDSCAPE_TEMPLATE_RATIOS: TemplateDefinition['ratioId'][] = ['4:3', '3:2', '16:9'];

const createNormalizedSlot = (
  x: number,
  y: number,
  w: number,
  h: number,
  fit: 'cover' | 'contain' = 'cover'
): NormalizedTemplateSlot => ({ x, y, w, h, fit });

const createGridNormalizedSlots = (
  columns: number,
  rows: number,
  count: number,
  area: { x?: number; y?: number; w?: number; h?: number; gapX?: number; gapY?: number } = {}
): NormalizedTemplateSlot[] => {
  const {
    x = TEMPLATE_MARGIN,
    y = TEMPLATE_MARGIN,
    w = 1 - TEMPLATE_MARGIN * 2,
    h = 1 - TEMPLATE_MARGIN * 2,
    gapX = TEMPLATE_GAP,
    gapY = TEMPLATE_GAP,
  } = area;
  const cellW = (w - gapX * (columns - 1)) / columns;
  const cellH = (h - gapY * (rows - 1)) / rows;
  const slots: NormalizedTemplateSlot[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      slots.push(
        createNormalizedSlot(
          x + column * (cellW + gapX),
          y + row * (cellH + gapY),
          cellW,
          cellH
        )
      );
    }
  }

  return slots.slice(0, count);
};

const createNormalizedTemplateDefinition = (
  id: string,
  ratioId: TemplateDefinition['ratioId'],
  assetCount: TemplateDefinition['assetCount'],
  name: string,
  description: string,
  layoutStyle: TemplateDefinition['layoutStyle'],
  slots: NormalizedTemplateSlot[]
) => {
  const canvas = getCanvasSizeByRatio(ratioId);
  return createTemplateDefinition(
    id,
    ratioId,
    assetCount,
    name,
    description,
    layoutStyle,
    slots.map((slot) => ({
      ...slot,
      x: Math.round(slot.x * canvas.width),
      y: Math.round(slot.y * canvas.height),
      w: Math.round(slot.w * canvas.width),
      h: Math.round(slot.h * canvas.height),
    }))
  );
};

const isPortraitTemplateRatio = (ratioId: TemplateDefinition['ratioId']) => PORTRAIT_TEMPLATE_RATIOS.includes(ratioId);

const isLandscapeTemplateRatio = (ratioId: TemplateDefinition['ratioId']) => LANDSCAPE_TEMPLATE_RATIOS.includes(ratioId);

const createTemplatesForRatio = (ratioId: TemplateDefinition['ratioId']): TemplateDefinition[] => {
  const ratioKey = ratioId.replace(':', '');
  const portrait = isPortraitTemplateRatio(ratioId);
  const landscape = isLandscapeTemplateRatio(ratioId);
  const primaryStyle: TemplateDefinition['layoutStyle'] = portrait ? 'vertical' : landscape ? 'horizontal' : 'balanced';
  const secondaryStyle: TemplateDefinition['layoutStyle'] = portrait || landscape ? primaryStyle : 'balanced';
  const accentStyle: TemplateDefinition['layoutStyle'] = portrait ? 'horizontal' : landscape ? 'vertical' : 'balanced';

  const twoPrimarySlots = portrait
    ? [
        createNormalizedSlot(0.06, 0.06, 0.88, 0.43),
        createNormalizedSlot(0.06, 0.51, 0.88, 0.43),
      ]
    : [
        createNormalizedSlot(0.06, 0.06, 0.43, 0.88),
        createNormalizedSlot(0.51, 0.06, 0.43, 0.88),
      ];
  const twoCrossSlots = portrait
    ? [
        createNormalizedSlot(0.06, 0.06, 0.43, 0.88),
        createNormalizedSlot(0.51, 0.06, 0.43, 0.88),
      ]
    : [
        createNormalizedSlot(0.06, 0.06, 0.88, 0.43),
        createNormalizedSlot(0.06, 0.51, 0.88, 0.43),
      ];
  const twoFocusSlots = portrait
    ? [
        createNormalizedSlot(0.06, 0.06, 0.56, 0.88),
        createNormalizedSlot(0.64, 0.06, 0.30, 0.88),
      ]
    : landscape
      ? [
          createNormalizedSlot(0.06, 0.06, 0.88, 0.56),
          createNormalizedSlot(0.06, 0.64, 0.88, 0.30),
        ]
      : [
          createNormalizedSlot(0.06, 0.06, 0.54, 0.88),
          createNormalizedSlot(0.62, 0.06, 0.32, 0.88),
        ];

  const threeFeatureSlots = portrait
    ? [
        createNormalizedSlot(0.06, 0.06, 0.88, 0.44),
        createNormalizedSlot(0.06, 0.52, 0.43, 0.42),
        createNormalizedSlot(0.51, 0.52, 0.43, 0.42),
      ]
    : landscape
      ? [
          createNormalizedSlot(0.06, 0.06, 0.52, 0.88),
          createNormalizedSlot(0.60, 0.06, 0.34, 0.43),
          createNormalizedSlot(0.60, 0.51, 0.34, 0.43),
        ]
      : [
          createNormalizedSlot(0.06, 0.06, 0.88, 0.46),
          createNormalizedSlot(0.06, 0.54, 0.43, 0.40),
          createNormalizedSlot(0.51, 0.54, 0.43, 0.40),
        ];
  const threeStripSlots = createGridNormalizedSlots(3, 1, 3);
  const threeStackSlots = createGridNormalizedSlots(1, 3, 3);

  const fourFeatureSlots = portrait
    ? [
        createNormalizedSlot(0.06, 0.06, 0.88, 0.40),
        ...createGridNormalizedSlots(3, 1, 3, { x: 0.06, y: 0.48, w: 0.88, h: 0.46 }),
      ]
    : landscape
      ? [
          createNormalizedSlot(0.06, 0.06, 0.46, 0.88),
          ...createGridNormalizedSlots(1, 3, 3, { x: 0.54, y: 0.06, w: 0.40, h: 0.88 }),
        ]
      : [
          createNormalizedSlot(0.06, 0.06, 0.52, 0.52),
          createNormalizedSlot(0.60, 0.06, 0.34, 0.25),
          createNormalizedSlot(0.60, 0.33, 0.34, 0.25),
          createNormalizedSlot(0.06, 0.60, 0.88, 0.34),
        ];
  const fourGridSlots = createGridNormalizedSlots(2, 2, 4);
  const fourStripSlots = portrait ? createGridNormalizedSlots(1, 4, 4) : createGridNormalizedSlots(4, 1, 4);

  const fiveFeatureSlots = portrait
    ? [
        createNormalizedSlot(0.06, 0.06, 0.88, 0.34),
        ...createGridNormalizedSlots(2, 2, 4, { x: 0.06, y: 0.42, w: 0.88, h: 0.52 }),
      ]
    : landscape
      ? [
          createNormalizedSlot(0.06, 0.06, 0.46, 0.88),
          ...createGridNormalizedSlots(2, 2, 4, { x: 0.54, y: 0.06, w: 0.40, h: 0.88 }),
        ]
      : [
          createNormalizedSlot(0.06, 0.06, 0.55, 0.40),
          createNormalizedSlot(0.63, 0.06, 0.31, 0.19),
          createNormalizedSlot(0.63, 0.27, 0.31, 0.19),
          createNormalizedSlot(0.06, 0.48, 0.43, 0.46),
          createNormalizedSlot(0.51, 0.48, 0.43, 0.46),
        ];
  const fiveTopBottomSlots = [
    ...createGridNormalizedSlots(2, 1, 2, { x: 0.06, y: 0.06, w: 0.88, h: 0.34 }),
    ...createGridNormalizedSlots(3, 1, 3, { x: 0.06, y: 0.42, w: 0.88, h: 0.52 }),
  ];
  const fiveStripSlots = portrait ? createGridNormalizedSlots(1, 5, 5) : createGridNormalizedSlots(5, 1, 5);

  const sixPrimarySlots = portrait ? createGridNormalizedSlots(2, 3, 6) : createGridNormalizedSlots(3, 2, 6);
  const sixCrossSlots = portrait ? createGridNormalizedSlots(3, 2, 6) : createGridNormalizedSlots(2, 3, 6);
  const sixFeatureSlots = portrait
    ? [
        createNormalizedSlot(0.06, 0.06, 0.88, 0.28),
        ...createGridNormalizedSlots(2, 1, 2, { x: 0.06, y: 0.36, w: 0.88, h: 0.24 }),
        ...createGridNormalizedSlots(3, 1, 3, { x: 0.06, y: 0.62, w: 0.88, h: 0.32 }),
      ]
    : landscape
      ? [
          createNormalizedSlot(0.06, 0.06, 0.40, 0.88),
          ...createGridNormalizedSlots(2, 1, 2, { x: 0.48, y: 0.06, w: 0.46, h: 0.40 }),
          ...createGridNormalizedSlots(3, 1, 3, { x: 0.48, y: 0.52, w: 0.46, h: 0.42 }),
        ]
      : [
          createNormalizedSlot(0.06, 0.06, 0.88, 0.28),
          ...createGridNormalizedSlots(2, 1, 2, { x: 0.06, y: 0.36, w: 0.88, h: 0.24 }),
          ...createGridNormalizedSlots(3, 1, 3, { x: 0.06, y: 0.62, w: 0.88, h: 0.32 }),
        ];

  const sevenStorySlots = portrait
    ? [
        createNormalizedSlot(0.06, 0.06, 0.88, 0.30),
        ...createGridNormalizedSlots(3, 2, 6, { x: 0.06, y: 0.38, w: 0.88, h: 0.56 }),
      ]
    : landscape
      ? [
          createNormalizedSlot(0.06, 0.06, 0.40, 0.88),
          ...createGridNormalizedSlots(2, 3, 6, { x: 0.48, y: 0.06, w: 0.46, h: 0.88 }),
        ]
      : [
          createNormalizedSlot(0.06, 0.06, 0.88, 0.28),
          ...createGridNormalizedSlots(3, 2, 6, { x: 0.06, y: 0.36, w: 0.88, h: 0.58 }),
        ];
  const sevenSplitSlots = [
    ...createGridNormalizedSlots(4, 1, 4, { x: 0.06, y: 0.06, w: 0.88, h: 0.40 }),
    ...createGridNormalizedSlots(3, 1, 3, { x: 0.06, y: 0.48, w: 0.88, h: 0.46 }),
  ];

  const eightPrimarySlots = portrait ? createGridNormalizedSlots(2, 4, 8) : createGridNormalizedSlots(4, 2, 8);
  const eightSplitSlots = [
    ...createGridNormalizedSlots(4, 1, 4, { x: 0.06, y: 0.06, w: 0.88, h: 0.40 }),
    ...createGridNormalizedSlots(4, 1, 4, { x: 0.06, y: 0.48, w: 0.88, h: 0.46 }),
  ];

  const nineGridSlots = createGridNormalizedSlots(3, 3, 9);

  return [
    createNormalizedTemplateDefinition(
      `poster-1-${ratioKey}-main`,
      ratioId,
      1,
      'Single Main',
      '单图大主视觉',
      primaryStyle,
      [createNormalizedSlot(0.06, 0.06, 0.88, 0.88)]
    ),
    createNormalizedTemplateDefinition(
      `poster-2-${ratioKey}-primary`,
      ratioId,
      2,
      'Dual Primary',
      portrait ? '上下双图拼接' : '左右双图拼接',
      secondaryStyle,
      twoPrimarySlots
    ),
    createNormalizedTemplateDefinition(
      `poster-2-${ratioKey}-cross`,
      ratioId,
      2,
      'Dual Cross',
      portrait ? '左右双图拼接' : '上下双图拼接',
      accentStyle,
      twoCrossSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-2-${ratioKey}-focus`,
      ratioId,
      2,
      'Dual Focus',
      '一大一小主次拼接',
      'balanced',
      twoFocusSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-3-${ratioKey}-feature`,
      ratioId,
      3,
      'Triple Feature',
      '一张主图加两张辅图',
      'balanced',
      threeFeatureSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-3-${ratioKey}-strip`,
      ratioId,
      3,
      'Triple Strip',
      '三图并列结构',
      'horizontal',
      threeStripSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-3-${ratioKey}-stack`,
      ratioId,
      3,
      'Triple Stack',
      '三图纵向堆叠',
      'vertical',
      threeStackSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-4-${ratioKey}-grid`,
      ratioId,
      4,
      'Quad Grid',
      '四宫格结构',
      'balanced',
      fourGridSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-4-${ratioKey}-feature`,
      ratioId,
      4,
      'Quad Feature',
      '一大三小主次排布',
      'balanced',
      fourFeatureSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-4-${ratioKey}-strip`,
      ratioId,
      4,
      'Quad Strip',
      portrait ? '四图纵向长条拼接' : '四图横向长条拼接',
      secondaryStyle,
      fourStripSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-5-${ratioKey}-feature`,
      ratioId,
      5,
      'Five Feature',
      '五图主图加四宫格',
      'balanced',
      fiveFeatureSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-5-${ratioKey}-split`,
      ratioId,
      5,
      'Five Split',
      '上二下三拼接结构',
      'balanced',
      fiveTopBottomSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-5-${ratioKey}-strip`,
      ratioId,
      5,
      'Five Strip',
      portrait ? '五图纵向长条拼接' : '五图横向长条拼接',
      secondaryStyle,
      fiveStripSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-6-${ratioKey}-primary`,
      ratioId,
      6,
      'Six Primary',
      portrait ? '六图双列拼接' : '六图三列拼接',
      'balanced',
      sixPrimarySlots
    ),
    createNormalizedTemplateDefinition(
      `poster-6-${ratioKey}-cross`,
      ratioId,
      6,
      'Six Cross',
      portrait ? '六图三列拼接' : '六图双列拼接',
      'balanced',
      sixCrossSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-6-${ratioKey}-feature`,
      ratioId,
      6,
      'Six Feature',
      '一张主图加五张辅图',
      'balanced',
      sixFeatureSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-7-${ratioKey}-story`,
      ratioId,
      7,
      'Seven Story',
      '一张主图加六图故事版',
      'balanced',
      sevenStorySlots
    ),
    createNormalizedTemplateDefinition(
      `poster-7-${ratioKey}-split`,
      ratioId,
      7,
      'Seven Split',
      '上四下三分组拼接',
      'balanced',
      sevenSplitSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-8-${ratioKey}-primary`,
      ratioId,
      8,
      'Eight Primary',
      portrait ? '八图双列长图' : '八图双排拼接',
      'balanced',
      eightPrimarySlots
    ),
    createNormalizedTemplateDefinition(
      `poster-8-${ratioKey}-split`,
      ratioId,
      8,
      'Eight Split',
      '上下双排四列拼接',
      'balanced',
      eightSplitSlots
    ),
    createNormalizedTemplateDefinition(
      `poster-9-${ratioKey}-grid`,
      ratioId,
      9,
      'Nine Grid',
      '九宫格排布',
      'balanced',
      nineGridSlots
    ),
  ];
};

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = TEMPLATE_RATIO_OPTIONS.flatMap((ratioId) => createTemplatesForRatio(ratioId));

const applyTemplateVisualControls = (
  template: TemplateDefinition,
  gapScale: number,
  cornerRadiusRatio: number
) => {
  const gapFactor = clamp(gapScale, 0.84, 1.08);
  return template.slots.map((slot) => {
    const centerX = slot.x + slot.w / 2;
    const centerY = slot.y + slot.h / 2;
    const nextW = clamp(slot.w * gapFactor, 64, template.canvasWidth);
    const nextH = clamp(slot.h * gapFactor, 64, template.canvasHeight);
    const nextX = clamp(centerX - nextW / 2, 0, Math.max(template.canvasWidth - nextW, 0));
    const nextY = clamp(centerY - nextH / 2, 0, Math.max(template.canvasHeight - nextH, 0));

    return {
      ...slot,
      x: nextX,
      y: nextY,
      w: nextW,
      h: nextH,
      radius: Math.round(Math.min(nextW, nextH) * clamp(cornerRadiusRatio, 0, 0.25)),
    };
  });
};

const resolveTemplateRatioById = (templateId?: string): TemplateDefinition['ratioId'] => {
  const matched = TEMPLATE_DEFINITIONS.find((item) => item.id === templateId);
  return matched?.ratioId || TEMPLATE_DEFINITIONS[0].ratioId;
};

const cloneEditorHistorySnapshot = (snapshot: EditorHistorySnapshot): EditorHistorySnapshot =>
  JSON.parse(JSON.stringify(snapshot)) as EditorHistorySnapshot;

const getEditorHistorySnapshotKey = (snapshot: EditorHistorySnapshot) => JSON.stringify(snapshot);

const resolveDefaultTemplateId = (
  assetCount: TemplateDefinition['assetCount'],
  preferredRatioId?: TemplateDefinition['ratioId'],
  preferredTemplateId?: string
) => {
  const preferredTemplate = preferredTemplateId
    ? TEMPLATE_DEFINITIONS.find((item) => item.id === preferredTemplateId && item.assetCount === assetCount)
    : null;
  if (preferredTemplate) return preferredTemplate.id;

  const ratioMatchedTemplate = preferredRatioId
    ? TEMPLATE_DEFINITIONS.find((item) => item.assetCount === assetCount && item.ratioId === preferredRatioId)
    : null;
  if (ratioMatchedTemplate) return ratioMatchedTemplate.id;

  const assetCountMatchedTemplate = TEMPLATE_DEFINITIONS.find((item) => item.assetCount === assetCount);
  return assetCountMatchedTemplate?.id || TEMPLATE_DEFINITIONS[0].id;
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

const toPptColor = (value: string, fallback: string) => {
  const state = parseColorToState(value, fallback);
  return {
    color: state.hex.replace('#', '').toUpperCase(),
    transparency: state.transparent ? 100 : Math.round((1 - clamp(state.alpha, 0, 1)) * 100),
  };
};

const toPptCoord = (value: number, scale: number) => Number((value * scale).toFixed(3));

const toPptPoint = (value: number, scale: number) => Number((value * scale).toFixed(1));

const resolvePptFontFace = (fontFamily: string) => {
  const raw = String(fontFamily || '').trim();
  if (!raw || raw === 'system-ui') return 'Microsoft YaHei';
  return raw
    .split(',')
    .map((item) => item.replace(/["']/g, '').trim())
    .find(Boolean) || 'Microsoft YaHei';
};

type ColorFieldProps = {
  label: string;
  value: string;
  fallback: string;
  onChange: (next: string) => void;
  allowTransparent?: boolean;
};

const ColorField: React.FC<ColorFieldProps> = ({ label, value, fallback, onChange, allowTransparent = false }) => {
  const { t } = useLanguage();
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
            <span>{t.pg_board_opacity}</span>
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
            {t.pg_board_set_transparent}
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

const drawBoardImageLayer = (
  context: CanvasRenderingContext2D,
  layer: Pick<BoardImageLayer, 'x' | 'y' | 'w' | 'h' | 'radius' | 'opacity' | 'fit' | 'showOriginal' | 'cropScale' | 'cropOffsetX' | 'cropOffsetY' | 'rotationQuarterTurns' | 'flipX' | 'flipY'>,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  originX = 0,
  originY = 0
) => {
  const rect = getLayerImageDrawRect(layer, sourceWidth, sourceHeight);
  const centerX = originX + layer.x + layer.w / 2;
  const centerY = originY + layer.y + layer.h / 2;
  const radians = (layer.rotationQuarterTurns || 0) * (Math.PI / 2);
  const scaleX = layer.flipX ? -1 : 1;
  const scaleY = layer.flipY ? -1 : 1;

  context.save();
  context.globalAlpha = clamp(layer.opacity, 0, 1);
  context.beginPath();
  context.roundRect(originX + layer.x, originY + layer.y, layer.w, layer.h, layer.radius);
  context.clip();
  context.translate(centerX, centerY);
  context.rotate(radians);
  context.scale(scaleX, scaleY);
  context.drawImage(
    image,
    0,
    0,
    sourceWidth,
    sourceHeight,
    -layer.w / 2 + rect.dx,
    -layer.h / 2 + rect.dy,
    rect.dw,
    rect.dh
  );
  context.restore();
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

const canvasToPngDataUrl = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to convert canvas to PNG');
  return await blobToDataUrl(blob);
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
  historyItems = [],
  productName,
  sellingPoints,
  initialCanvasRatio,
  initialTemplateId,
  initialTitle,
  initialSubtitle,
  initialBackground,
  initialLocalAssets,
  initialDraft,
  onAlert,
  onLocalAssetsChange,
  onDraftChange,
}) => {
  const { t } = useLanguage();
  const layerIdSeedRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const pointerActionRef = useRef<PointerAction | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundUploadInputRef = useRef<HTMLInputElement | null>(null);
  const localAssetUrlsRef = useRef<string[]>([]);
  const assetImageSizeCacheRef = useRef<Map<string, AssetImageSize>>(new Map());
  const historyTransactionRef = useRef<EditorHistorySnapshot | null>(null);
  const historyFinalizeTimerRef = useRef<number | null>(null);
  const latestHistorySnapshotRef = useRef<EditorHistorySnapshot | null>(null);
  const shouldManageLocalAssetUrls = !onLocalAssetsChange;
  const [zoom, setZoom] = useState(() => initialDraft?.zoom ?? 1);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 960, height: 720 });
  const [localAssets, setLocalAssets] = useState<GalleryBoardAsset[]>(() => initialLocalAssets || []);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [textFontSizeDraft, setTextFontSizeDraft] = useState('');
  const [selectedAssetLocalIds, setSelectedAssetLocalIds] = useState<string[]>(() => initialDraft?.selectedAssetLocalIds || assets.map((item) => item.localId));
  const [templateTooltip, setTemplateTooltip] = useState<TemplateTooltipState | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
  const [isHistoryPickerOpen, setIsHistoryPickerOpen] = useState(false);
  const [libraryAssetType, setLibraryAssetType] = useState<'product' | 'scene'>('product');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryAsset[]>([]);
  const [libraryFolders, setLibraryFolders] = useState<AssetFolder[]>([]);
  const [libraryBreadcrumb, setLibraryBreadcrumb] = useState<AssetFolder[]>([]);
  const [libraryCurrentFolderId, setLibraryCurrentFolderId] = useState<string | null>(null);
  const selectedImageAssets = useMemo(
    () => assets.filter((item) => Boolean(String(item.imageUrl || '').trim())).slice(0, 9),
    [assets]
  );
  const selectedAssetCount = Math.min(Math.max(selectedImageAssets.length, 1), 9) as TemplateDefinition['assetCount'];
  const defaultTemplateId = useMemo(
    () =>
      resolveDefaultTemplateId(
        selectedAssetCount,
        initialDraft?.templateRatioId || initialCanvasRatio,
        initialDraft?.board?.templateId || initialTemplateId
      ),
    [initialCanvasRatio, initialDraft?.board?.templateId, initialDraft?.templateRatioId, initialTemplateId, selectedAssetCount]
  );
  const [templateRatioId, setTemplateRatioId] = useState<TemplateDefinition['ratioId']>(() =>
    initialDraft?.templateRatioId || initialCanvasRatio || resolveTemplateRatioById(initialDraft?.board?.templateId || initialTemplateId)
  );
  const [templateFilterRatio, setTemplateFilterRatio] = useState<TemplateFilterRatio>(() =>
    initialDraft?.templateRatioId || initialCanvasRatio || 'all'
  );
  const [gapScale, setGapScale] = useState(() => initialDraft?.gapScale ?? 1);
  const [cornerRadiusRatio, setCornerRadiusRatio] = useState(() => initialDraft?.cornerRadiusRatio ?? 0.08);
  const [undoStack, setUndoStack] = useState<EditorHistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorHistorySnapshot[]>([]);
  const [, setAssetImageMetaVersion] = useState(0);
  const [rightPanelSections, setRightPanelSections] = useState<Record<RightPanelSectionKey, boolean>>({
    board: true,
    inspector: true,
    assets: (assets.length + (initialLocalAssets?.length || 0)) < 1,
  });
  const [leftPanelSections, setLeftPanelSections] = useState<Record<LeftPanelSectionKey, boolean>>({
    templates: true,
  });
  const [themeClassSnapshot, setThemeClassSnapshot] = useState('');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const sync = () => setThemeClassSnapshot(root.className || '');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const isLightTheme = themeClassSnapshot.includes('theme-light');

  useEffect(() => {
    if (!isExportMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!exportMenuRef.current || !(event.target instanceof Node)) return;
      if (!exportMenuRef.current.contains(event.target)) {
        setIsExportMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isExportMenuOpen]);

  const nextLayerId = () => {
    layerIdSeedRef.current += 1;
    return `board-layer-${layerIdSeedRef.current}`;
  };

  const mergedAssets = useMemo(() => [...assets, ...localAssets], [assets, localAssets]);
  const historyImageEntries = useMemo(
    () =>
      historyItems
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .flatMap((item) =>
          item.images.map((imageUrl, index) => ({
            historyId: item.id,
            createdAt: item.createdAt,
            imageUrl: String(imageUrl || '').trim(),
            imageIndex: index,
            item,
          }))
        )
        .filter((item) => Boolean(item.imageUrl)),
    [historyItems]
  );

  useEffect(() => {
    if (!shouldManageLocalAssetUrls) return;
    localAssetUrlsRef.current = localAssets
      .map((item) => String(item.imageUrl || ''))
      .filter((url) => url.startsWith('blob:'));
  }, [localAssets, shouldManageLocalAssetUrls]);

  useEffect(() => {
    if (!shouldManageLocalAssetUrls) return;
    return () => {
      localAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [shouldManageLocalAssetUrls]);

  useEffect(() => {
    onLocalAssetsChange?.(localAssets);
  }, [localAssets, onLocalAssetsChange]);

  useEffect(() => {
    if (!isLibraryPickerOpen) return;
    let cancelled = false;

    const loadLibraryItems = async () => {
      setLibraryLoading(true);
      setLibraryError(null);
      try {
        const [items, folderData] = await Promise.all([
          assetsApi.getAssets({ type: libraryAssetType, folderId: libraryCurrentFolderId }),
          assetsApi.getFolders({ type: libraryAssetType, parentId: libraryCurrentFolderId }),
        ]);

        if (cancelled) return;
        setLibraryItems(
          (Array.isArray(items) ? items : []).filter((item) => item.media_kind !== 'video' && item.media_kind !== 'audio' && item.media_kind !== 'document')
        );
        setLibraryFolders(Array.isArray(folderData.folders) ? folderData.folders : []);
        setLibraryBreadcrumb(Array.isArray(folderData.breadcrumb) ? folderData.breadcrumb : []);
      } catch (error: any) {
        if (cancelled) return;
        setLibraryItems([]);
        setLibraryFolders([]);
        setLibraryBreadcrumb([]);
        setLibraryError(String(error?.message || t.pg_board_library_load_failed));
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    };

    void loadLibraryItems();
    return () => {
      cancelled = true;
    };
  }, [isLibraryPickerOpen, libraryAssetType, libraryCurrentFolderId, t]);

  useEffect(() => {
    const baseIds = assets.map((item) => item.localId);
    setSelectedAssetLocalIds((prev) => {
      const filtered = prev.filter((item) => baseIds.includes(item));
      if (filtered.length > 0) return filtered;
      return baseIds;
    });
  }, [assets]);

  const assetMap = useMemo(() => {
    const entries = mergedAssets
      .filter((item) => Boolean(String(item.imageUrl || '').trim()))
      .map((item) => [item.localId, item] as const);
    return new Map(entries);
  }, [mergedAssets]);

  const assetIds = useMemo(
    () => selectedImageAssets.map((item) => item.localId).filter((localId) => assetMap.has(localId)),
    [assetMap, selectedImageAssets]
  );

  const buildBoardFromTemplate = (
    templateId: string,
    previous?: Partial<BoardState>
  ): BoardState => {
    const template = TEMPLATE_DEFINITIONS.find((item) => item.id === templateId) || TEMPLATE_DEFINITIONS[0];
    const visualSlots = applyTemplateVisualControls(template, gapScale, cornerRadiusRatio);
    const previousCanvasWidth = Math.max(previous?.canvasWidth || template.canvasWidth, 1);
    const previousCanvasHeight = Math.max(previous?.canvasHeight || template.canvasHeight, 1);
    const scaleX = template.canvasWidth / previousCanvasWidth;
    const scaleY = template.canvasHeight / previousCanvasHeight;
    const titleText =
      String(initialTitle || '').trim() ||
      String(productName || '').trim() ||
      t.pg_board_product_headline;
    const imageLayers: BoardLayer[] = visualSlots.map((slot, index) => ({
      id: nextLayerId(),
      type: 'image' as const,
      name: `${t.pg_board_image} ${index + 1}`,
      assetLocalId: assetIds[index] || null,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      fit: slot.fit || 'cover',
      radius: slot.radius || 0,
      opacity: 1,
      showOriginal: false,
      keepAspectRatio: false,
      cropScale: 1,
      cropOffsetX: 0,
      cropOffsetY: 0,
      rotationQuarterTurns: 0,
      flipX: false,
      flipY: false,
    }));

    const layers: BoardLayer[] = [
      ...imageLayers,
      {
        id: nextLayerId(),
        type: 'text',
        name: t.pg_board_title,
        text: titleText,
        x: Math.round(template.canvasWidth * 0.06),
        y: Math.round(template.canvasHeight * 0.04),
        w: Math.round(template.canvasWidth * 0.62),
        h: Math.round(template.canvasHeight * 0.08),
        fontSize: clamp(Math.round(template.canvasWidth * 0.048), 32, 72),
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

  const [board, setBoard] = useState<BoardState>(() => initialDraft?.board || buildBoardFromTemplate(defaultTemplateId));
  const captureEditorHistorySnapshot = () =>
    cloneEditorHistorySnapshot({
      board,
      templateRatioId,
      gapScale,
      cornerRadiusRatio,
    });

  const clearScheduledHistoryFinalize = () => {
    if (historyFinalizeTimerRef.current === null) return;
    window.clearTimeout(historyFinalizeTimerRef.current);
    historyFinalizeTimerRef.current = null;
  };

  const finalizeHistoryTransaction = () => {
    clearScheduledHistoryFinalize();
    const previousSnapshot = historyTransactionRef.current;
    if (!previousSnapshot) return;
    historyTransactionRef.current = null;
    const currentSnapshot = latestHistorySnapshotRef.current || captureEditorHistorySnapshot();
    if (getEditorHistorySnapshotKey(previousSnapshot) === getEditorHistorySnapshotKey(currentSnapshot)) return;
    setUndoStack((prev) => [...prev, previousSnapshot].slice(-EDITOR_HISTORY_LIMIT));
    setRedoStack([]);
  };

  const beginHistoryTransaction = () => {
    if (historyTransactionRef.current) return;
    historyTransactionRef.current = latestHistorySnapshotRef.current || captureEditorHistorySnapshot();
  };

  const scheduleHistoryTransactionFinalize = () => {
    clearScheduledHistoryFinalize();
    historyFinalizeTimerRef.current = window.setTimeout(() => {
      finalizeHistoryTransaction();
    }, 0);
  };

  const runRecordedChange = (callback: () => void) => {
    beginHistoryTransaction();
    callback();
    scheduleHistoryTransactionFinalize();
  };

  const applyHistorySnapshot = (snapshot: EditorHistorySnapshot) => {
    clearScheduledHistoryFinalize();
    historyTransactionRef.current = null;
    const nextSnapshot = cloneEditorHistorySnapshot(snapshot);
    latestHistorySnapshotRef.current = nextSnapshot;
    setBoard(nextSnapshot.board);
    setTemplateRatioId(nextSnapshot.templateRatioId);
    setGapScale(nextSnapshot.gapScale);
    setCornerRadiusRatio(nextSnapshot.cornerRadiusRatio);
  };

  const handleUndo = () => {
    finalizeHistoryTransaction();
    if (undoStack.length < 1) return;
    const targetSnapshot = undoStack[undoStack.length - 1];
    const currentSnapshot = latestHistorySnapshotRef.current || captureEditorHistorySnapshot();
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, currentSnapshot].slice(-EDITOR_HISTORY_LIMIT));
    applyHistorySnapshot(targetSnapshot);
  };

  const handleRedo = () => {
    finalizeHistoryTransaction();
    if (redoStack.length < 1) return;
    const targetSnapshot = redoStack[redoStack.length - 1];
    const currentSnapshot = latestHistorySnapshotRef.current || captureEditorHistorySnapshot();
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, currentSnapshot].slice(-EDITOR_HISTORY_LIMIT));
    applyHistorySnapshot(targetSnapshot);
  };

  const filteredTemplates = useMemo(
    () =>
      TEMPLATE_DEFINITIONS.filter(
        (item) =>
          item.assetCount === selectedAssetCount &&
          (templateFilterRatio === 'all' || item.ratioId === templateFilterRatio)
      ),
    [selectedAssetCount, templateFilterRatio]
  );
  useEffect(() => {
    const maxLayerId = board.layers.reduce((maxValue, layer) => {
      const matched = String(layer.id || '').match(/board-layer-(\d+)/);
      if (!matched) return maxValue;
      return Math.max(maxValue, Number(matched[1]) || 0);
    }, 0);
    layerIdSeedRef.current = Math.max(layerIdSeedRef.current, maxLayerId);
  }, [board.layers]);

  useEffect(() => {
    onDraftChange?.({
      board,
      selectedAssetLocalIds,
      zoom,
      templateRatioId,
      gapScale,
      cornerRadiusRatio,
    });
  }, [board, cornerRadiusRatio, gapScale, onDraftChange, selectedAssetLocalIds, templateRatioId, zoom]);

  useEffect(() => {
    latestHistorySnapshotRef.current = captureEditorHistorySnapshot();
  }, [board, cornerRadiusRatio, gapScale, templateRatioId]);

  useEffect(() => () => clearScheduledHistoryFinalize(), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = String(target.tagName || '').toLowerCase();
        if (target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
          return;
        }
      }

      const hasModifier = event.metaKey || event.ctrlKey;
      if (!hasModifier) return;

      const key = String(event.key || '').toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (key === 'y' && event.ctrlKey) {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (key === 'z') {
        event.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redoStack.length, undoStack.length, board, templateRatioId, gapScale, cornerRadiusRatio]);

  useEffect(() => {
    const matched = TEMPLATE_DEFINITIONS.find((item) => item.id === board.templateId);
    if (!matched) return;
    setTemplateRatioId((prev) => (prev === matched.ratioId ? prev : matched.ratioId));
  }, [board.templateId]);

  useEffect(() => {
    const matched = TEMPLATE_DEFINITIONS.find((item) => item.id === board.templateId);
    if (matched && matched.assetCount === selectedAssetCount) return;
    setBoard((prev) => buildBoardFromTemplate(resolveDefaultTemplateId(selectedAssetCount, templateRatioId, prev.templateId), prev));
  }, [selectedAssetCount, templateRatioId]);

  useEffect(() => {
    setTemplateFilterRatio((prev) => (prev === 'all' ? prev : templateRatioId));
  }, [templateRatioId]);

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

  const updateBoard = (updater: (prev: BoardState) => BoardState, options?: { record?: boolean }) => {
    if (options?.record) beginHistoryTransaction();
    setBoard((prev) => updater(prev));
    if (options?.record) scheduleHistoryTransactionFinalize();
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

  const updateLayer = (layerId: string, updater: (layer: BoardLayer) => BoardLayer, options: { record?: boolean } = { record: true }) => {
    updateBoard((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)),
    }), options);
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

  const appendImportedAsset = (nextAsset: GalleryBoardAsset) => {
    const imageUrl = String(nextAsset.imageUrl || '').trim();
    if (!imageUrl) {
      onAlert?.(t.pg_board_no_usable_url);
      return false;
    }

    const localId = String(nextAsset.localId || '').trim();
    if (!localId) return false;

    let inserted = false;
    setLocalAssets((prev) => {
      if (prev.some((item) => item.localId === localId) || assets.some((item) => item.localId === localId)) {
        return prev;
      }
      inserted = true;
      return [{ ...nextAsset, imageUrl }, ...prev];
    });
    return inserted;
  };

  const buildLocalAssetsFromFiles = (files: File[]) =>
    files
      .filter((file) => file.type.startsWith('image/'))
      .map((file, index) => ({
        localId: `local-upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        requestId: file.name,
        imageUrl: URL.createObjectURL(file),
        layout: null,
      }));

  const prependLocalAssets = (nextAssets: GalleryBoardAsset[]) => {
    if (nextAssets.length < 1) return;
    setLocalAssets((prev) => [...nextAssets, ...prev]);
  };

  const resolveHistoryImageOutputType = (historyItem: GalleryBoardHistoryItem, imageUrl: string, imageIndex: number) => {
    const metadata = historyItem.metadata && typeof historyItem.metadata === 'object' && !Array.isArray(historyItem.metadata)
      ? historyItem.metadata
      : {};

    const outputTypesByUrl = (metadata as any).outputTypesByUrl;
    if (outputTypesByUrl && typeof outputTypesByUrl === 'object') {
      const mapped = String((outputTypesByUrl as any)[imageUrl] || '').trim();
      if (mapped) return mapped;
    }

    const imageTypes = Array.isArray((metadata as any).imageTypes) ? (metadata as any).imageTypes : [];
    if (imageIndex >= 0 && imageIndex < imageTypes.length) {
      const mapped = String(imageTypes[imageIndex] || '').trim();
      if (mapped) return mapped;
    }

    const outputImages = Array.isArray((metadata as any).outputImages) ? (metadata as any).outputImages : [];
    if (outputImages.length > 0) {
      const matched = outputImages.find((item: any) => {
        const itemUrl = String(item?.imageUrl || item?.downloadUrl || item?.url || item?.preview_url || item?.image_url || '').trim();
        return itemUrl && itemUrl === imageUrl;
      });
      const mapped = String(matched?.outputType || matched?.output_type || matched?.category || matched?.type || '').trim();
      if (mapped) return mapped;
    }

    const maybeResults = (metadata as any).results || (metadata as any).items || (metadata as any).outputs;
    const results = Array.isArray(maybeResults) ? maybeResults : [];
    if (results.length > 0) {
      const matched = results.find((item: any) => {
        const itemUrl = String(item?.preview_url || item?.image_url || item?.url || item?.src || '').trim();
        return itemUrl && itemUrl === imageUrl;
      });
      const mapped = String(matched?.outputType || matched?.output_type || matched?.type || matched?.category || '').trim();
      if (mapped) return mapped;
    }

    const selections = historyItem.settings?.typeSelections;
    if (selections && typeof selections === 'object') {
      const enabledKeys = Object.entries(selections)
        .filter(([, value]) => Boolean(value?.enabled) && Number(value?.count || 0) > 0)
        .map(([key]) => key);
      if (enabledKeys.length === 1) return enabledKeys[0];
    }

    return '';
  };

  const getOutputTypeLabel = (outputType: string) => {
    const cleaned = String(outputType || '').trim();
    if (cleaned === 'white_bg') return t.pi_gallery_output_white_bg;
    if (cleaned === 'scene') return t.pi_gallery_output_scene;
    if (cleaned === 'selling_point') return t.pi_gallery_output_selling_point;
    if (cleaned === 'cover') return t.pi_gallery_output_cover;
    if (cleaned === 'poster') return t.pi_gallery_output_poster;
    return cleaned;
  };

  const openLibraryPicker = () => {
    setLibraryCurrentFolderId(null);
    setLibraryError(null);
    setIsLibraryPickerOpen(true);
  };

  const closeLibraryPicker = () => {
    setIsLibraryPickerOpen(false);
    setLibraryCurrentFolderId(null);
    setLibraryError(null);
    setLibraryItems([]);
    setLibraryFolders([]);
    setLibraryBreadcrumb([]);
    setLibraryLoading(false);
  };

  const importHistoryAsset = (historyItem: GalleryBoardHistoryItem, imageUrl: string, imageIndex: number) =>
    appendImportedAsset({
      localId: `history-${historyItem.id}-${imageIndex}`,
      requestId: `${t.pg_board_history_image} ${historyItem.createdAt}`,
      imageUrl,
      layout: null,
    });

  const importLibraryAsset = (asset: LibraryAsset) => {
    appendImportedAsset({
      localId: `library-${asset.type}-${asset.id}`,
      requestId: asset.name || `asset-${asset.id}`,
      imageUrl: String(asset.file_url || asset.thumbnail || '').trim(),
      layout: null,
    });
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
    }, { record: true });
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
    }, { record: true });
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
      name: t.pg_board_new_text,
      text: t.pg_board_new_text_default,
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
    }), { record: true });
  };

  const replaceSelectedImage = (assetLocalId: string) => {
    if (!selectedLayer || selectedLayer.type !== 'image') {
      onAlert?.(t.pg_board_select_image_layer_first);
      return;
    }

    updateLayer(selectedLayer.id, (layer) => (layer.type === 'image' ? { ...layer, assetLocalId } : layer), { record: true });
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
    }), { record: true });
  };

  const openBoardImagePreview = (url?: string) => {
    const cleaned = String(url || '').trim();
    if (!cleaned) return;
    setPreviewImageUrl(cleaned);
  };

  const handleLocalAssetUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextAssets = buildLocalAssetsFromFiles(Array.from(event.target.files || []));
    if (nextAssets.length < 1) return;
    prependLocalAssets(nextAssets);
    event.target.value = '';
  };

  const handleBackgroundAssetUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextAssets = buildLocalAssetsFromFiles(Array.from(event.target.files || []));
    if (nextAssets.length < 1) return;
    const nextBackgroundAsset = nextAssets[0];
    runRecordedChange(() => {
      prependLocalAssets(nextAssets);
      setBoard((prev) => ({
        ...prev,
        backgroundImageAssetLocalId: nextBackgroundAsset.localId,
        backgroundImageX: 0,
        backgroundImageY: 0,
        backgroundImageW: prev.canvasWidth,
        backgroundImageH: prev.canvasHeight,
        selectedBackground: true,
      }));
    });
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
    }, { record: true });
  };

  const applyTemplate = (templateId: string) => {
    runRecordedChange(() => {
      setTemplateRatioId(resolveTemplateRatioById(templateId));
      setBoard((prev) => buildBoardFromTemplate(templateId, prev));
    });
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
    beginHistoryTransaction();

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
      scheduleHistoryTransactionFinalize();
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

  const renderBoardToCanvas = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = board.canvasWidth;
    canvas.height = board.canvasHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(t.pg_board_export_failed);

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
        const asset = layer.assetLocalId ? assetMap.get(layer.assetLocalId) : undefined;
        const url = String(asset?.imageUrl || '').trim();
        const image = url ? imageCache.get(url) : undefined;

        if (image) {
          drawBoardImageLayer(
            context,
            layer,
            image,
            image.naturalWidth || image.width,
            image.naturalHeight || image.height
          );
        }
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

    return canvas;
  };

  const exportBoardAsPng = async () => {
    setIsExportingPng(true);

    try {
      const canvas = await renderBoardToCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(t.pg_board_export_failed);

      const safeProductName = String(productName || '')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '');

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeProductName || 'product_gallery_board'}_${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      const message = String(error?.message || error || t.pg_board_export_failed);
      onAlert?.(message);
    } finally {
      setIsExportingPng(false);
    }
  };

  const exportBoardAsPptx = async () => {
    setIsExportingPptx(true);

    try {
      const pptx = new PptxGenJS();
      const ratio = board.canvasWidth / Math.max(board.canvasHeight, 1);
      const slideHeight = 7.5;
      const slideWidth = Math.max(4, Number((slideHeight * ratio).toFixed(3)));
      const layoutName = 'VFLOW_GALLERY_BOARD';
      const xScale = slideWidth / Math.max(board.canvasWidth, 1);
      const yScale = slideHeight / Math.max(board.canvasHeight, 1);
      const pointScale = (slideHeight * 72) / Math.max(board.canvasHeight, 1);
      const measureCanvas = document.createElement('canvas');
      const measureContext = measureCanvas.getContext('2d');
      const imageCache = new Map<string, HTMLImageElement>();
      const safeProductName = String(productName || '')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '');

      const getImage = async (url: string) => {
        const cached = imageCache.get(url);
        if (cached) return cached;
        const image = await loadImageFromUrl(url);
        imageCache.set(url, image);
        return image;
      };

      const renderPlacedImageToDataUrl = async ({
        imageUrl,
        frameWidth,
        frameHeight,
        fit,
        opacity = 1,
        radius = 0,
      }: {
        imageUrl: string;
        frameWidth: number;
        frameHeight: number;
        fit: 'cover' | 'contain';
        opacity?: number;
        radius?: number;
      }) => {
        const image = await getImage(imageUrl);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(frameWidth));
        canvas.height = Math.max(1, Math.round(frameHeight));
        const context = canvas.getContext('2d');
        if (!context) throw new Error(t.pg_board_export_failed);

        context.save();
        context.globalAlpha = clamp(opacity, 0, 1);
        if (radius > 0) {
          context.beginPath();
          context.roundRect(0, 0, canvas.width, canvas.height, radius);
          context.clip();
        }

        const rect = fitImageRect(fit, image.naturalWidth || image.width, image.naturalHeight || image.height, canvas.width, canvas.height);
        context.drawImage(
          image,
          rect.sx,
          rect.sy,
          rect.sw,
          rect.sh,
          rect.dx,
          rect.dy,
          rect.dw,
          rect.dh
        );
        context.restore();

        return await canvasToPngDataUrl(canvas);
      };

      const renderLayerImageToDataUrl = async (layer: BoardImageLayer, imageUrl: string) => {
        const image = await getImage(imageUrl);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(layer.w));
        canvas.height = Math.max(1, Math.round(layer.h));
        const context = canvas.getContext('2d');
        if (!context) throw new Error(t.pg_board_export_failed);
        drawBoardImageLayer(
          context,
          { ...layer, x: 0, y: 0 },
          image,
          image.naturalWidth || image.width,
          image.naturalHeight || image.height
        );

        return await canvasToPngDataUrl(canvas);
      };

      pptx.layout = 'LAYOUT_WIDE';
      pptx.defineLayout({ name: layoutName, width: slideWidth, height: slideHeight });
      pptx.layout = layoutName;
      pptx.author = 'VFlow';
      pptx.company = 'VFlow';
      pptx.subject = productName || 'Product Gallery Board';
      pptx.title = `${productName || 'Product Gallery Board'} - Board Export`;

      const slide = pptx.addSlide();
      const boardBackground = toPptColor(board.background, '#111111');
      slide.background = {
        color: boardBackground.color,
        transparency: boardBackground.transparency,
      };

      if (backgroundImageUrl) {
        const backgroundDataUrl = await renderPlacedImageToDataUrl({
          imageUrl: backgroundImageUrl,
          frameWidth: board.backgroundImageW,
          frameHeight: board.backgroundImageH,
          fit: board.backgroundImageFit,
          opacity: board.backgroundImageOpacity,
        });

        slide.addImage({
          data: backgroundDataUrl,
          x: toPptCoord(board.backgroundImageX, xScale),
          y: toPptCoord(board.backgroundImageY, yScale),
          w: toPptCoord(board.backgroundImageW, xScale),
          h: toPptCoord(board.backgroundImageH, yScale),
          altText: t.pg_board_board_background,
        });
      }

      for (const layer of board.layers) {
        if (layer.type === 'image') {
          const asset = layer.assetLocalId ? assetMap.get(layer.assetLocalId) : undefined;
          const imageUrl = String(asset?.imageUrl || '').trim();
          if (!imageUrl) continue;

          const layerDataUrl = await renderLayerImageToDataUrl(layer, imageUrl);
          slide.addImage({
            data: layerDataUrl,
            x: toPptCoord(layer.x, xScale),
            y: toPptCoord(layer.y, yScale),
            w: toPptCoord(layer.w, xScale),
            h: toPptCoord(layer.h, yScale),
            altText: layer.name,
          });
          continue;
        }

        const padding = clamp(layer.padding, 0, 80);
        const fillColor = toPptColor(layer.background, '#FFFFFF');
        const textColor = toPptColor(layer.color, '#FFFFFF');
        const fontFace = resolvePptFontFace(layer.fontFamily);
        let content = layer.text || ' ';

        if (measureContext) {
          measureContext.font = `${layer.fontWeight} ${Math.max(12, Math.round(layer.fontSize))}px ${layer.fontFamily || 'system-ui'}`;
          const maxTextWidth = Math.max(layer.w - padding * 2, 20);
          content = wrapTextLines(measureContext, layer.text || '', maxTextWidth).join('\n') || ' ';
        }

        slide.addText(content, {
          x: toPptCoord(layer.x, xScale),
          y: toPptCoord(layer.y, yScale),
          w: toPptCoord(layer.w, xScale),
          h: toPptCoord(layer.h, yScale),
          fontFace,
          fontSize: Math.max(6, toPptPoint(layer.fontSize, pointScale)),
          bold: layer.fontWeight >= 600,
          color: textColor.color,
          transparency: textColor.transparency,
          align: layer.align,
          valign: 'top',
          fit: 'none',
          margin: [
            toPptPoint(padding, pointScale),
            toPptPoint(padding, pointScale),
            toPptPoint(padding, pointScale),
            toPptPoint(padding, pointScale),
          ],
          lineSpacingMultiple: Number(clamp(layer.lineHeight, 1, 2).toFixed(2)),
          fill: {
            color: fillColor.color,
            transparency: fillColor.transparency,
          },
          line: {
            color: fillColor.color,
            transparency: 100,
          },
        });
      }

      await pptx.writeFile({ fileName: `${safeProductName || 'product_gallery_board'}_${Date.now()}.pptx` });
    } catch (error: any) {
      const message = String(error?.message || error || t.pg_board_export_failed);
      onAlert?.(message);
    } finally {
      setIsExportingPptx(false);
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
    }, { record: true });
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

  const showTemplateTooltip = (text: string, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    const maxTop = Math.max(window.innerHeight - 20, 20);
    setTemplateTooltip({
      text,
      left: rect.right + 10,
      top: clamp(rect.top + rect.height / 2, 20, maxTop),
    });
  };

  const hideTemplateTooltip = () => {
    setTemplateTooltip(null);
  };

  const isExportBusy = isExportingPng || isExportingPptx;

  return (
    <>
      <div className="grid h-[78vh] min-h-[78vh] grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[240px_minmax(0,1fr)_360px]">
      <aside
        className={`flex h-full min-h-0 flex-col rounded-2xl border p-3 ${
          isLightTheme ? 'border-slate-200 bg-white/85 shadow-[0_10px_30px_rgba(15,23,42,0.06)]' : 'border-white/10 bg-black/20'
        }`}
      >
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div
            className={`overflow-hidden rounded-2xl border ${
              isLightTheme ? 'border-slate-200 bg-slate-50/90' : 'border-white/10 bg-black/20'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleLeftPanelSection('templates')}
              className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {t.pg_board_templates}
                </div>
              </div>
              <ChevronDown
                className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition ${leftPanelSections.templates ? 'rotate-180' : ''}`}
              />
            </button>

            {leftPanelSections.templates ? (
              <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-3">
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-zinc-400">
                  {t.pg_board_selected_count} {selectedAssetCount}
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {(['all', ...TEMPLATE_RATIO_OPTIONS] as TemplateFilterRatio[]).map((ratio) => {
                    const active = templateFilterRatio === ratio;
                    return (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setTemplateFilterRatio(ratio)}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                          active
                            ? (isLightTheme
                                ? 'border-orange-300 bg-orange-100 text-orange-700'
                                : 'border-orange-500/40 bg-orange-500/10 text-orange-200')
                            : (isLightTheme
                                ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800')
                        }`}
                      >
                        {ratio === 'all' ? t.pg_board_ratio_all : ratio}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {filteredTemplates.map((template) => {
                    const active = board.templateId === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyTemplate(template.id)}
                        onMouseEnter={(event) => showTemplateTooltip(template.description, event.currentTarget)}
                        onMouseMove={(event) => showTemplateTooltip(template.description, event.currentTarget)}
                        onMouseLeave={hideTemplateTooltip}
                        onFocus={(event) => showTemplateTooltip(template.description, event.currentTarget)}
                        onBlur={hideTemplateTooltip}
                        className={`group relative rounded-xl border p-1.5 text-left transition ${
                          active
                            ? (isLightTheme
                                ? 'border-orange-300 bg-orange-50 text-orange-700 shadow-[0_0_0_1px_rgba(251,146,60,0.28)]'
                                : 'border-orange-500 bg-orange-500/10 text-orange-200 shadow-[0_0_0_1px_rgba(249,115,22,0.25)]')
                            : (isLightTheme
                                ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                                : 'border-white/10 bg-black/20 text-zinc-200 hover:border-white/20 hover:bg-white/5')
                        }`}
                      >
                        <div
                          className={`overflow-hidden rounded-lg border p-1 ${
                            isLightTheme ? 'border-slate-200 bg-slate-200/70' : 'border-white/10 bg-zinc-950/70'
                          }`}
                        >
                          <div
                            className="relative mx-auto w-full overflow-hidden rounded-md"
                            style={{
                              aspectRatio: `${template.canvasWidth} / ${template.canvasHeight}`,
                              background: TEMPLATE_PREVIEW_BACKGROUND,
                              border: isLightTheme
                                ? '1px solid rgba(15, 23, 42, 0.18)'
                                : '1px solid rgba(255, 255, 255, 0.06)',
                              boxShadow: isLightTheme
                                ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.16)'
                                : 'inset 0 0 0 1px rgba(255, 255, 255, 0.03)',
                            }}
                          >
                            {template.slots.map((slot, index) => (
                              <div
                                key={`${template.id}-${index}`}
                                className="absolute rounded-[3px]"
                                style={{
                                  left: `${(slot.x / template.canvasWidth) * 100}%`,
                                  top: `${(slot.y / template.canvasHeight) * 100}%`,
                                  width: `${(slot.w / template.canvasWidth) * 100}%`,
                                  height: `${(slot.h / template.canvasHeight) * 100}%`,
                                  border: isLightTheme
                                    ? '1px solid rgba(255, 255, 255, 0.88)'
                                    : '1px solid rgba(255, 255, 255, 0.3)',
                                  background: isLightTheme
                                    ? 'rgba(255, 255, 255, 0.26)'
                                    : 'rgba(255, 255, 255, 0.1)',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {filteredTemplates.length < 1 ? (
                  <div
                    className={`rounded-xl border px-3 py-4 text-xs ${
                      isLightTheme ? 'border-slate-200 bg-white text-slate-500' : 'border-white/10 bg-black/20 text-zinc-500'
                    }`}
                  >
                    {t.pg_board_no_templates}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

        </div>
      </aside>

      {templateTooltip ? (
        <div
          className={`pointer-events-none fixed z-[260] w-max max-w-[180px] -translate-y-1/2 rounded-md border px-2 py-1.5 text-center text-[10px] leading-4 shadow-xl ${
            isLightTheme ? 'border-slate-200 bg-white/96 text-slate-700' : 'border-white/10 bg-black/92 text-zinc-100'
          }`}
          style={{
            left: templateTooltip.left,
            top: templateTooltip.top,
          }}
        >
          {templateTooltip.text}
        </div>
      ) : null}

      <section className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length < 1}
              title={t.pg_board_undo}
              aria-label={t.pg_board_undo}
              className="rounded-xl border border-white/10 bg-zinc-900/70 p-2 text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length < 1}
              title={t.pg_board_redo}
              aria-label={t.pg_board_redo}
              className="rounded-xl border border-white/10 bg-zinc-900/70 p-2 text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={addTextLayer}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
            >
              <Type className="h-4 w-4" />
              {t.pg_board_add_text}
            </button>
            <button
              type="button"
              onClick={() => setZoom((prev) => clamp(prev - 0.15, 0.6, 2))}
              className="rounded-xl border border-white/10 bg-zinc-900/70 p-2 text-zinc-200 transition hover:bg-zinc-800"
              aria-label={t.pg_board_zoom_out}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <div className="min-w-[64px] text-center text-xs text-zinc-400">{Math.round(boardScale * 100)}%</div>
            <button
              type="button"
              onClick={() => setZoom((prev) => clamp(prev + 0.15, 0.6, 2))}
              className="rounded-xl border border-white/10 bg-zinc-900/70 p-2 text-zinc-200 transition hover:bg-zinc-800"
              aria-label={t.pg_board_zoom_in}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  if (isExportBusy) return;
                  setIsExportMenuOpen((prev) => !prev);
                }}
                disabled={isExportBusy}
                aria-expanded={isExportMenuOpen}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-black transition hover:bg-orange-400 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {isExportBusy ? t.pg_board_exporting : t.pg_board_export}
                <ChevronDown className={`h-4 w-4 transition ${isExportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isExportMenuOpen ? (
                <div className="absolute right-0 top-full z-[240] mt-2 min-w-[160px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      void exportBoardAsPng();
                    }}
                    disabled={isExportBusy}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-semibold text-zinc-100 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    <span>{t.pg_board_export_png}</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      void exportBoardAsPptx();
                    }}
                    disabled={isExportBusy}
                    className="flex w-full items-center justify-between gap-3 border-t border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-zinc-100 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    <span>{t.pg_board_export_pptx}</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">PPTX</span>
                  </button>
                </div>
              ) : null}
            </div>
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
                    alt={t.pg_board_board_background}
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
                                    transform: `rotate(${((layer.rotationQuarterTurns || 0) * 90).toFixed(0)}deg) scale(${layer.flipX ? -1 : 1}, ${layer.flipY ? -1 : 1})`,
                                    transformOrigin: 'center center',
                                  }
                                : {
                                    transform: `translate(${(clamp(layer.cropOffsetX ?? 0, -1, 1) * 50).toFixed(2)}%, ${(clamp(layer.cropOffsetY ?? 0, -1, 1) * 50).toFixed(2)}%) rotate(${((layer.rotationQuarterTurns || 0) * 90).toFixed(0)}deg) scale(${(layer.flipX ? -1 : 1) * clamp(layer.cropScale ?? 1, 1, 6)}, ${(layer.flipY ? -1 : 1) * clamp(layer.cropScale ?? 1, 1, 6)})`,
                                    transformOrigin: 'center center',
                                  }
                            }
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-white/5 px-4 text-center text-xs text-zinc-500">
                            {t.pg_board_drop_asset_hint}
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

      <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => toggleRightPanelSection('board')}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {t.pg_board_board_settings}
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition ${rightPanelSections.board ? 'rotate-180' : ''}`}
              />
            </button>

            {rightPanelSections.board ? (
              <div className="border-t border-white/10 px-4 pb-4 pt-4 space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
              <label className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>{t.pg_board_gap_control || '拼接缝隙'}</span>
                  <span>{gapScale.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.84"
                  max="1.08"
                  step="0.01"
                  value={gapScale}
                  onChange={(event) => {
                    const next = clamp(Number(event.target.value) || 1, 0.84, 1.08);
                    runRecordedChange(() => {
                      setGapScale(next);
                      setBoard((prev) => buildBoardFromTemplate(prev.templateId, prev));
                    });
                  }}
                  className="w-full accent-orange-400"
                />
              </label>
              <label className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>{t.pg_board_corner_ratio || '全局圆角'}</span>
                  <span>{Math.round(cornerRadiusRatio * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.25"
                  step="0.01"
                  value={cornerRadiusRatio}
                  onChange={(event) => {
                    const next = clamp(Number(event.target.value) || 0, 0, 0.25);
                    runRecordedChange(() => {
                      setCornerRadiusRatio(next);
                      setBoard((prev) => buildBoardFromTemplate(prev.templateId, prev));
                    });
                  }}
                  className="w-full accent-orange-400"
                />
              </label>
            </div>
            <label className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                {t.pg_board_canvas_ratio}
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
                <option value="custom">{t.pg_board_custom_size}</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {t.pg_board_canvas_width}
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
                  {t.pg_board_canvas_height}
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
              label={t.pg_board_board_color}
              value={board.background}
              fallback="#111111"
              onChange={(next) => updateBoard((prev) => ({ ...prev, background: next }), { record: true })}
            />

            <label className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                {t.pg_board_background_asset}
              </div>
              <select
                value={board.backgroundImageAssetLocalId || ''}
                onChange={(event) => setBackgroundImage(event.target.value || null)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
              >
                <option value="">{t.pg_board_no_bg_image}</option>
                {mergedAssets
                  .filter((item) => Boolean(String(item.imageUrl || '').trim()))
                  .map((asset, index) => (
                    <option key={asset.localId} value={asset.localId}>
                      {t.pg_board_image} {index + 1}
                    </option>
                ))}
              </select>
            </label>

            <input
              ref={backgroundUploadInputRef}
              type="file"
              accept="image/*"
              onChange={handleBackgroundAssetUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => backgroundUploadInputRef.current?.click()}
              className="w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
            >
              {t.pg_board_upload_background}
            </button>

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
                    {t.pg_board_select_background}
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
                    {t.pg_board_reset_fill}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {t.pg_board_bg_fit}
                    </div>
                    <select
                      value={board.backgroundImageFit}
                      onChange={(event) =>
                        updateBoard((prev) => ({
                          ...prev,
                          backgroundImageFit: event.target.value as BoardState['backgroundImageFit'],
                        }), { record: true })
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    >
                      <option value="cover">{t.pg_board_fit_cover}</option>
                      <option value="contain">{t.pg_board_fit_contain}</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {t.pg_board_bg_opacity}
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={board.backgroundImageOpacity}
                      onChange={(event) =>
                        updateBoard((prev) => ({
                          ...prev,
                          backgroundImageOpacity: clamp(Number(event.target.value) || 0, 0, 1),
                        }), { record: true })
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    />
                  </label>
                </div>

                <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  <img src={backgroundImageUrl} alt={t.pg_board_bg_preview} className="h-24 w-full object-cover" />
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
                  {t.pg_board_selected_object}
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition ${rightPanelSections.inspector ? 'rotate-180' : ''}`}
              />
            </button>

            {rightPanelSections.inspector ? (
              <div className="border-t border-white/10 px-4 pb-4 pt-4">
                <div className="mb-3 flex items-center justify-end gap-2">
                  {selectedLayer ? (
                    <button
                      type="button"
                      onClick={removeSelectedLayer}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-200 transition hover:bg-red-500/15"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.pg_board_delete}
                    </button>
                  ) : null}
                </div>

                {isBackgroundSelected ? (
                  <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                {t.pg_board_background_image}
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
                  {t.pg_board_bg_fit}
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
                  <option value="cover">{t.pg_board_fit_cover}</option>
                  <option value="contain">{t.pg_board_fit_contain}</option>
                </select>
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {t.pg_board_bg_opacity}
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
                {selectedLayer.name} · {selectedLayer.type === 'image' ? t.pg_board_image_layer : t.pg_board_text_layer}
              </div>

              <label className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  {t.pg_board_layer_name}
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
                  {t.pg_board_layer_order}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => moveSelectedLayer('back')}
                    className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    {t.pg_board_send_to_back}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedLayer('backward')}
                    className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    {t.pg_board_send_backward}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedLayer('forward')}
                    className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    {t.pg_board_bring_forward}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedLayer('front')}
                    className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    {t.pg_board_bring_to_front}
                  </button>
                </div>
              </div>

              {selectedLayer.type === 'image' ? (
                <>
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {t.pg_board_image_source}
                    </div>
                    <select
                      value={selectedLayer.assetLocalId || ''}
                      onChange={(event) => handleSelectedImageAssetChange(event.target.value || null)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    >
                      <option value="">{t.pg_board_no_image_bound}</option>
                      {mergedAssets
                        .filter((item) => Boolean(String(item.imageUrl || '').trim()))
                        .map((asset, index) => (
                          <option key={asset.localId} value={asset.localId}>
                            {t.pg_board_image} {index + 1}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {t.pg_board_image_fit}
                    </div>
                    <select
                      value={selectedLayer.fit}
                      onChange={(event) => updateSelectedImageLayer({ fit: event.target.value as BoardImageLayer['fit'] })}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    >
                      <option value="cover">{t.pg_board_fit_cover}</option>
                      <option value="contain">{t.pg_board_fit_contain}</option>
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
                      <span>{t.pg_board_show_original}</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
                      <input
                        type="checkbox"
                        checked={selectedLayer.keepAspectRatio}
                        onChange={(event) => updateSelectedImageLayer({ keepAspectRatio: event.target.checked })}
                        className="accent-orange-500"
                      />
                      <span>{t.pg_board_keep_aspect}</span>
                    </label>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {t.pg_board_image_crop}
                      </div>
                      <button
                        type="button"
                        onClick={resetSelectedImageCrop}
                        className="rounded-lg border border-white/10 bg-zinc-900/70 px-2 py-1 text-[10px] font-semibold text-zinc-200 transition hover:bg-zinc-800"
                      >
                        {t.pg_board_reset_crop}
                      </button>
                    </div>

                    <label className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>{t.pg_board_zoom}</span>
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
                        <span>{t.pg_board_h_offset}</span>
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
                        <span>{t.pg_board_v_offset}</span>
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
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedImageLayer({
                          rotationQuarterTurns: (((selectedLayer.rotationQuarterTurns || 0) + 3) % 4) as 0 | 1 | 2 | 3,
                        })
                      }
                      className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                    >
                      {t.pg_board_rotate_left || '左转90°'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedImageLayer({
                          rotationQuarterTurns: (((selectedLayer.rotationQuarterTurns || 0) + 1) % 4) as 0 | 1 | 2 | 3,
                        })
                      }
                      className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                    >
                      {t.pg_board_rotate_right || '右转90°'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedImageLayer({ flipX: !selectedLayer.flipX })}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        selectedLayer.flipX
                          ? 'border-orange-500/30 bg-orange-500/10 text-orange-200'
                          : 'border-white/10 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800'
                      }`}
                    >
                      {t.pg_board_flip_horizontal || '水平翻转'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedImageLayer({ flipY: !selectedLayer.flipY })}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        selectedLayer.flipY
                          ? 'border-orange-500/30 bg-orange-500/10 text-orange-200'
                          : 'border-white/10 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800'
                      }`}
                    >
                      {t.pg_board_flip_vertical || '垂直翻转'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {t.pg_board_radius}
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
                        {t.pg_board_opacity}
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
                      {t.pg_board_text_content}
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
                        {t.pg_board_font}
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
                        {t.pg_board_font_size}
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
                        {t.pg_board_weight}
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
                        {t.pg_board_align}
                      </div>
                      <select
                        value={selectedLayer.align}
                        onChange={(event) => updateSelectedTextLayer({ align: event.target.value as BoardTextLayer['align'] })}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      >
                        <option value="left">{t.pg_board_align_left}</option>
                        <option value="center">{t.pg_board_align_center}</option>
                        <option value="right">{t.pg_board_align_right}</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        {t.pg_board_line_height}
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
                        {t.pg_board_padding}
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
                    label={t.pg_board_text_color}
                    value={selectedLayer.color}
                    fallback="#ffffff"
                          onChange={(next) => updateSelectedTextLayer({ color: next })}
                  />
                  <ColorField
                    label={t.pg_board_bg_color}
                    value={selectedLayer.background}
                    fallback="#000000"
                          allowTransparent
                    onChange={(next) => updateSelectedTextLayer({ background: next })}
                  />
                </>
              )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
                    {t.pg_board_select_object_first}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addTextLayer}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                >
                  <Plus className="h-4 w-4" />
                  {t.pg_board_add_text_layer}
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
                  {t.pg_board_current_assets}
                </div>
              </div>
              <ChevronDown
                className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition ${rightPanelSections.assets ? 'rotate-180' : ''}`}
              />
            </button>

            {rightPanelSections.assets ? (
              <div className="border-t border-white/10 px-4 pb-4 pt-4">
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-zinc-200">
                    {t.pg_board_selected_count}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                      {t.pg_board_upload_images}
                    </button>
                    <button
                      type="button"
                      onClick={openLibraryPicker}
                      className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-200 transition hover:bg-orange-500/15"
                    >
                      <Folder className="h-3.5 w-3.5" />
                      {t.pg_board_import_library}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsHistoryPickerOpen(true)}
                      className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                    >
                      {t.pg_board_import_history}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {mergedAssets.length > 0 ? (
                    mergedAssets.map((asset, index) => {
                      const imageUrl = String(asset.imageUrl || '').trim();
                      const canRender = Boolean(imageUrl);
                      const canReplace = canRender && selectedLayer?.type === 'image';
                      const isTemplateAsset = selectedAssetLocalIds.includes(asset.localId);
                      return (
                        <div
                          key={asset.localId}
                          className={`rounded-xl border p-2.5 ${
                            isTemplateAsset ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/10 bg-black/20'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2 min-w-0">
                            <div className="truncate text-[11px] font-semibold text-zinc-200">
                              {isTemplateAsset ? `${t.pg_board_image} ${index + 1}` : asset.requestId}
                            </div>
                            {isTemplateAsset ? (
                              <div className="shrink-0 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-200">
                                {t.pg_board_selected}
                              </div>
                            ) : null}
                          </div>

                          <div
                            onClick={() => {
                              if (!canRender) return;
                              openBoardImagePreview(imageUrl);
                            }}
                            className={`overflow-hidden rounded-lg border border-white/10 bg-zinc-950/60 ${canRender ? 'cursor-pointer' : ''}`}
                          >
                            {canRender ? (
                              <img src={imageUrl} alt={asset.requestId} className="h-24 w-full object-cover" />
                            ) : (
                              <div className="flex h-24 items-center justify-center text-xs text-zinc-500">
                                {t.pg_board_no_valid_url_short}
                              </div>
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-2">
                            <button
                              type="button"
                              disabled={!canReplace}
                              onClick={() => replaceSelectedImage(asset.localId)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-2 text-[11px] font-semibold text-orange-200 transition hover:bg-orange-500/15 disabled:opacity-40"
                            >
                              <Replace className="h-3.5 w-3.5" />
                              {t.pg_board_replace_selected}
                            </button>
                            <button
                              type="button"
                              disabled={!canRender}
                              onClick={() => setBackgroundImage(asset.localId)}
                              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-zinc-900/70 px-2.5 py-2 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40"
                            >
                              {t.pg_board_set_as_background}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
                      {t.pg_board_no_assets}
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
        isOpen={isHistoryPickerOpen}
        title={t.pg_board_import_history_title}
        subtitle={t.pg_board_import_history_subtitle}
        onClose={() => setIsHistoryPickerOpen(false)}
        widthClassName="max-w-6xl"
        contentClassName="overflow-hidden"
        footer={
          <button
            type="button"
            onClick={() => setIsHistoryPickerOpen(false)}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            {t.pg_board_close}
          </button>
        }
      >
        <div className="min-h-[320px] max-h-[72vh] overflow-y-auto custom-scroll pr-1">
          {historyImageEntries.length < 1 ? (
            <div className="flex h-72 items-center justify-center text-sm text-zinc-500">
              {t.pg_board_no_history}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {historyImageEntries.map((entry) => {
                const outputType = resolveHistoryImageOutputType(entry.item, entry.imageUrl, entry.imageIndex);
                const outputTypeLabel = getOutputTypeLabel(outputType);
                const localId = `history-${entry.historyId}-${entry.imageIndex}`;
                const isImported = mergedAssets.some((item) => item.localId === localId);
                return (
                  <div key={localId} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                    <button
                      type="button"
                      onClick={() => openBoardImagePreview(entry.imageUrl)}
                      className="block w-full"
                    >
                      <img src={entry.imageUrl} alt={localId} className="aspect-square w-full object-cover" />
                    </button>
                    <div className="border-t border-white/10 px-3 py-3">
                      <div className="text-[11px] text-zinc-500">{entry.createdAt}</div>
                      {outputTypeLabel ? (
                        <div className="mt-1 truncate text-[11px] font-semibold text-zinc-300">{outputTypeLabel}</div>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => openBoardImagePreview(entry.imageUrl)}
                          className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                        >
                          {t.pg_board_preview}
                        </button>
                        <button
                          type="button"
                          onClick={() => importHistoryAsset(entry.item, entry.imageUrl, entry.imageIndex)}
                          disabled={isImported}
                          className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                            isImported
                              ? 'cursor-default border border-white/10 bg-white/5 text-zinc-500'
                              : 'bg-orange-500 text-black hover:bg-orange-400'
                          }`}
                        >
                          {isImported ? t.pg_board_imported : t.pg_board_import}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppDialog>

      <AppDialog
        isOpen={isLibraryPickerOpen}
        title={t.pg_board_import_library}
        subtitle={t.pg_board_import_library_subtitle}
        onClose={closeLibraryPicker}
        widthClassName="max-w-5xl"
        contentClassName="overflow-hidden"
        footer={
          <button
            type="button"
            onClick={closeLibraryPicker}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            {t.pg_board_close}
          </button>
        }
      >
        <div className="flex h-[min(72vh,680px)] flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {LIBRARY_PICKER_TYPE_OPTIONS.map((option) => {
                const active = libraryAssetType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setLibraryAssetType(option.value);
                      setLibraryCurrentFolderId(null);
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                        : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {t[option.labelKey]}
                  </button>
                );
              })}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
              <button
                type="button"
                onClick={() => setLibraryCurrentFolderId(null)}
                className={`transition hover:text-zinc-200 ${libraryCurrentFolderId === null ? 'text-zinc-200' : ''}`}
              >
                {t.pg_board_root}
              </button>
              {libraryBreadcrumb.map((folder) => (
                <React.Fragment key={folder.id}>
                  <span>/</span>
                  <button
                    type="button"
                    onClick={() => setLibraryCurrentFolderId(folder.id)}
                    className={`max-w-[180px] truncate transition hover:text-zinc-200 ${libraryCurrentFolderId === folder.id ? 'text-zinc-200' : ''}`}
                  >
                    {folder.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scroll pr-1">
            {libraryLoading ? (
              <div className="flex h-56 items-center justify-center text-sm text-zinc-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.pg_board_library_loading}
              </div>
            ) : libraryError ? (
              <div className="flex h-56 items-center justify-center text-sm text-red-300">
                {libraryError}
              </div>
            ) : libraryItems.length < 1 && libraryFolders.length < 1 ? (
              <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
                {t.pg_board_no_library_assets}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {libraryFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setLibraryCurrentFolderId(folder.id)}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-center transition hover:border-orange-500/40 hover:bg-white/5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900/80">
                      <Folder className="h-5 w-5 text-zinc-300" />
                    </div>
                    <div className="w-full truncate text-xs font-semibold text-zinc-200">{folder.name}</div>
                  </button>
                ))}

                {libraryItems.map((asset) => {
                  const previewUrl = String(asset.thumbnail || asset.file_url || '').trim();
                  const localId = `library-${asset.type}-${asset.id}`;
                  const isImported = mergedAssets.some((item) => item.localId === localId);
                  return (
                    <div
                      key={`${asset.type}-${asset.id}`}
                      className="flex flex-col rounded-2xl border border-white/10 bg-black/20 p-2.5"
                    >
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/70">
                        {previewUrl ? (
                          <img src={previewUrl} alt={asset.name} className="aspect-[4/5] w-full object-cover" />
                        ) : (
                          <div className="flex aspect-[4/5] items-center justify-center text-xs text-zinc-500">
                            {t.pg_board_no_preview}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 truncate text-xs font-semibold text-zinc-200">{asset.name || `asset-${asset.id}`}</div>
                      <div className="mt-1 text-[10px] text-zinc-500">
                        {asset.type === 'scene' ? t.pg_board_scene_asset : t.pg_board_product_asset}
                      </div>
                      <button
                        type="button"
                        onClick={() => importLibraryAsset(asset)}
                        disabled={isImported}
                        className={`mt-3 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${
                          isImported
                            ? 'cursor-default border border-white/10 bg-white/5 text-zinc-500'
                            : 'border border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/15'
                        }`}
                      >
                        {isImported ? t.pg_board_imported : t.pg_board_import_to_assets}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </AppDialog>

      <AppDialog
        isOpen={Boolean(previewImageUrl)}
        title={t.pg_board_image_preview}
        onClose={() => setPreviewImageUrl(null)}
        widthClassName="max-w-5xl"
        footer={
          <button
            type="button"
            onClick={() => setPreviewImageUrl(null)}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            {t.pg_board_close}
          </button>
        }
      >
        {previewImageUrl ? (
          <div className="w-full flex items-center justify-center">
            <div className="relative inline-block overflow-hidden rounded-xl border border-white/10">
              <img src={previewImageUrl} alt={t.pg_board_image_preview} className="max-h-[70vh] w-auto object-contain" />
            </div>
          </div>
        ) : null}
      </AppDialog>
    </>
  );
};

export default GalleryBoardEditor;
