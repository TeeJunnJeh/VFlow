import type { AgentMessage } from '../../services/agentRuntime';
import { normalizeAgentMediaUrl } from './mediaUrl';
import type { AgentImageEditSource } from './types';

type AssetLike = Record<string, unknown>;

const asRecord = (value: unknown): AssetLike => (
  value && typeof value === 'object' ? value as AssetLike : {}
);

export const readAgentAssetUrl = (value: unknown): string => {
  const item = asRecord(value);
  return normalizeAgentMediaUrl(
    item.url
    || item.path
    || item.image_url
    || item.imageUrl
    || item.video_url
    || item.videoUrl
    || item.video_file
    || item.file_url
    || '',
  );
};

export const readAgentAssetRequestId = (value: unknown): string => {
  const item = asRecord(value);
  return String(item.request_id || item.requestId || item.external_task_id || '').trim();
};

export const isPendingAgentImageAsset = (value: unknown): boolean => {
  const item = asRecord(value);
  if (!Object.keys(item).length || readAgentAssetUrl(item) || !readAgentAssetRequestId(item)) return false;
  const rawKind = String(item.media_kind || item.mediaKind || item.type || '').trim().toLowerCase();
  const status = String(item.status || '').trim().toLowerCase();
  if (['succeeded', 'success', 'done', 'ready', 'failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    return false;
  }
  return ['pending_image', 'pending_video', 'image', 'video', ''].includes(rawKind)
    || ['created', 'processing', 'pending', 'running'].includes(status);
};

export const isFailedAgentImageAsset = (value: unknown): boolean => {
  const item = asRecord(value);
  if (!Object.keys(item).length) return false;
  const status = String(item.status || '').trim().toLowerCase();
  return ['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(status);
};

export const hasPendingAgentImageAssets = (messages: AgentMessage[]): boolean => (
  messages.some((message) => {
    if (message.role !== 'tool') return false;
    const status = String(message.tool_result?.status || '').trim().toLowerCase();
    if (['pending', 'running'].includes(status)) return true;
    const assets = Array.isArray(message.tool_result?.assets) ? message.tool_result.assets : [];
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    return [...assets, ...attachments].some(isPendingAgentImageAsset);
  })
);

export const getMessageRunIds = (message: AgentMessage): string[] => [
  String(message.run_id || ''),
  String(message.tool_result?.run_id || ''),
].filter(Boolean);

export const getMessageEditableImageSources = (message: AgentMessage): AgentImageEditSource[] => {
  if (!message.id) return [];
  const rawAssets: unknown[] = [
    ...(Array.isArray(message.attachments) ? message.attachments : []),
    ...(Array.isArray(message.tool_result?.assets) ? message.tool_result.assets : []),
  ];
  const seen = new Set<string>();

  return rawAssets.flatMap((value) => {
    const asset = asRecord(value);
    const url = readAgentAssetUrl(asset);
    const metadata = asRecord(asset.metadata);
    const kind = String(asset.media_kind || asset.mediaKind || asset.type || 'image').trim().toLowerCase();
    if (!url || !['image', 'photo', 'picture'].includes(kind) || seen.has(url)) return [];
    seen.add(url);
    const derivedFrom = String(
      asset.derived_from || asset.derivedFrom || asset.source_image_url || metadata.derived_from || '',
    ).trim();
    const role = String(asset.role || '').trim();
    return [{
      messageId: String(message.id),
      url,
      name: String(asset.name || asset.filename || '').trim(),
      role,
      derivedFrom,
      versionKind: role === 'edited_image' || Boolean(derivedFrom) ? 'edited' : 'original',
    } satisfies AgentImageEditSource];
  });
};

export const getConversationEditableImageSources = (messages: AgentMessage[]): AgentImageEditSource[] => {
  const seen = new Set<string>();
  const newestFirst = [...messages].reverse().flatMap(getMessageEditableImageSources).filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
  const versionByUrl = new Map<string, number>();
  let editedVersion = 0;
  [...newestFirst].reverse().forEach((source) => {
    if (source.versionKind === 'edited') {
      editedVersion += 1;
      versionByUrl.set(source.url, editedVersion);
    }
  });
  return newestFirst.map((source) => ({ ...source, versionNumber: versionByUrl.get(source.url) }));
};
