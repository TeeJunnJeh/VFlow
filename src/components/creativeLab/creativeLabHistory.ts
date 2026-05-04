import type { Asset } from '../../services/assets';

export type CreativeLabAssetSnapshot = {
  id: string;
  name: string;
  type: string;
  file_url: string;
  thumbnail?: string;
  media_kind?: string;
  seedance_asset_id?: string;
};

export type CreativeLabMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  status?: 'idle' | 'pending' | 'processing' | 'success' | 'failed' | 'extracting';
  assets?: CreativeLabAssetSnapshot[];
  taskId?: string | number;
  projectId?: string;
  script?: string;
  scriptExpanded?: boolean;
  videoUrl?: string;
  downloadUrl?: string;
  coverUrl?: string;
  result?: Record<string, unknown>;
  error?: string;
  recovery?: 'reference_video_rejected' | 'product_or_model_rejected' | 'none';
};

export type CreativeLabSession = {
  id: string;
  feature: 'viral_replay' | 'script_extract';
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: CreativeLabMessage[];
};

const keyFor = (userId: string | number | undefined, feature: CreativeLabSession['feature']) =>
  `vflow_creative_lab_${feature}_${userId || 'guest'}_v1`;

export const snapshotAsset = (asset: Asset): CreativeLabAssetSnapshot => ({
  id: asset.id,
  name: asset.name,
  type: asset.type,
  file_url: asset.file_url,
  thumbnail: asset.thumbnail,
  media_kind: asset.media_kind,
  seedance_asset_id: String(asset.meta_data?.seedance_asset_id || '').trim() || undefined,
});

export const loadCreativeLabSession = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
): CreativeLabSession => {
  const fallback: CreativeLabSession = {
    id: `${feature}-${Date.now()}`,
    feature,
    title: feature === 'viral_replay' ? '爆款复刻' : '脚本提取',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(keyFor(userId, feature));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.messages)) return fallback;
    return {
      ...fallback,
      ...parsed,
      feature,
      messages: parsed.messages,
    };
  } catch {
    return fallback;
  }
};

export const saveCreativeLabSession = (userId: string | number | undefined, session: CreativeLabSession) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(userId, session.feature), JSON.stringify({
      ...session,
      updatedAt: Date.now(),
    }));
  } catch {
    // ignore local storage failures
  }
};

export const clearCreativeLabSession = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(userId, feature));
  } catch {
    // ignore local storage failures
  }
};
