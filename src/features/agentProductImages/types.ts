import type { AgentAction, AgentAssetRef } from '../../services/agentRuntime';

export type AgentProductImageToolName =
  | 'generate_clothing_swap'
  | 'generate_first_frame'
  | 'generate_ai_model'
  | 'generate_product_gallery'
  | 'edit_product_poster';

export type AgentProductImageAssetField =
  | 'model_image'
  | 'garment_image'
  | 'background_image'
  | 'reference_images'
  | 'person_image'
  | 'product_images'
  | 'source_image';

export type AgentGalleryOutputType = 'white_bg' | 'scene' | 'selling_point' | 'cover' | 'poster';

export interface AgentGalleryOutputItem {
  output_type: AgentGalleryOutputType;
  enabled: boolean;
  count: number;
  aspect_ratio: string;
  resolution: string;
  prompt?: string;
}

export const GALLERY_OUTPUT_TYPES: AgentGalleryOutputType[] = ['white_bg', 'scene', 'selling_point', 'cover', 'poster'];

export const DEFAULT_GALLERY_OUTPUT_ITEMS: AgentGalleryOutputItem[] = GALLERY_OUTPUT_TYPES.map((outputType) => ({
  output_type: outputType,
  enabled: outputType !== 'poster',
  count: 1,
  aspect_ratio: '1:1',
  resolution: '1k',
}));

export interface AgentConversationImage extends AgentAssetRef {
  source: 'conversation';
  message_id: string;
}

export const PRODUCT_IMAGE_TOOL_NAMES = new Set<string>([
  'generate_clothing_swap',
  'generate_first_frame',
  'generate_ai_model',
  'generate_product_gallery',
  'edit_product_poster',
  'clothing_swap',
]);

export const PRODUCT_IMAGE_ASPECT_RATIOS: Record<AgentProductImageToolName, string[]> = {
  generate_clothing_swap: ['16:9', '9:16', '1:1', '2:3', '3:4', '4:5', '5:4', '4:3', '3:2', '21:9'],
  generate_first_frame: ['9:16', '1:1', '2:3', '3:4', '4:5', '16:9', '3:2', '4:3', '5:4', '21:9'],
  generate_ai_model: ['3:4', '4:5', '2:3', '1:1', '9:16', '16:9'],
  generate_product_gallery: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
  edit_product_poster: ['1:1'],
};

export const canonicalProductImageToolName = (value: string): AgentProductImageToolName | null => {
  if (value === 'clothing_swap') return 'generate_clothing_swap';
  if (
    value === 'generate_clothing_swap'
    || value === 'generate_first_frame'
    || value === 'generate_ai_model'
    || value === 'generate_product_gallery'
    || value === 'edit_product_poster'
  ) {
    return value;
  }
  return null;
};

export const isProductImageAction = (action?: AgentAction | null): boolean => (
  Boolean(action && canonicalProductImageToolName(action.type))
);

const clampCount = (value: unknown, fallback: number) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.max(1, Math.min(4, parsed)) : fallback;
};

const clampGalleryCount = (value: unknown) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.max(1, Math.min(8, parsed)) : 1;
};

export const readAgentAssetRef = (value: unknown): AgentAssetRef | null => {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const url = String(item.url || '').trim();
  const assetId = String(item.asset_id || '').trim();
  if (!url && !assetId) return null;
  return {
    source: (['conversation', 'library', 'temp_upload'].includes(String(item.source))
      ? item.source
      : assetId ? 'library' : 'conversation') as AgentAssetRef['source'],
    url,
    name: String(item.name || ''),
    role: String(item.role || ''),
    message_id: String(item.message_id || ''),
    asset_id: assetId,
  };
};

export const readAgentAssetRefs = (value: unknown): AgentAssetRef[] => (
  Array.isArray(value) ? value.map(readAgentAssetRef).filter((item): item is AgentAssetRef => Boolean(item)) : []
);

export const normalizeGalleryOutputItems = (value: unknown): AgentGalleryOutputItem[] => {
  const hasExplicitItems = Array.isArray(value);
  const byType = new Map<AgentGalleryOutputType, Record<string, unknown>>();
  if (hasExplicitItems) {
    value.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const item = raw as Record<string, unknown>;
      const outputType = String(item.output_type || item.outputType || '') as AgentGalleryOutputType;
      if (GALLERY_OUTPUT_TYPES.includes(outputType) && !byType.has(outputType)) byType.set(outputType, item);
    });
  }
  let remaining = 20;
  return DEFAULT_GALLERY_OUTPUT_ITEMS.map((fallback) => {
    const raw = byType.get(fallback.output_type);
    const requestedEnabled = raw ? raw.enabled !== false : hasExplicitItems ? false : fallback.enabled;
    const enabled = requestedEnabled && remaining > 0;
    const count = enabled ? Math.min(clampGalleryCount(raw?.count), remaining) : 1;
    if (enabled) remaining -= count;
    const ratio = String(raw?.aspect_ratio || raw?.aspectRatio || fallback.aspect_ratio);
    const resolution = String(raw?.resolution || fallback.resolution).toLowerCase();
    return {
      output_type: fallback.output_type,
      enabled,
      count,
      aspect_ratio: PRODUCT_IMAGE_ASPECT_RATIOS.generate_product_gallery.includes(ratio) ? ratio : '1:1',
      resolution: ['1k', '2k', '4k'].includes(resolution) ? resolution : '1k',
      prompt: String(raw?.prompt || '').trim(),
    };
  });
};

export const normalizeProductImageParams = (
  toolName: AgentProductImageToolName,
  raw: Record<string, unknown> = {},
): Record<string, unknown> => {
  if (toolName === 'generate_clothing_swap') {
    return {
      category: 'Top',
      target_color: 'Original',
      background: 'model',
      custom_background_prompt: '',
      aspect_ratio: '16:9',
      ...raw,
      output_count: clampCount(raw.output_count, 1),
    };
  }
  if (toolName === 'generate_first_frame') {
    return {
      opening_scene: 'person_selling',
      aspect_ratio: '9:16',
      resolution: '1k',
      ...raw,
      reference_images: Array.isArray(raw.reference_images) ? raw.reference_images.slice(0, 4) : [],
      output_count: clampCount(raw.output_count, 4),
      frame_type: 'first',
      model: 'nano-banana-pro',
    };
  }
  if (toolName === 'generate_product_gallery') {
    return {
      product_name: '',
      product_category: '',
      prompt: '',
      core_selling_points: [],
      target_scene: '',
      style: '',
      model_info: '',
      scene_config: {},
      generation_model: 'nano-banana-pro',
      ...raw,
      product_images: readAgentAssetRefs(raw.product_images).slice(0, 3),
      model_image: readAgentAssetRef(raw.model_image),
      output_items: normalizeGalleryOutputItems(raw.output_items),
    };
  }
  if (toolName === 'edit_product_poster') {
    return {
      sample_title: '',
      ...raw,
      source_image: readAgentAssetRef(raw.source_image),
    };
  }
  return {
    mode: 'virtual',
    gender: 'female',
    age_range: '25-35',
    style: 'commercial',
    outfit: '',
    background: '',
    styling: '',
    body_framing: 'full_body',
    negative_prompt: '',
    aspect_ratio: '3:4',
    ...raw,
    output_count: clampCount(raw.output_count, 1),
  };
};

const hasAsset = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Record<string, unknown>;
  return Boolean(String(asset.url || asset.asset_id || '').trim());
};

export const getMissingProductImageFields = (
  toolName: AgentProductImageToolName,
  params: Record<string, unknown>,
): string[] => {
  if (toolName === 'generate_clothing_swap') {
    const missing = [];
    if (!hasAsset(params.model_image)) missing.push('model_image');
    if (!hasAsset(params.garment_image)) missing.push('garment_image');
    if (params.background === 'custom' && !String(params.custom_background_prompt || '').trim()) {
      missing.push('custom_background_prompt');
    }
    if (params.background === 'background_image' && !hasAsset(params.background_image)) {
      missing.push('background_image');
    }
    return missing;
  }
  if (toolName === 'generate_first_frame') {
    const refs = Array.isArray(params.reference_images) ? params.reference_images : [];
    return refs.some(hasAsset) ? [] : ['reference_images'];
  }
  if (toolName === 'generate_product_gallery') {
    const refs = readAgentAssetRefs(params.product_images);
    const items = normalizeGalleryOutputItems(params.output_items);
    const enabledCount = items.filter((item) => item.enabled).reduce((sum, item) => sum + item.count, 0);
    const missing = [];
    if (refs.length === 0) missing.push('product_images');
    if (enabledCount < 1 || enabledCount > 20) missing.push('output_items');
    return missing;
  }
  if (toolName === 'edit_product_poster') {
    return hasAsset(params.source_image) ? [] : ['source_image'];
  }
  const missing = [];
  if (!String(params.prompt || '').trim()) missing.push('prompt');
  if (params.mode === 'real' && !hasAsset(params.person_image)) missing.push('person_image');
  return missing;
};

export const assetFieldRole = (field: AgentProductImageAssetField): string => ({
  model_image: 'model_image',
  garment_image: 'garment_image',
  background_image: 'background_image',
  reference_images: 'reference_image',
  person_image: 'real_person_image',
  product_images: 'product_image',
  source_image: 'poster_image',
})[field];
