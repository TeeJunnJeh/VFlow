import React, { useState } from 'react';
import {
  Download,
  FolderPlus,
  ImagePlus,
  Images,
  Loader2,
  Save,
  Shirt,
  Type,
  UserRound,
  Wand2,
  X,
} from 'lucide-react';
import type { AgentAttachment, AgentMessage } from '../../services/agentRuntime';
import { assetsApi } from '../../services/assets';
import { formatApiError } from '../../services/errors';
import { downloadUrlDirectly } from '../../utils/browserDownload';
import { AgentImageEditButton } from '../agentImageEditing/AgentImageEditButton';
import { AgentImagePreview } from '../agentImageEditing/AgentImagePreview';
import {
  getMessageEditableImageSources,
  isFailedAgentImageAsset,
  isPendingAgentImageAsset,
  readAgentAssetUrl,
} from '../agentImageEditing/imageSources';
import type { AgentImageEditSource } from '../agentImageEditing/types';
import { getAgentProductImagesCopy } from './i18n';
import { readAgentPosterEditorData, type AgentPosterEditorData } from './posterEditorData';
import { canonicalProductImageToolName, type AgentProductImageToolName } from './types';

interface AgentProductImageResultCardProps {
  message: AgentMessage;
  language: string;
  embedded?: boolean;
  submitting?: boolean;
  editLabel: string;
  loadFailedLabel: string;
  retryLoadLabel: string;
  openOriginalLabel: string;
  onOpen: (attachment: AgentAttachment, source: AgentImageEditSource | null) => void;
  onEdit: (source: AgentImageEditSource) => void;
  onRetry: () => void;
  onSaveRecipe: () => void;
  onOpenPosterEditor: (data: AgentPosterEditorData) => void;
  onError: (title: string, message: string) => void;
}

type ProductResultAsset = Record<string, unknown>;

const getToolAssets = (message: AgentMessage): ProductResultAsset[] => {
  const primary: unknown[] = Array.isArray(message.tool_result?.assets) && message.tool_result.assets.length > 0
    ? message.tool_result.assets
    : Array.isArray(message.attachments) ? message.attachments : [];
  return primary
    .filter((asset): asset is ProductResultAsset => Boolean(asset && typeof asset === 'object'))
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
};

const toolIcon = (toolName: AgentProductImageToolName) => {
  if (toolName === 'generate_clothing_swap') return <Shirt className="h-4 w-4" />;
  if (toolName === 'generate_first_frame') return <ImagePlus className="h-4 w-4" />;
  if (toolName === 'generate_product_gallery') return <Images className="h-4 w-4" />;
  if (toolName === 'edit_product_poster') return <Type className="h-4 w-4" />;
  return <UserRound className="h-4 w-4" />;
};

const toolTitle = (toolName: AgentProductImageToolName, copy: ReturnType<typeof getAgentProductImagesCopy>) => {
  if (toolName === 'generate_clothing_swap') return copy.clothingSwap;
  if (toolName === 'generate_first_frame') return copy.firstFrame;
  if (toolName === 'generate_product_gallery') return copy.productGallery;
  if (toolName === 'edit_product_poster') return copy.posterEditor;
  return copy.aiModel;
};

const downloadName = (toolName: AgentProductImageToolName, url: string, index: number) => {
  const fromUrl = decodeURIComponent(url.split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || '');
  if (/\.[a-z0-9]{2,5}$/i.test(fromUrl)) return fromUrl;
  return `${toolName}-${index + 1}.png`;
};

const ASPECT_RATIO_CLASSES: Record<string, string> = {
  '1:1': 'aspect-square',
  '2:3': 'aspect-[2/3]',
  '3:2': 'aspect-[3/2]',
  '3:4': 'aspect-[3/4]',
  '4:3': 'aspect-[4/3]',
  '4:5': 'aspect-[4/5]',
  '5:4': 'aspect-[5/4]',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
  '21:9': 'aspect-[21/9]',
};

const resultAspectRatioClass = (message: AgentMessage, toolName: AgentProductImageToolName) => {
  const defaults: Record<AgentProductImageToolName, string> = {
    generate_clothing_swap: '16:9',
    generate_first_frame: '9:16',
    generate_ai_model: '3:4',
    generate_product_gallery: '1:1',
    edit_product_poster: '1:1',
  };
  const ratio = String(message.action?.params?.aspect_ratio || message.metadata?.params?.aspect_ratio || defaults[toolName]);
  return ASPECT_RATIO_CLASSES[ratio] || ASPECT_RATIO_CLASSES[defaults[toolName]];
};

const assetAspectRatioClass = (asset: ProductResultAsset, fallback: string) => {
  const ratio = String(asset.aspect_ratio || '').trim();
  return ASPECT_RATIO_CLASSES[ratio] || fallback;
};

export const AgentProductImageResultCard: React.FC<AgentProductImageResultCardProps> = ({
  message,
  language,
  embedded = false,
  submitting = false,
  editLabel,
  loadFailedLabel,
  retryLoadLabel,
  openOriginalLabel,
  onOpen,
  onEdit,
  onRetry,
  onSaveRecipe,
  onOpenPosterEditor,
  onError,
}) => {
  const copy = getAgentProductImagesCopy(language);
  const toolName = canonicalProductImageToolName(String(message.tool_result?.tool_name || message.metadata?.tool_name || ''));
  const [addingUrls, setAddingUrls] = useState<Set<string>>(() => new Set());
  const [addedUrls, setAddedUrls] = useState<Set<string>>(() => new Set());
  if (!toolName) return null;

  const assets = getToolAssets(message);
  const rawStatus = String(message.tool_result?.status || 'succeeded').trim().toLowerCase();
  const pendingCount = assets.filter(isPendingAgentImageAsset).length;
  const failedCount = assets.filter(isFailedAgentImageAsset).length;
  const successCount = assets.filter((asset) => Boolean(readAgentAssetUrl(asset))).length;
  const running = ['pending', 'running'].includes(rawStatus) || pendingCount > 0;
  const failed = !running && successCount === 0 && (rawStatus === 'failed' || failedCount > 0);
  const partial = !running && successCount > 0 && failedCount > 0;
  const statusLabel = running ? copy.generating : failed ? copy.failed : partial ? copy.partial : copy.done;
  const statusClass = running
    ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
    : failed
      ? 'bg-red-500/15 text-red-200 ring-1 ring-red-500/20'
      : 'bg-emerald-500/10 text-emerald-300';
  const cardClass = failed
    ? 'border-red-500/25 bg-red-950/30 text-red-100'
    : running
      ? 'border-amber-500/20 bg-zinc-900 text-zinc-300'
      : 'border-white/10 bg-zinc-900 text-zinc-300';
  const runId = String(message.tool_result?.run_id || message.run_id || '');
  const editableSources = getMessageEditableImageSources(message);
  const frameClass = resultAspectRatioClass(message, toolName);
  const posterEditorData = toolName === 'edit_product_poster'
    ? readAgentPosterEditorData(message.tool_result?.data)
    : null;

  const addToModelLibrary = async (asset: ProductResultAsset) => {
    const url = readAgentAssetUrl(asset);
    if (!url || addingUrls.has(url) || addedUrls.has(url)) return;
    setAddingUrls((previous) => new Set(previous).add(url));
    try {
      await assetsApi.createAIModelAsset({
        imageUrl: url,
        modelKind: String(asset.model_kind || 'virtual') === 'real' ? 'real' : 'virtual',
        displayName: String(asset.name || ''),
        historyRecordId: String(asset.history_record_id || ''),
        historyAssetId: String(asset.history_asset_id || asset.asset_id || ''),
      });
      setAddedUrls((previous) => new Set(previous).add(url));
    } catch (error: unknown) {
      onError(toolTitle(toolName, copy), formatApiError(error, copy.saveFailed));
    } finally {
      setAddingUrls((previous) => {
        const next = new Set(previous);
        next.delete(url);
        return next;
      });
    }
  };

  const card = (
    <div className={`w-full max-w-[560px] overflow-hidden rounded-lg border text-sm ${cardClass}`}>
      <div className="flex items-center gap-2 bg-zinc-950/60 px-4 py-3">
        {toolIcon(toolName)}
        <span className="font-semibold text-zinc-200">{toolTitle(toolName, copy)}</span>
        <span className={`ml-1 rounded-md px-2 py-0.5 text-[11px] ${statusClass}`}>{statusLabel}</span>
        {runId && !running && !failed && failedCount === 0 && (
          <button type="button" onClick={onSaveRecipe} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:bg-zinc-700">
            <Save className="h-3.5 w-3.5" />{copy.saveRecipe}
          </button>
        )}
      </div>

      {(failed || (running && message.content)) && (
        <div className={`border-t border-white/10 px-4 py-3 text-xs ${failed ? 'text-red-300' : 'text-zinc-400'}`}>
          {message.tool_result?.error_message || message.content}
        </div>
      )}

      {assets.length > 0 && (
        <div className={`grid border-t border-white/10 ${assets.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {assets.map((asset, index) => {
            const url = readAgentAssetUrl(asset);
            const pending = isPendingAgentImageAsset(asset);
            const source = url ? editableSources.find((item) => item.url === url) || null : null;
            const adding = Boolean(url && addingUrls.has(url));
            const added = Boolean(url && addedUrls.has(url));
            const assetFrameClass = assetAspectRatioClass(asset, frameClass);
            const role = String(asset.output_type || asset.role || '');
            const roleLabel = toolName === 'generate_product_gallery'
              ? ({ white_bg: copy.whiteBg, scene: copy.sceneImage, selling_point: copy.sellingPointImage, cover: copy.coverImage, poster: copy.posterImage } as Record<string, string>)[role]
              : toolName === 'edit_product_poster'
                ? role === 'poster_clean' ? copy.cleanPoster : copy.originalPoster
                : '';
            return (
              <div key={String(asset.request_id || asset.history_asset_id || asset.asset_id || url || index)} className="group relative min-w-0 border-b border-r border-white/10 bg-black last:border-r-0">
                {url ? (
                  <AgentImagePreview
                    src={url}
                    alt={String(asset.name || `${toolTitle(toolName, copy)} ${index + 1}`)}
                    imageClassName={`block w-full bg-black object-contain ${assetFrameClass}`}
                    fallbackClassName={`w-full ${assetFrameClass}`}
                    loadFailedLabel={loadFailedLabel}
                    retryLabel={retryLoadLabel}
                    openOriginalLabel={openOriginalLabel}
                    onOpen={() => onOpen({ ...asset, url, media_kind: 'image' } as AgentAttachment, source)}
                  />
                ) : pending ? (
                  <div className={`flex w-full flex-col items-center justify-center gap-2 bg-zinc-950 text-amber-400 ${assetFrameClass}`}>
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="px-2 text-center text-[11px]">{copy.pendingImage}</span>
                  </div>
                ) : (
                  <div className={`flex w-full flex-col items-center justify-center gap-2 bg-red-950/40 px-3 text-center text-red-300 ${assetFrameClass}`}>
                    <X className="h-5 w-5" />
                    <span className="text-[11px]">{String(asset.error_message || copy.failedImage)}</span>
                  </div>
                )}

                {url && (
                  <button
                    type="button"
                    onClick={() => void downloadUrlDirectly(url, downloadName(toolName, url, index))}
                    title={copy.download}
                    className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-black/75 text-white opacity-100 shadow-lg backdrop-blur transition hover:bg-zinc-700 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}
                {source && (
                  <AgentImageEditButton
                    label={editLabel}
                    onClick={() => onEdit(source)}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-black/75 text-white opacity-100 shadow-lg backdrop-blur transition hover:bg-blue-600 sm:opacity-0 sm:group-hover:opacity-100"
                  />
                )}
                {toolName === 'generate_ai_model' && url && (
                  <button
                    type="button"
                    disabled={adding || added}
                    onClick={() => void addToModelLibrary(asset)}
                    className="absolute bottom-2 left-2 right-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-black/80 px-2 py-1.5 text-[11px] font-semibold text-white backdrop-blur transition hover:bg-orange-600 disabled:cursor-default disabled:bg-emerald-700/90"
                  >
                    {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
                    {adding ? copy.addingModel : added ? copy.resultModelAdded : copy.addModel}
                  </button>
                )}
                {roleLabel && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/75 px-2 py-1 text-[10px] font-medium text-zinc-200 backdrop-blur">
                    {roleLabel}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {posterEditorData && !running && !failed && (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <span className="text-xs text-zinc-400">{copy.detectedTextBlocks}: {posterEditorData.text_blocks.length}</span>
          <button type="button" onClick={() => onOpenPosterEditor(posterEditorData)} className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-500">
            <Type className="h-3.5 w-3.5" />{copy.openPosterEditor}
          </button>
        </div>
      )}

      {!running && (failed || failedCount > 0) && (
        <div className="border-t border-white/10 px-4 py-3">
          <button type="button" onClick={onRetry} disabled={submitting} className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-50">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {toolName === 'generate_clothing_swap' || toolName === 'edit_product_poster' ? copy.retryAll : copy.retryFailed}
          </button>
        </div>
      )}
    </div>
  );

  return embedded ? card : <div className="flex justify-start">{card}</div>;
};
