import type { GalleryBoardImageFrame } from './galleryBoardDefaultTextLayout';

export type GalleryBoardCopyImageLayer = {
  id: string;
  type: 'image';
  name?: string;
  assetLocalId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type GalleryBoardCopyTextLayer = {
  id: string;
  type: 'text';
  name?: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  linkedImageLayerId?: string | null;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  color?: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  padding?: number;
};

export type GalleryBoardCopyLayer = GalleryBoardCopyImageLayer | GalleryBoardCopyTextLayer;

export type GalleryBoardCopyAsset = {
  localId: string;
  imageUrl?: string | null;
  requestId?: string;
};

export type GalleryBoardCopyItem = {
  imageLayerId: string;
  imageAssetLocalId: string | null;
  imagePath: string;
  currentTextLayerId: string | null;
  currentText: string;
  index: number;
  rect: GalleryBoardImageFrame;
};

export type GalleryBoardCopyDraft = {
  imageLayerId: string;
  currentTextLayerId?: string | null;
  text: string;
  reason?: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const estimateCopyLineCount = (text: string, charsPerLine: number) => {
  const safeCharsPerLine = Math.max(4, Math.floor(charsPerLine));
  const segments = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (segments.length === 0) return 1;

  return segments.reduce((total, line) => {
    let units = 0;
    for (const char of line) {
      if (/\s/.test(char)) {
        units += 0.35;
      } else if (/[\u4e00-\u9fff]/.test(char)) {
        units += 1;
      } else if (/[A-Za-z0-9]/.test(char)) {
        units += 0.62;
      } else {
        units += 0.8;
      }
    }
    return total + Math.max(1, Math.ceil(units / safeCharsPerLine));
  }, 0);
};

const isImageLayer = (layer: GalleryBoardCopyLayer): layer is GalleryBoardCopyImageLayer => layer.type === 'image';
const isTextLayer = (layer: GalleryBoardCopyLayer): layer is GalleryBoardCopyTextLayer => layer.type === 'text';

const isBoardTitleLikeTextLayer = (layer: GalleryBoardCopyTextLayer) => {
  const name = String(layer.name || '').trim().toLowerCase();
  if (!name) return false;
  return ['title', '标题', '標題', '제목', 'tiêu đề', 'tajuk'].includes(name);
};

const findFallbackTextLayer = (layers: GalleryBoardCopyLayer[], imageLayer: GalleryBoardCopyImageLayer) => {
  const candidates = layers
    .filter((layer): layer is GalleryBoardCopyTextLayer => isTextLayer(layer))
    .filter((layer) => !isBoardTitleLikeTextLayer(layer));
  const insideCandidates = candidates.filter((layer) => {
    const withinX = layer.x >= imageLayer.x - 4 && layer.x + layer.w <= imageLayer.x + imageLayer.w + 4;
    const layerBottom = layer.y + layer.h;
    const imageBottom = imageLayer.y + imageLayer.h;
    const startsInLowerHalf = layer.y >= imageLayer.y + imageLayer.h * 0.52;
    const endsNearImageBottom = layerBottom >= imageBottom - imageLayer.h * 0.28 && layerBottom <= imageBottom + 8;
    const withinY = startsInLowerHalf && endsNearImageBottom;
    const widthOk = layer.w <= imageLayer.w + 8;
    return withinX && withinY && widthOk;
  });

  if (insideCandidates.length > 0) {
    return insideCandidates.sort((a, b) => b.y - a.y)[0] || null;
  }

  const overlapping = candidates
    .filter((layer) => {
      const layerBottom = layer.y + layer.h;
      const imageBottom = imageLayer.y + imageLayer.h;
      return layer.y >= imageLayer.y + imageLayer.h * 0.58 && layerBottom >= imageBottom - imageLayer.h * 0.3;
    })
    .map((layer) => {
      const left = Math.max(imageLayer.x, layer.x);
      const top = Math.max(imageLayer.y, layer.y);
      const right = Math.min(imageLayer.x + imageLayer.w, layer.x + layer.w);
      const bottom = Math.min(imageLayer.y + imageLayer.h, layer.y + layer.h);
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      return {
        layer,
        area: width * height,
      };
    })
    .filter((entry) => entry.area > imageLayer.w * imageLayer.h * 0.015)
    .sort((a, b) => b.area - a.area || b.layer.y - a.layer.y);

  return overlapping[0]?.layer || null;
};

export const buildGalleryBoardCopyItems = (params: {
  layers: GalleryBoardCopyLayer[];
  assetsById: Map<string, GalleryBoardCopyAsset>;
}): GalleryBoardCopyItem[] => {
  const { layers, assetsById } = params;
  const imageLayers = layers.filter(isImageLayer);
  const textLayers = layers.filter(isTextLayer);

  const items = imageLayers
    .map<GalleryBoardCopyItem | null>((layer, index) => {
      const asset = layer.assetLocalId ? assetsById.get(layer.assetLocalId) || null : null;
      const imagePath = String(asset?.imageUrl || '').trim();
      if (!imagePath) return null;

      const directTextLayer = textLayers.find((textLayer) => textLayer.linkedImageLayerId === layer.id) || null;
      const fallbackTextLayer = directTextLayer || findFallbackTextLayer(layers, layer);

      return {
        imageLayerId: layer.id,
        imageAssetLocalId: layer.assetLocalId,
        imagePath,
        currentTextLayerId: fallbackTextLayer?.id || null,
        currentText: String(fallbackTextLayer?.text || '').trim(),
        index,
        rect: {
          id: layer.id,
          x: layer.x,
          y: layer.y,
          w: layer.w,
          h: layer.h,
          linkedImageLayerId: layer.id,
        },
      } as GalleryBoardCopyItem;
    })
    .filter((item): item is GalleryBoardCopyItem => item !== null);

  return items;
};

const buildCopyTextLayerLayout = (
  imageLayer: GalleryBoardCopyImageLayer,
  text: string,
  options: {
    layerId: string;
    existingLayer?: GalleryBoardCopyTextLayer | null;
  }
): GalleryBoardCopyTextLayer => {
  const existingLayer = options.existingLayer || null;
  const padding = Math.round(
    clamp(existingLayer?.padding ?? Math.min(imageLayer.w, imageLayer.h) * 0.035, 8, 24)
  );
  const fontSize = clamp(
    Math.round(existingLayer?.fontSize ?? Math.min(imageLayer.w * 0.07, imageLayer.h * 0.14)),
    18,
    52
  );
  const lineHeight = clamp(existingLayer?.lineHeight ?? 1.12, 1.02, 1.3);
  const availableWidth = Math.max(imageLayer.w - padding * 2, 24);
  const charsPerLine = Math.max(4, Math.floor(availableWidth / Math.max(fontSize * 0.92, 1)));
  const lineCount = estimateCopyLineCount(text, charsPerLine);
  const requiredHeight = Math.ceil(lineCount * fontSize * lineHeight + padding * 2);
  const minHeight = Math.max(44, Math.round(imageLayer.h * 0.16));
  const maxHeight = Math.max(minHeight, Math.round(imageLayer.h - 8));
  const textHeight = clamp(requiredHeight, minHeight, maxHeight);
  const background = existingLayer?.background || 'rgba(0,0,0,0.48)';

  return {
    id: options.layerId,
    type: 'text',
    name: `Selling Point ${imageLayer.id}`,
    text,
    x: imageLayer.x,
    y: imageLayer.y + imageLayer.h - textHeight,
    w: imageLayer.w,
    h: textHeight,
    linkedImageLayerId: imageLayer.id,
    fontSize,
    fontWeight: existingLayer?.fontWeight ?? 800,
    fontFamily: existingLayer?.fontFamily || 'Microsoft YaHei',
    color: existingLayer?.color || '#ffffff',
    background,
    align: existingLayer?.align || 'center',
    lineHeight,
    padding,
  };
};

const buildDefaultCopyTextLayer = (imageLayer: GalleryBoardCopyImageLayer, text: string, layerId: string): GalleryBoardCopyTextLayer =>
  buildCopyTextLayerLayout(imageLayer, text, { layerId });

export const applyGalleryBoardCopyDrafts = (params: {
  layers: GalleryBoardCopyLayer[];
  drafts: GalleryBoardCopyDraft[];
  createLayerId: (index: number) => string;
}): GalleryBoardCopyLayer[] => {
  const { layers, drafts, createLayerId } = params;
  const draftMap = new Map(drafts.map((draft) => [draft.imageLayerId, draft] as const));
  const imageById = new Map(layers.filter(isImageLayer).map((layer) => [layer.id, layer] as const));
  const textById = new Map(layers.filter(isTextLayer).map((layer) => [layer.id, layer] as const));
  const existingTextByImageId = new Map(
    layers
      .filter(isTextLayer)
      .filter((layer) => Boolean(layer.linkedImageLayerId))
      .map((layer) => [String(layer.linkedImageLayerId), layer] as const)
  );
  drafts.forEach((draft) => {
    const currentTextLayer = draft.currentTextLayerId ? textById.get(draft.currentTextLayerId) : null;
    if (currentTextLayer && !existingTextByImageId.has(draft.imageLayerId)) {
      existingTextByImageId.set(draft.imageLayerId, currentTextLayer);
    }
  });

  const nextLayers: GalleryBoardCopyLayer[] = [];
  let createdCount = 0;

  for (const layer of layers) {
    if (isImageLayer(layer)) {
      nextLayers.push(layer);
      const draft = draftMap.get(layer.id);
      if (!draft) continue;
      if (existingTextByImageId.has(layer.id)) continue;
      createdCount += 1;
      nextLayers.push(buildDefaultCopyTextLayer(layer, draft.text, createLayerId(createdCount)));
      continue;
    }

    const legacyDraft = drafts.find((draft) => draft.currentTextLayerId === layer.id);
    if (legacyDraft) {
      const imageLayer = imageById.get(legacyDraft.imageLayerId);
      if (imageLayer) {
        nextLayers.push(
          buildCopyTextLayerLayout(imageLayer, legacyDraft.text, {
            layerId: layer.id,
            existingLayer: layer,
          })
        );
        continue;
      }
      nextLayers.push({
        ...layer,
        text: legacyDraft.text,
        linkedImageLayerId: legacyDraft.imageLayerId,
      });
      continue;
    }

    if (!layer.linkedImageLayerId) {
      nextLayers.push(layer);
      continue;
    }

    const draft = draftMap.get(layer.linkedImageLayerId);
    if (!draft) {
      nextLayers.push(layer);
      continue;
    }

    const imageLayer = imageById.get(layer.linkedImageLayerId);
    if (imageLayer) {
      nextLayers.push(
        buildCopyTextLayerLayout(imageLayer, draft.text, {
          layerId: layer.id,
          existingLayer: layer,
        })
      );
      continue;
    }

    nextLayers.push({
      ...layer,
      text: draft.text,
      linkedImageLayerId: layer.linkedImageLayerId,
    });
  }

  for (const draft of drafts) {
    if (existingTextByImageId.has(draft.imageLayerId)) continue;
    const imageLayer = imageById.get(draft.imageLayerId);
    if (!imageLayer) continue;
    const alreadyCreated = nextLayers.some((layer) => layer.type === 'text' && layer.linkedImageLayerId === draft.imageLayerId);
    if (alreadyCreated) continue;
    createdCount += 1;
    nextLayers.push(buildDefaultCopyTextLayer(imageLayer, draft.text, createLayerId(createdCount)));
  }

  return nextLayers;
};
