import { assetsApi } from '../../services/assets';
import type { SeedSkillWorkflowAsset } from '../../services/video';

export type CreativePromptMaterialKind = 'image' | 'video' | 'file';

export type CreativePromptMaterial = {
  id: string;
  name: string;
  kind: CreativePromptMaterialKind;
  previewUrl: string;
  file?: File;
  uploadedPath?: string;
  publicUrl?: string;
  source: 'local' | 'example' | 'history';
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const toCreativePromptDisplayUrl = (pathOrUrl: string | null | undefined): string => {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const mediaBaseUrl = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';
  return mediaBaseUrl && normalized.startsWith('/media/') ? `${mediaBaseUrl}${normalized}` : normalized;
};

const toWorkflowAssetUrl = (pathOrUrl: string | null | undefined): string => {
  const raw = String(pathOrUrl || '').trim();
  if (!raw || raw.startsWith('blob:') || raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const inferKind = (file: File): CreativePromptMaterialKind => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
};

const extractUploadedPath = (response: any): string => {
  const data = response?.data || response?.asset || (Array.isArray(response?.assets) ? response.assets[0] : null) || response;
  return String(
    data?.path || data?.url || data?.file_url || data?.media_url || data?.relative_path || '',
  ).trim();
};

export const makeCreativePromptMaterial = (
  file: File,
  source: CreativePromptMaterial['source'] = 'local',
): CreativePromptMaterial => ({
  id: makeId(),
  name: file.name,
  kind: inferKind(file),
  previewUrl: URL.createObjectURL(file),
  file,
  source,
});

export const materialFromWorkflowAsset = (
  asset: SeedSkillWorkflowAsset,
  index: number,
): CreativePromptMaterial => {
  const kind: CreativePromptMaterialKind = asset.kind === 'video' ? 'video' : asset.kind === 'image' ? 'image' : 'file';
  const stableUrl = asset.public_url || asset.path;
  return {
    id: `history-${index}-${makeId()}`,
    name: asset.original_name || asset.path.split('/').pop() || `素材 ${index + 1}`,
    kind,
    previewUrl: toCreativePromptDisplayUrl(stableUrl),
    uploadedPath: asset.path,
    publicUrl: toWorkflowAssetUrl(stableUrl),
    source: 'history',
  };
};

export const revokeCreativePromptMaterials = (items: CreativePromptMaterial[]) => {
  items.forEach((item) => {
    if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
  });
};

export const uploadCreativePromptMaterials = async (
  items: CreativePromptMaterial[],
  onStatus?: (message: string) => void,
): Promise<{ assets: SeedSkillWorkflowAsset[]; materials: CreativePromptMaterial[] }> => {
  const assets: SeedSkillWorkflowAsset[] = [];
  const materials: CreativePromptMaterial[] = [];

  for (const item of items) {
    let uploadedPath = String(item.uploadedPath || '').trim();
    if (!uploadedPath && item.file) {
      onStatus?.(`正在上传 ${item.name}`);
      uploadedPath = extractUploadedPath(await assetsApi.uploadTempAsset(item.file));
    }
    if (!uploadedPath) throw new Error(`素材没有可用路径：${item.name}`);

    const publicUrl = toWorkflowAssetUrl(item.publicUrl)
      || toWorkflowAssetUrl(item.previewUrl)
      || toWorkflowAssetUrl(uploadedPath);
    assets.push({
      path: uploadedPath,
      kind: item.kind,
      original_name: item.name,
      public_url: publicUrl,
    });
    materials.push({ ...item, uploadedPath, publicUrl });
  }

  return { assets, materials };
};
