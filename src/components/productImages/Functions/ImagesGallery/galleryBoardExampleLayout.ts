import type { GalleryBoardAsset, GalleryBoardDraft } from '../../../workbench/GalleryBoardEditor';

export type GalleryBoardExampleRatioId = '3:4' | '1:1' | '4:3' | '2:3' | '3:2' | '16:9' | '9:16';

export type GalleryBoardExampleSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type GalleryBoardCanvasSize = {
  width: number;
  height: number;
};

type BuildGalleryBoardExampleDraftOptions = {
  assets: GalleryBoardAsset[];
  ratioId: string;
  title?: string;
  subtitle?: string;
  sellingPoints?: string[];
};

const GALLERY_BOARD_CANVAS_SIZES: Record<GalleryBoardExampleRatioId, GalleryBoardCanvasSize> = {
  '3:4': { width: 1200, height: 1600 },
  '1:1': { width: 1200, height: 1200 },
  '4:3': { width: 1600, height: 1200 },
  '2:3': { width: 1200, height: 1800 },
  '3:2': { width: 1500, height: 1000 },
  '16:9': { width: 1600, height: 900 },
  '9:16': { width: 1080, height: 1920 },
};

const GALLERY_BOARD_TEMPLATE_SUFFIX_BY_COUNT: Record<number, string> = {
  1: 'main',
  2: 'primary',
  3: 'feature',
  4: 'grid',
  5: 'feature',
  6: 'primary',
  7: 'story',
  8: 'primary',
  9: 'grid',
};

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const parseAspectRatioFloat = (ratioId: string) => {
  const matched = String(ratioId || '').trim().match(/^(\d+)\s*[:/]\s*(\d+)$/);
  if (!matched) return 3 / 4;
  const width = Number(matched[1]);
  const height = Number(matched[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 3 / 4;
  return width / height;
};

export const normalizeGalleryBoardExampleRatioId = (ratioId: string): GalleryBoardExampleRatioId => {
  const normalized = String(ratioId || '').trim();
  return normalized in GALLERY_BOARD_CANVAS_SIZES
    ? (normalized as GalleryBoardExampleRatioId)
    : '3:4';
};

export const getGalleryBoardExampleCanvasSize = (ratioId: string): GalleryBoardCanvasSize => (
  GALLERY_BOARD_CANVAS_SIZES[normalizeGalleryBoardExampleRatioId(ratioId)]
);

export const getGalleryBoardExampleTemplateId = (assetCount: number, ratioId: string) => {
  const safeCount = clampNumber(Math.round(assetCount || 0), 1, 9);
  const safeRatio = normalizeGalleryBoardExampleRatioId(ratioId);
  const suffix = GALLERY_BOARD_TEMPLATE_SUFFIX_BY_COUNT[safeCount] || 'main';
  return `poster-${safeCount}-${safeRatio.replace(':', '')}-${suffix}`;
};

export const getGalleryBoardExampleAspectRatioStyle = (ratioId: string) => {
  const matched = String(ratioId || '').trim().match(/^(\d+)\s*[:/]\s*(\d+)$/);
  if (!matched) return '3 / 4';
  return `${matched[1]} / ${matched[2]}`;
};

const createBoardExampleGridSlots = (
  cols: number,
  rows: number,
  bounds: GalleryBoardExampleSlot = { x: 0.08, y: 0.14, w: 0.84, h: 0.74 },
  gap = 0.024
) => {
  const safeCols = Math.max(cols, 1);
  const safeRows = Math.max(rows, 1);
  const cellW = (bounds.w - gap * (safeCols - 1)) / safeCols;
  const cellH = (bounds.h - gap * (safeRows - 1)) / safeRows;
  const slots: GalleryBoardExampleSlot[] = [];

  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) {
      slots.push({
        x: bounds.x + col * (cellW + gap),
        y: bounds.y + row * (cellH + gap),
        w: cellW,
        h: cellH,
      });
    }
  }

  return slots;
};

export const buildGalleryBoardExampleSlots = (count: number, ratioId: string): GalleryBoardExampleSlot[] => {
  const safeCount = clampNumber(Math.round(count || 0), 1, 9);
  const ratioValue = parseAspectRatioFloat(ratioId);
  const isPortrait = ratioValue < 0.95;
  const isLandscape = ratioValue > 1.05;

  if (safeCount === 1) {
    return [{ x: 0.08, y: 0.15, w: 0.84, h: 0.72 }];
  }

  if (safeCount === 2) {
    return isPortrait
      ? [
          { x: 0.08, y: 0.14, w: 0.84, h: 0.35 },
          { x: 0.08, y: 0.53, w: 0.84, h: 0.35 },
        ]
      : [
          { x: 0.08, y: 0.16, w: 0.40, h: 0.68 },
          { x: 0.52, y: 0.16, w: 0.40, h: 0.68 },
        ];
  }

  if (safeCount === 3) {
    if (isPortrait) {
      return [
        { x: 0.08, y: 0.18, w: 0.56, h: 0.68 },
        { x: 0.68, y: 0.18, w: 0.24, h: 0.32 },
        { x: 0.68, y: 0.54, w: 0.24, h: 0.32 },
      ];
    }
    if (isLandscape) {
      return [
        { x: 0.08, y: 0.16, w: 0.48, h: 0.68 },
        { x: 0.60, y: 0.16, w: 0.32, h: 0.32 },
        { x: 0.60, y: 0.52, w: 0.32, h: 0.32 },
      ];
    }
    return [
      { x: 0.08, y: 0.16, w: 0.84, h: 0.40 },
      { x: 0.08, y: 0.60, w: 0.40, h: 0.28 },
      { x: 0.52, y: 0.60, w: 0.40, h: 0.28 },
    ];
  }

  if (safeCount === 4) {
    return createBoardExampleGridSlots(2, 2);
  }

  if (safeCount === 5) {
    if (isLandscape) {
      return [
        { x: 0.08, y: 0.16, w: 0.44, h: 0.68 },
        ...createBoardExampleGridSlots(2, 2, { x: 0.56, y: 0.16, w: 0.36, h: 0.68 }, 0.024),
      ];
    }
    return [
      { x: 0.08, y: 0.14, w: 0.84, h: 0.34 },
      ...createBoardExampleGridSlots(2, 2, { x: 0.08, y: 0.52, w: 0.84, h: 0.36 }, 0.024),
    ];
  }

  if (safeCount === 6) {
    return isPortrait ? createBoardExampleGridSlots(2, 3) : createBoardExampleGridSlots(3, 2);
  }

  if (safeCount === 7) {
    if (isLandscape) {
      return [
        { x: 0.08, y: 0.16, w: 0.42, h: 0.68 },
        ...createBoardExampleGridSlots(2, 3, { x: 0.54, y: 0.16, w: 0.38, h: 0.68 }, 0.024),
      ];
    }
    return [
      { x: 0.08, y: 0.14, w: 0.84, h: 0.24 },
      ...createBoardExampleGridSlots(3, 2, { x: 0.08, y: 0.42, w: 0.84, h: 0.46 }, 0.024),
    ];
  }

  if (safeCount === 8) {
    return isPortrait ? createBoardExampleGridSlots(2, 4) : createBoardExampleGridSlots(4, 2);
  }

  return createBoardExampleGridSlots(3, 3);
};

const createImageLayer = (
  asset: GalleryBoardAsset,
  slot: GalleryBoardExampleSlot,
  index: number,
  canvas: GalleryBoardCanvasSize
): GalleryBoardDraft['board']['layers'][number] => {
  const x = Math.round(slot.x * canvas.width);
  const y = Math.round(slot.y * canvas.height);
  const w = Math.round(slot.w * canvas.width);
  const h = Math.round(slot.h * canvas.height);
  const radius = Math.round(Math.min(w, h) * 0.08);

  return {
    id: `board-layer-${index + 1}`,
    type: 'image',
    name: `Image ${index + 1}`,
    assetLocalId: asset.localId,
    x,
    y,
    w,
    h,
    fit: 'cover',
    radius,
    opacity: 1,
    showOriginal: false,
    keepAspectRatio: false,
    cropScale: 1,
    cropOffsetX: 0,
    cropOffsetY: 0,
    rotationQuarterTurns: 0,
    flipX: false,
    flipY: false,
  };
};

const createSellingPointTextLayer = (
  imageLayer: GalleryBoardDraft['board']['layers'][number],
  text: string,
  index: number,
  layerId: number
): GalleryBoardDraft['board']['layers'][number] | null => {
  if (imageLayer.type !== 'image') return null;

  const textHeight = Math.round(clampNumber(imageLayer.h * 0.18, 42, Math.max(42, imageLayer.h * 0.28)));
  const padding = Math.round(clampNumber(Math.min(imageLayer.w, imageLayer.h) * 0.035, 8, 24));

  return {
    id: `board-layer-${layerId}`,
    type: 'text',
    name: `Selling Point ${index + 1}`,
    text,
    x: imageLayer.x,
    y: imageLayer.y + imageLayer.h - textHeight,
    w: imageLayer.w,
    h: textHeight,
    fontSize: clampNumber(Math.round(Math.min(imageLayer.w * 0.07, imageLayer.h * 0.14)), 18, 52),
    fontWeight: 800,
    fontFamily: 'Microsoft YaHei',
    color: '#ffffff',
    background: 'rgba(0,0,0,0.48)',
    align: 'center',
    lineHeight: 1.08,
    padding,
  };
};

export const buildGalleryBoardExampleDraft = ({
  assets,
  ratioId,
  title,
  subtitle,
  sellingPoints = [],
}: BuildGalleryBoardExampleDraftOptions): GalleryBoardDraft => {
  const cleanAssets = assets
    .filter((asset) => Boolean(String(asset.imageUrl || '').trim()))
    .slice(0, 9);
  const cleanSellingPoints = sellingPoints
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const canvas = getGalleryBoardExampleCanvasSize(ratioId);
  const safeRatio = normalizeGalleryBoardExampleRatioId(ratioId);
  const slots = buildGalleryBoardExampleSlots(cleanAssets.length, safeRatio);
  const imageLayers = cleanAssets.map((asset, index) =>
    createImageLayer(asset, slots[index] || slots[slots.length - 1], index, canvas)
  );
  const firstTextLayerId = imageLayers.length + 1;
  const headlineText = String(title || '').trim() || 'Gallery Set Example';
  const subtitleText = String(subtitle || '').trim() || `${cleanAssets.length} images / ${safeRatio}`;
  const textLayers: GalleryBoardDraft['board']['layers'] = [
    {
      id: `board-layer-${firstTextLayerId}`,
      type: 'text',
      name: 'Title',
      text: headlineText,
      x: Math.round(canvas.width * 0.06),
      y: Math.round(canvas.height * 0.045),
      w: Math.round(canvas.width * 0.64),
      h: Math.round(canvas.height * 0.07),
      fontSize: clampNumber(Math.round(canvas.width * 0.048), 30, 72),
      fontWeight: 800,
      fontFamily: 'Microsoft YaHei',
      color: '#111111',
      background: 'rgba(255,255,255,0.74)',
      align: 'left',
      lineHeight: 1.08,
      padding: Math.round(canvas.width * 0.012),
    },
    {
      id: `board-layer-${firstTextLayerId + 1}`,
      type: 'text',
      name: 'Subtitle',
      text: subtitleText,
      x: Math.round(canvas.width * 0.06),
      y: Math.round(canvas.height * 0.125),
      w: Math.round(canvas.width * 0.56),
      h: Math.round(canvas.height * 0.042),
      fontSize: clampNumber(Math.round(canvas.width * 0.022), 18, 34),
      fontWeight: 600,
      fontFamily: 'Microsoft YaHei',
      color: '#27272a',
      background: 'rgba(255,255,255,0.56)',
      align: 'left',
      lineHeight: 1.12,
      padding: Math.round(canvas.width * 0.008),
    },
  ];
  const sellingPointTextLayers = cleanSellingPoints.length > 0
    ? imageLayers
        .map((imageLayer, index) =>
          createSellingPointTextLayer(
            imageLayer,
            cleanSellingPoints[index % cleanSellingPoints.length],
            index,
            firstTextLayerId + 2 + index
          )
        )
        .filter((layer): layer is GalleryBoardDraft['board']['layers'][number] => Boolean(layer))
    : [];

  return {
    board: {
      templateId: getGalleryBoardExampleTemplateId(cleanAssets.length, safeRatio),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      background: 'rgba(255,255,255,0)',
      backgroundImageAssetLocalId: null,
      backgroundImageX: 0,
      backgroundImageY: 0,
      backgroundImageW: canvas.width,
      backgroundImageH: canvas.height,
      backgroundImageFit: 'cover',
      backgroundImageOpacity: 1,
      layers: [...imageLayers, ...textLayers, ...sellingPointTextLayers],
      selectedLayerId: imageLayers[0]?.id || null,
      selectedBackground: false,
    },
    selectedAssetLocalIds: cleanAssets.map((asset) => asset.localId),
    zoom: 1,
    templateRatioId: safeRatio,
    gapScale: 0.96,
    cornerRadiusRatio: 0.08,
  };
};
