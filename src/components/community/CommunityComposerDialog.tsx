import React from 'react';
import { Film, Image as ImageIcon, Library, Loader2, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { AssetLibraryPickerDialog, type AssetLibraryPickedAsset, type AssetLibraryPickerTabConfig } from '../productImages/Common/AssetLibraryPickerDialog';
import { CommunityHistoryPicker, type CommunityHistoryPicked } from './CommunityHistoryPicker';
import { videoApi } from '../../services/video';
import { getImageHistoryDetail } from '../../utils/imageHistory';
import type { CommunityCreateDraft, CommunityCreationDetails, CommunityMediaRef, CommunityPost, CommunityPostType } from '../../services/community';

type CommunityAssetTab = 'product' | 'motion' | 'audio' | 'script' | 'model' | 'scene';

const COMMUNITY_ASSET_TABS: AssetLibraryPickerTabConfig<CommunityAssetTab>[] = [
  { key: 'product', assetType: 'product', fallbackLabel: 'Images' },
  { key: 'motion', assetType: 'motion', fallbackLabel: 'Videos' },
  { key: 'audio', assetType: 'audio', fallbackLabel: 'Audio' },
  { key: 'script', assetType: 'script', fallbackLabel: 'Scripts' },
  { key: 'model', assetType: 'model', fallbackLabel: 'Models' },
  { key: 'scene', assetType: 'scene', fallbackLabel: 'Scenes' },
];

interface PickedLibraryAsset {
  id: string;
  name: string;
  assetType: string;
  fileUrl: string;
  thumbnail?: string;
}

interface ComposerHistoryItem {
  kind: 'image' | 'video';
  url: string;
  name: string;
  thumbnail_url?: string;
  source_project_id?: string;
  source_history_id?: string;
  feature_type?: string;
  creationDetails?: CommunityCreationDetails | null;
  detailsLoading?: boolean;
  detailsError?: boolean;
}

const asRecord = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

const firstValue = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null && value !== '');

const IMAGE_FEATURE_LABELS: Record<string, string> = {
  first_frame: '首帧生成',
  gallery: '商品套图',
  text_separation: '文字分离',
  smart_repair: '智能修复',
  clothing_swap: 'AI 换装',
  ai_model: 'AI 模特',
};

const extractCreationDetails = (detail: any): CommunityCreationDetails | null => {
  const requestPayload = asRecord(detail?.request_payload);
  const modelRequest = asRecord(detail?.model_request);
  const scriptContent = asRecord(detail?.script_content);
  const nestedScript = asRecord(requestPayload.script_content);
  const workflow = asRecord(scriptContent.workflow);
  const recipe = asRecord(workflow.recipe);
  const inputSnapshot = asRecord(detail?.input_snapshot);
  const outputSnapshot = asRecord(detail?.output_snapshot);
  const imageSettings = asRecord(firstValue(detail?.settings, inputSnapshot.settings, inputSnapshot));
  const imageMetadata = asRecord(firstValue(detail?.metadata, outputSnapshot.metadata, outputSnapshot));
  const imagePlan = asRecord(firstValue(inputSnapshot.plan, imageSettings.plan));
  const outputRequests = Array.isArray(outputSnapshot.requests) ? outputSnapshot.requests : [];
  const firstOutputRequest = asRecord(outputRequests[0]);
  const constraints = firstValue(recipe.constraint_terms, requestPayload.constraints, nestedScript.constraints);
  const prompt = String(firstValue(
    workflow.final_prompt,
    requestPayload.prompt,
    requestPayload.video_prompt,
    requestPayload.video_description,
    nestedScript.video_description,
    nestedScript.prompt,
    modelRequest.prompt,
    imageSettings.prompt,
    inputSnapshot.prompt,
    imagePlan.prompt,
    firstOutputRequest.prompt,
  ) || '').trim();
  const width = Number(firstValue(imageSettings.width, inputSnapshot.width));
  const height = Number(firstValue(imageSettings.height, inputSnapshot.height));
  const derivedSize = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? `${width}×${height}` : '';
  const details: CommunityCreationDetails = {
    feature_type: String(firstValue(detail?.feature_type, imageSettings.feature_type) || '').trim() || undefined,
    model: String(firstValue(requestPayload.model, requestPayload.generation_model, modelRequest.model, workflow.model, imageSettings.generationModel, imageSettings.generation_model, imageSettings.model, imageMetadata.model, workflow.id ? 'seedance2.5' : '') || '').trim() || undefined,
    aspect_ratio: String(firstValue(requestPayload.aspect_ratio, nestedScript.aspect_ratio, modelRequest.aspect_ratio, workflow.aspect_ratio, recipe.aspect_ratio, imageSettings.aspectRatio, imageSettings.aspect_ratio) || '').trim() || undefined,
    duration: firstValue(requestPayload.duration, nestedScript.duration, modelRequest.duration, workflow.duration, recipe.duration) as number | string | undefined,
    resolution: String(firstValue(requestPayload.resolution, modelRequest.resolution, workflow.resolution, imageSettings.resolution, derivedSize) || '').trim() || undefined,
    language: String(firstValue(requestPayload.language, nestedScript.language, workflow.language, recipe.language, imageSettings.copyLanguage, imageSettings.target_language) || '').trim() || undefined,
    sound: firstValue(requestPayload.sound, nestedScript.sound, modelRequest.sound, workflow.sound) as boolean | string | undefined,
    prompt_type: String(firstValue(requestPayload.prompt_type, nestedScript.prompt_type, recipe.prompt_type) || '').trim() || undefined,
    style: String(firstValue(requestPayload.visual_style, requestPayload.style, nestedScript.visual_style, recipe.quality_style, recipe.narrative?.style_name, imageSettings.style, imageSettings.targetScene, imageSettings.target_scene) || '').trim() || undefined,
    shot_count: firstValue(requestPayload.shot_count, nestedScript.shot_count, recipe.shot_count, recipe.temporal_count) as number | string | undefined,
    output_count: firstValue(imageSettings.outputCount, imageSettings.output_count, detail?.image_count) as number | string | undefined,
    negative_prompt: String(firstValue(requestPayload.negative_prompt, modelRequest.negative_prompt, imageSettings.negativePrompt, imageSettings.negative_prompt) || '').trim() || undefined,
    camera: String(firstValue(requestPayload.camera, requestPayload.camera_movement, recipe.camera_energy) || '').trim() || undefined,
    pacing: String(firstValue(requestPayload.pacing, recipe.transition_style, recipe.shot_detail_level) || '').trim() || undefined,
    constraints: Array.isArray(constraints) ? constraints.map(String).filter(Boolean) : undefined,
    prompt_public: false,
    prompt: prompt || undefined,
  };
  const hasContent = Object.entries(details).some(([key, value]) => key !== 'prompt_public' && value !== undefined && value !== '');
  return hasContent ? details : null;
};

interface CommunityComposerDialogProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  initialPost?: CommunityPost | null;
  labels: {
    close: string;
    cancel: string;
    submit: string;
    submitting: string;
    titlePlaceholder: string;
    bodyPlaceholder: string;
    materialType: string;
    experienceType: string;
    assetPickerTitle: string;
    [key: string]: string;
  };
  onClose: () => void;
  onSubmit?: (draft: CommunityCreateDraft) => void | Promise<void>;
}

// 素材库资产类型 → 是否可作为帖子展示媒体（及其 kind）
const viewableKindOf = (assetType: string): 'image' | 'video' | 'audio' | null => {
  const t = (assetType || '').toLowerCase();
  if (t === 'motion') return 'video';
  if (t === 'audio') return 'audio';
  if (t === 'product' || t === 'scene' || t === 'model') return 'image';
  return null; // script / skill：仅作为可收集素材，不作展示媒体
};

export const CommunityComposerDialog = ({
  isOpen,
  isSubmitting = false,
  initialPost = null,
  labels,
  onClose,
  onSubmit,
}: CommunityComposerDialogProps) => {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [libraryAssets, setLibraryAssets] = React.useState<PickedLibraryAsset[]>([]);
  const [historyItems, setHistoryItems] = React.useState<ComposerHistoryItem[]>([]);
  const [sharePrompt, setSharePrompt] = React.useState(false);
  const [postType, setPostType] = React.useState<CommunityPostType>('material_share');
  const [isLibraryOpen, setIsLibraryOpen] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [error, setError] = React.useState('');

  const reset = () => {
    setTitle('');
    setBody('');
    setLibraryAssets([]);
    setHistoryItems([]);
    setSharePrompt(false);
    setPostType('material_share');
    setError('');
  };

  React.useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (!initialPost) {
      reset();
      return;
    }
    setTitle(initialPost.title);
    setBody(initialPost.body);
    setPostType(initialPost.post_type);
    setLibraryAssets([]);
    setHistoryItems(initialPost.media
      .filter((media) => media.kind === 'image' || media.kind === 'video')
      .map((media) => ({
        kind: media.kind as 'image' | 'video',
        url: media.url,
        name: initialPost.title,
        thumbnail_url: media.thumbnail_url,
        creationDetails: initialPost.creation_details || null,
      })));
    setSharePrompt(Boolean(initialPost.creation_details?.prompt_public));
  }, [initialPost?.id, isOpen]);

  if (!isOpen) return null;

  const detailItem = historyItems.find((item) => item.creationDetails);
  const creationDetails = detailItem?.creationDetails || null;
  const anyDetailsLoading = historyItems.some((item) => item.detailsLoading);
  const detailsReadFailed = historyItems.some((item) => item.detailsError);
  const effectivePostType = postType;
  const creationDetailRows = creationDetails ? [
    ['生成类型', IMAGE_FEATURE_LABELS[creationDetails.feature_type || ''] || creationDetails.feature_type],
    ['模型', creationDetails.model],
    ['画面比例', creationDetails.aspect_ratio],
    ['时长', creationDetails.duration !== undefined ? `${creationDetails.duration} 秒` : undefined],
    ['分辨率', creationDetails.resolution],
    ['语言', creationDetails.language],
    ['声音', creationDetails.sound === true || creationDetails.sound === 'on' ? '开启' : creationDetails.sound === false || creationDetails.sound === 'off' ? '关闭' : creationDetails.sound],
    ['Prompt 类型', creationDetails.prompt_type],
    ['风格', creationDetails.style],
    ['镜头数', creationDetails.shot_count],
    ['生成数量', creationDetails.output_count],
    ['负面提示词', creationDetails.negative_prompt],
    ['运镜', creationDetails.camera],
    ['节奏', creationDetails.pacing],
  ].filter((row): row is [string, string | number] => row[1] !== undefined && row[1] !== '') : [];

  const handleLibraryConfirm = (assets: AssetLibraryPickedAsset<CommunityAssetTab>[]) => {
    setLibraryAssets((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]));
      assets.forEach((a) => {
        map.set(a.id, { id: a.id, name: a.name, assetType: String(a.assetType), fileUrl: a.fileUrl, thumbnail: a.thumbnail });
      });
      return Array.from(map.values());
    });
    setIsLibraryOpen(false);
  };

  const handlePostTypeChange = (value: CommunityPostType) => {
    if (value === postType) return;
    setPostType(value);
    setError('');
    if (value === 'material_share') {
      setHistoryItems([]);
      setSharePrompt(false);
      setIsHistoryOpen(false);
    } else {
      setLibraryAssets([]);
      setIsLibraryOpen(false);
    }
  };

  const handleHistoryConfirm = (picked: CommunityHistoryPicked[]) => {
    setHistoryItems((prev) => {
      const map = new Map(prev.map((it) => [`${it.kind}:${it.url}`, it]));
      picked.forEach((p) => {
        const k = `${p.kind}:${p.url}`;
        if (!map.has(k)) {
          map.set(k, {
            ...p,
            creationDetails: null,
            detailsLoading: Boolean(p.kind === 'video' ? p.source_project_id : p.source_history_id),
          });
        }
      });
      return Array.from(map.values());
    });
    // 从历史详情提取可公开的生成参数；帖子保存的是快照，不依赖历史记录长期存在。
    picked
      .filter((p) => (p.kind === 'video' && p.source_project_id) || (p.kind === 'image' && p.source_history_id))
      .forEach((p) => {
        const detailPromise = p.kind === 'video'
          ? videoApi.getHistoryDetail(String(p.source_project_id))
          : getImageHistoryDetail(String(p.source_history_id));
        void detailPromise
          .then((detail) => {
            const nextDetails = extractCreationDetails({ ...detail, feature_type: detail?.feature_type || p.feature_type });
            setHistoryItems((prev) => prev.map((it) => (
              it.kind === p.kind && it.url === p.url
                ? { ...it, creationDetails: nextDetails, detailsLoading: false, detailsError: false }
                : it
            )));
          })
          .catch(() => {
            setHistoryItems((prev) => prev.map((it) => (
              it.kind === p.kind && it.url === p.url
                ? { ...it, detailsLoading: false, detailsError: true }
                : it
            )));
          });
      });
    setIsHistoryOpen(false);
  };

  const removeLibrary = (id: string) => setLibraryAssets((prev) => prev.filter((a) => a.id !== id));
  const removeHistory = (url: string, kind: string) => setHistoryItems((prev) => prev.filter((it) => !(it.url === url && it.kind === kind)));

  const buildMedia = (): CommunityMediaRef[] => {
    const historyMedia: CommunityMediaRef[] = historyItems.map((it) => ({
      kind: it.kind,
      url: it.url,
      name: it.name,
      thumbnail_url: it.thumbnail_url,
      source_project_id: it.source_project_id,
      source_history_id: it.source_history_id,
    }));
    const libraryMedia: CommunityMediaRef[] = libraryAssets
      .map((a): CommunityMediaRef | null => {
        const kind = viewableKindOf(a.assetType);
        if (!kind) return null;
        return { kind, url: a.fileUrl, name: a.name, thumbnail_url: a.thumbnail, source_asset_id: a.id };
      })
      .filter((x): x is CommunityMediaRef => Boolean(x));
    return [...historyMedia, ...libraryMedia];
  };

  const submit = async () => {
    if (isSubmitting) return;
    const media = buildMedia();
    const materialAssetIds = libraryAssets.map((a) => a.id);
    if (media.length === 0 && materialAssetIds.length === 0 && !body.trim()) {
      setError('请至少从素材库或生成历史中选择内容，或填写正文');
      return;
    }
    setError('');
    try {
      await onSubmit?.({
        title: title.trim(),
        body: body.trim(),
        postType,
        media,
        materialAssetIds,
        creationDetails: effectivePostType === 'experience' && creationDetails ? {
          ...creationDetails,
          prompt_public: Boolean(sharePrompt && creationDetails.prompt),
          prompt: sharePrompt ? creationDetails.prompt : undefined,
        } : null,
      });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const close = () => {
    if (!isSubmitting) onClose();
  };

  const totalSelected = libraryAssets.length + historyItems.length;

  return (
    <div className="fixed inset-0 z-[121] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={close}>
      <section className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-lg border border-white/10 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            {([
              ['material_share', labels.materialType],
              ['experience', labels.experienceType],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={isSubmitting}
                onClick={() => handlePostTypeChange(value)}
                className={`h-9 rounded-lg px-3 text-xs font-bold transition disabled:opacity-50 ${effectivePostType === value ? 'bg-orange-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" title={labels.close} aria-label={labels.close} disabled={isSubmitting} onClick={close} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-5 custom-scroll">
          <input
            value={title}
            disabled={isSubmitting}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={labels.titlePlaceholder}
            className="h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm font-bold text-zinc-100 outline-none focus:border-orange-400/70 disabled:opacity-60"
          />
          <textarea
            value={body}
            disabled={isSubmitting}
            onChange={(event) => setBody(event.target.value)}
            placeholder={labels.bodyPlaceholder}
            className="min-h-28 resize-none rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none focus:border-orange-400/70 disabled:opacity-60"
          />

          {effectivePostType === 'material_share' ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsLibraryOpen(true)}
              className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-xs font-bold text-zinc-300 hover:border-orange-400/50 disabled:opacity-60"
            >
              <Library className="h-5 w-5" />
              从素材库选择
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsHistoryOpen(true)}
              className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-xs font-bold text-zinc-300 hover:border-orange-400/50 disabled:opacity-60"
            >
              <ImageIcon className="h-5 w-5" />
              从生成历史选择
            </button>
          )}

          {totalSelected > 0 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {historyItems.map((it) => (
                <div key={`h-${it.kind}-${it.url}`} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  {it.kind === 'video' ? (
                    it.thumbnail_url ? <img src={it.thumbnail_url} alt={it.name} className="h-full w-full object-cover" /> : <video src={it.url} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <img src={it.url} alt={it.name} className="h-full w-full object-cover" />
                  )}
                  {it.kind === 'video' ? <Film className="absolute left-1 top-1 h-3.5 w-3.5 text-white drop-shadow" /> : null}
                  {it.creationDetails ? <SlidersHorizontal className="absolute right-1 top-1 h-3.5 w-3.5 text-orange-300 drop-shadow" /> : null}
                  <button type="button" onClick={() => removeHistory(it.url, it.kind)} className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                    <Trash2 className="h-4 w-4 text-red-300" />
                  </button>
                </div>
              ))}
              {libraryAssets.map((a) => (
                <div key={`l-${a.id}`} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  {a.thumbnail || viewableKindOf(a.assetType) === 'image' ? (
                    <img src={a.thumbnail || a.fileUrl} alt={a.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-zinc-400">{a.assetType}</div>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-zinc-100">库</span>
                  <button type="button" onClick={() => removeLibrary(a.id)} className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                    <Trash2 className="h-4 w-4 text-red-300" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {effectivePostType === 'experience' && creationDetails ? (
            <div className="rounded-lg border border-orange-300/20 bg-orange-400/[0.07] px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-black text-orange-100">
                <SlidersHorizontal className="h-4 w-4" /> 创作详情
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
                {creationDetailRows.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <div className="text-[10px] font-bold text-zinc-500">{label}</div>
                    <div className="mt-0.5 truncate text-xs font-bold text-zinc-200">{String(value)}</div>
                  </div>
                ))}
              </div>
              {creationDetails.prompt ? (
                <label className="mt-3 flex items-start gap-2 border-t border-white/10 pt-3 text-xs font-bold text-zinc-200">
                  <input type="checkbox" checked={sharePrompt} disabled={isSubmitting} onChange={(event) => setSharePrompt(event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-500" />
                  <span>公开本次生成 Prompt<span className="mt-0.5 block font-normal text-zinc-500">关闭时，帖子不会保存或返回 Prompt。</span></span>
                </label>
              ) : (
                <div className="mt-3 border-t border-white/10 pt-3 text-[11px] text-zinc-500">这条历史记录没有可读取的 Prompt。</div>
              )}
            </div>
          ) : effectivePostType === 'experience' && anyDetailsLoading ? (
            <div className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在读取生成参数...</div>
          ) : effectivePostType === 'experience' && detailsReadFailed ? (
            <div className="text-xs font-bold text-amber-300">创作详情读取失败，仍可发布帖子，但不会附带生成参数。</div>
          ) : effectivePostType === 'experience' && historyItems.length > 0 ? (
            <div className="text-xs font-bold text-zinc-500">这条历史记录没有可公开的生成参数。</div>
          ) : null}

          {error ? <div className="text-xs font-bold text-red-300">{error}</div> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button type="button" disabled={isSubmitting} onClick={close} className="h-10 rounded-lg border border-white/10 px-4 text-sm font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-50">
            {labels.cancel}
          </button>
          <button type="button" disabled={isSubmitting} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-400 disabled:opacity-60">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? labels.submitting : labels.submit}
          </button>
        </div>
      </section>

      <AssetLibraryPickerDialog<CommunityAssetTab>
        isOpen={isLibraryOpen}
        tabs={COMMUNITY_ASSET_TABS}
        maxCount={12}
        appliedCount={libraryAssets.length}
        title={labels.assetPickerTitle}
        onConfirm={handleLibraryConfirm}
        onClose={() => setIsLibraryOpen(false)}
      />

      <CommunityHistoryPicker
        isOpen={isHistoryOpen}
        onConfirm={handleHistoryConfirm}
        onClose={() => setIsHistoryOpen(false)}
      />
    </div>
  );
};
