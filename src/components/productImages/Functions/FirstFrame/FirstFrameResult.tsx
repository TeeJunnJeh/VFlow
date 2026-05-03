import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Download, FolderPlus, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import type { FirstFrameParams, ProductImageResult } from '../../../../types/productImages';
import type { LoadingTheme } from '../../../../utils/loadingTheme';
import { ImageDetailDialog } from '../../Common/ImageDetailDialog';
import { ImageInpaintDialog, type ImageInpaintRunOptions } from '../../Common/ImageInpaintDialog';
import { videoApi } from '../../../../services/video';

interface FirstFrameResultProps {
  results: ProductImageResult[];
  isLoading?: boolean;
  elapsedSeconds?: number | null;
  selectionKey?: string;
  loadingTheme?: LoadingTheme;
  aspectRatio?: string;
  generationParams?: FirstFrameParams;
  createdAt?: string;
  onRegenerate: () => void;
  onDownload: (imageId: string, filename?: string) => Promise<void>;
  onDownloadAll: (prefix: string) => Promise<void>;
  onSaveToAssets: (imageId: string) => Promise<boolean>;
  onReplaceImage?: (imageId: string, imageUrl: string) => Promise<void> | void;
  onNextStep: (imageId: string) => void;
}

const DEFAULT_LOADING_THEME: LoadingTheme = {
  mode: 'vivid',
  primary: '#baa8ff',
  secondary: '#a5dcff',
  accent: '#ffd2b4',
  quaternary: '#ffb4dc',
  surface: '#ffffff',
};

const parseAspectRatio = (value?: string) => {
  const match = String(value || '9:16').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  const width = match ? Number(match[1]) : 9;
  const height = match ? Number(match[2]) : 16;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 9, height: 16, ratio: 9 / 16 };
  }
  return { width, height, ratio: width / height };
};

const hexToRgba = (hex: string, alpha: number) => {
  const cleaned = String(hex || '').trim().replace('#', '');
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(255,255,255,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatDateTime = (raw?: string) => {
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const LoadingGradientPlaceholder: React.FC<{ theme?: LoadingTheme; className: string }> = ({
  theme,
  className,
}) => {
  const palette = theme || DEFAULT_LOADING_THEME;
  const blobs = [
    {
      size: '100%',
      top: '-10%',
      left: '-10%',
      duration: '6s',
      gradient: `radial-gradient(circle, ${hexToRgba(palette.primary, 0.92)} 0%, transparent 78%)`,
    },
    {
      size: '90%',
      bottom: '-5%',
      right: '-5%',
      duration: '8s',
      direction: 'reverse' as const,
      gradient: `radial-gradient(circle, ${hexToRgba(palette.secondary, 0.9)} 0%, transparent 78%)`,
    },
    {
      size: '110%',
      top: '20%',
      right: '-15%',
      duration: '10s',
      gradient: `radial-gradient(circle, ${hexToRgba(palette.accent, 0.9)} 0%, transparent 78%)`,
    },
    {
      size: '85%',
      bottom: '15%',
      left: '5%',
      duration: '7s',
      gradient: `radial-gradient(circle, ${hexToRgba(palette.quaternary, 0.9)} 0%, transparent 78%)`,
    },
  ];

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(180deg, ${hexToRgba(palette.primary, 0.08)} 0%, ${palette.surface} 18%, ${palette.surface} 100%)`,
        boxShadow: `0 20px 40px rgba(0, 0, 0, 0.05), inset 0 1px 0 ${hexToRgba(palette.primary, 0.16)}`,
      }}
    >
      <style>{`
        @keyframes ff-gradient-blob {
          0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          33% { transform: translate3d(15%, 20%, 0) rotate(120deg) scale(1.2); }
          66% { transform: translate3d(-15%, 15%, 0) rotate(240deg) scale(0.85); }
          100% { transform: translate3d(0, 0, 0) rotate(360deg) scale(1); }
        }
      `}</style>
      <div className="absolute inset-0 blur-[35px] [transform:scale(1.3)]">
        {blobs.map((blob, index) => (
          <div
            key={index}
            className="absolute rounded-full"
            style={{
              width: blob.size,
              height: blob.size,
              top: blob.top,
              left: blob.left,
              right: blob.right,
              bottom: blob.bottom,
              background: blob.gradient,
              animationName: 'ff-gradient-blob',
              animationDuration: blob.duration,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationDirection: blob.direction || 'normal',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export const FirstFrameResult: React.FC<FirstFrameResultProps> = ({
  results,
  isLoading = false,
  elapsedSeconds: _elapsedSeconds = null,
  selectionKey,
  loadingTheme,
  aspectRatio,
  generationParams,
  createdAt,
  onRegenerate,
  onDownload,
  onDownloadAll,
  onSaveToAssets,
  onReplaceImage,
  onNextStep,
}) => {
  const { t } = useLanguage();

  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [selectedImageId, setSelectedImageId] = useState<string | null>(results[0]?.id || null);
  const [showFullImage, setShowFullImage] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [detailResolution, setDetailResolution] = useState<{ width: number; height: number } | null>(null);
  const [isInpaintOpen, setIsInpaintOpen] = useState(false);

  const isResultSucceeded = (item?: ProductImageResult | null) => (
    Boolean(item?.imageUrl) && item?.generationStatus !== 'failed'
  );
  const isResultFailed = (item?: ProductImageResult | null) => item?.generationStatus === 'failed';
  const allResultsFinished = results.length > 0 && results.every((item) => (
    item.generationStatus === 'succeeded' || item.generationStatus === 'failed' || Boolean(item.imageUrl)
  ));
  const hasSucceededResults = results.some((item) => isResultSucceeded(item));

  useEffect(() => {
    if (results.length === 0) {
      setSelectedImageId(null);
      return;
    }

    const firstSucceeded = results.find((item) => isResultSucceeded(item));

    if (!results.some((item) => item.id === selectedImageId)) {
      setSelectedImageId((firstSucceeded || results[0]).id);
    }
  }, [results, selectedImageId]);

  useEffect(() => {
    setSelectedImageId((results.find((item) => isResultSucceeded(item)) || results[0])?.id || null);
  }, [results, selectionKey]);

  useEffect(() => {
    setDetailResolution(null);
  }, [selectedImageId]);

  const selectedImage = results.find((r) => r.id === selectedImageId) || results.find((item) => isResultSucceeded(item)) || results[0] || null;
  const selectedIndex = selectedImage ? results.findIndex((item) => item.id === selectedImage.id) : -1;
  const parsedAspectRatio = parseAspectRatio(aspectRatio);
  const previewMaxSize = 384;
  const previewWidth = parsedAspectRatio.ratio >= 1
    ? previewMaxSize
    : previewMaxSize * parsedAspectRatio.ratio;
  const previewHeight = parsedAspectRatio.ratio >= 1
    ? previewMaxSize / parsedAspectRatio.ratio
    : previewMaxSize;
  const previewFrameStyle: React.CSSProperties = {
    width: `${Math.round(previewWidth)}px`,
    maxWidth: '100%',
    height: `${Math.round(previewHeight)}px`,
  };

  if (isLoading) return null;

  const handleDownload = async (imageId: string) => {
    const current = results.find((item) => item.id === imageId);
    if (!isResultSucceeded(current)) return;

    setDownloadingIds((prev) => new Set(prev).add(imageId));
    try {
      const index = results.findIndex((item) => item.id === imageId);
      const filename = `ai_first_frame_${Math.max(index + 1, 1)}.jpg`;
      await onDownload(imageId, filename);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  };

  const handleDownloadAll = async () => {
    setIsDownloadingAll(true);
    try {
      await onDownloadAll('ai_first_frame');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const handleSaveToAssets = async (imageId: string) => {
    if (savingIds.has(imageId) || savedIds.has(imageId)) return;

    setSavingIds((prev) => new Set(prev).add(imageId));
    try {
      const saved = await onSaveToAssets(imageId);
      if (saved) {
        setSavedIds((prev) => new Set(prev).add(imageId));
      }
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  };

  const handlePreviewPrev = () => {
    if (selectedIndex <= 0) return;
    const prev = results.slice(0, selectedIndex).reverse().find((item) => isResultSucceeded(item));
    if (prev) setSelectedImageId(prev.id);
  };

  const handlePreviewNext = () => {
    if (selectedIndex < 0) return;
    const next = results.slice(selectedIndex + 1).find((item) => isResultSucceeded(item));
    if (next) setSelectedImageId(next.id);
  };

  const runInpaint = async (options: ImageInpaintRunOptions): Promise<string> => {
    const apiBase = (import.meta as any).env?.VITE_API_BASE || '/api';
    const resp = await fetch(`${apiBase}/projects/inpaint_image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        image_url: options.imageUrl,
        mask_data_url: options.maskDataUrl,
        prompt: options.prompt,
        aspect_ratio: options.aspectRatio,
      }),
    });
    const data = await resp.json();
    if (!resp.ok || (data && data.code && data.code !== 0)) {
      throw new Error(String(data?.message || data?.error?.message || 'request failed'));
    }
    const requestId = String(data?.data?.request_id || '').trim();
    if (!requestId) throw new Error('Create task failed');

    for (let i = 0; i < 40; i += 1) {
      const res = await videoApi.getProductGalleryResult(requestId);
      const status = String((res as any)?.data?.status || (res as any)?.status || '').toLowerCase();
      const outputs = (res as any)?.data?.outputs || (res as any)?.outputs || [];
      const list = Array.isArray(outputs) ? outputs : [];
      const outputUrl = String(list[0] || '').trim();
      if (outputUrl) return outputUrl;
      if (status && ['failed', 'canceled', 'cancelled', 'error'].includes(status)) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error(t.pg_main_toast_generation_failed_retry || 'Generation failed');
  };

  const openingSceneLabel = (() => {
    const value = generationParams?.openingScene;
    if (value === 'person_selling') return t.ff_opening_scene_person_selling;
    if (value === 'product_showcase') return t.ff_opening_scene_product_showcase;
    if (value === 'usage_demo') return t.ff_opening_scene_usage_demo;
    if (value === 'brand_ad') return t.ff_opening_scene_brand_ad;
    return '-';
  })();

  const modelLabel = (() => {
    const value = String(generationParams?.model || '').trim();
    if (value === 'nano-banana-pro') return 'Nano Banana Pro';
    if (value === 'gpt-image-2') return 'GPT Image 2';
    if (value === 'gpt-image-1.5') return 'GPT Image 1.5';
    return value || '-';
  })();

  const detailPrompt = String(generationParams?.prompt || selectedImage?.metadata?.prompt || '').trim();

  return (
    <div className="w-full space-y-6">
      <div className="overflow-hidden rounded-xl bg-transparent">
        <div className="flex flex-col items-center gap-4 bg-transparent px-8 pb-8 pt-1">
          <div className="relative">
            {selectedImage ? (
              <div className="relative">
                {isResultSucceeded(selectedImage) ? (
                  <>
                    <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
                      <button
                        onClick={() => void handleDownload(selectedImage.id)}
                        disabled={downloadingIds.has(selectedImage.id)}
                        aria-label={t.ff_download_image}
                        className="flex h-7 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/45 text-zinc-100 transition hover:bg-black/65 disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void handleSaveToAssets(selectedImage.id)}
                        disabled={savingIds.has(selectedImage.id) || savedIds.has(selectedImage.id)}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-orange-500/50 bg-black/45 px-2.5 py-1.5 text-xs font-semibold text-orange-200 transition hover:bg-black/65 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                        {savedIds.has(selectedImage.id)
                          ? t.ff_saved_to_image_assets
                          : savingIds.has(selectedImage.id)
                            ? t.ff_saving_to_image_assets
                            : t.ff_save_to_image_assets}
                      </button>
                    </div>
                    <img
                      src={selectedImage.imageUrl}
                      alt={t.ff_first_frame_alt}
                      className="max-h-96 max-w-sm cursor-pointer rounded-lg object-contain transition hover:border border-orange-500"
                      onClick={() => setShowFullImage(true)}
                    />
                  </>
                ) : (
                  <div
                    className="relative h-full w-full overflow-hidden rounded-lg border border-orange-200/60"
                    style={previewFrameStyle}
                  >
                    {isResultFailed(selectedImage) ? (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-900/70 px-6 text-center">
                        <AlertCircle className="mb-3 h-8 w-8 text-red-300" />
                        <p className="text-sm font-medium text-red-200">{selectedImage.errorMessage || '生成失败'}</p>
                      </div>
                    ) : (
                      <LoadingGradientPlaceholder theme={loadingTheme} className="h-full w-full rounded-lg" />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800" style={previewFrameStyle}>
                <p className="text-zinc-500">{t.ff_no_result}</p>
              </div>
            )}
          </div>
        </div>

        {results.length > 0 && (
          <div className="bg-transparent px-8 pb-6 pt-2">
            <p className="mb-4 text-sm font-medium text-zinc-300">{t.ff_preview_variants}</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => setSelectedImageId(result.id)}
                  className={`relative overflow-hidden rounded-lg border-2 transition ${selectedImageId === result.id ? 'border-orange-500' : 'border-zinc-600 hover:border-orange-500/50'}`}
                >
                  {isResultSucceeded(result) ? (
                    <img src={result.imageUrl} alt="thumbnail" className="aspect-square w-full object-cover" />
                  ) : (
                    isResultFailed(result) ? (
                      <div className="flex aspect-square w-full flex-col items-center justify-center bg-zinc-900/80 text-xs text-zinc-400">
                        <AlertCircle className="mb-1.5 h-5 w-5 text-red-300" />
                          <span>失败</span>
                      </div>
                    ) : (
                      <LoadingGradientPlaceholder theme={loadingTheme} className="aspect-square w-full" />
                    )
                  )}
                  {selectedImageId === result.id && <div className="absolute inset-0 bg-orange-500/20" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {allResultsFinished && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              onClick={onRegenerate}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
            >
              <RotateCcw className="h-4 w-4" />
              {t.ff_regenerate}
            </button>
            <button
              onClick={() => {
                const target = selectedImage && isResultSucceeded(selectedImage)
                  ? selectedImage
                  : results.find((item) => isResultSucceeded(item));
                if (target) onNextStep(target.id);
              }}
              disabled={!hasSucceededResults}
              className="flex items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" />
              {t.ff_use_in_workbench_and_generate_video}
            </button>
          </div>
        </div>
      )}

      {showFullImage && selectedImage && isResultSucceeded(selectedImage) ? (
        <ImageDetailDialog
          open={showFullImage}
          imageUrl={selectedImage.imageUrl}
          title={t.ff_detail_title || '图片详情'}
          imageAlt={t.ff_first_frame_alt}
          infoTitle={t.pg_main_generation_info || '生成信息'}
          infoRows={[
            {
              label: t.pg_main_resolution || '分辨率',
              value: detailResolution ? `${detailResolution.width} × ${detailResolution.height} px` : '-',
            },
            { label: t.ff_detail_ratio || '比例', value: generationParams?.aspectRatio || aspectRatio || '-' },
            { label: t.ff_detail_opening_scene_type || '开场情景类型', value: openingSceneLabel },
            { label: t.pg_main_created_at || '生成时间', value: formatDateTime(createdAt) },
            { label: t.pg_main_model || '生成模型', value: modelLabel },
          ]}
          promptLabel={t.ff_detail_prompt_label || '生成要求'}
          promptValue={detailPrompt}
          onClose={() => setShowFullImage(false)}
          onImageLoad={setDetailResolution}
          onPrev={results.some((item, index) => index < selectedIndex && isResultSucceeded(item)) ? handlePreviewPrev : undefined}
          onNext={results.some((item, index) => index > selectedIndex && isResultSucceeded(item)) ? handlePreviewNext : undefined}
          canPrev={results.some((item, index) => index < selectedIndex && isResultSucceeded(item))}
          canNext={results.some((item, index) => index > selectedIndex && isResultSucceeded(item))}
          onInpaint={() => setIsInpaintOpen(true)}
          inpaintLabel={t.pg_main_inpaint_edit || '局部重绘 / 修改'}
          onDownload={() => void handleDownload(selectedImage.id)}
          downloadLabel={downloadingIds.has(selectedImage.id) ? (t.pg_main_downloading || '下载中') : (t.pi_gallery_preview_download_image || t.ff_download_image)}
          downloadDisabled={downloadingIds.has(selectedImage.id)}
          onSave={() => void handleSaveToAssets(selectedImage.id)}
          saveLabel={
            savedIds.has(selectedImage.id)
              ? t.ff_saved_to_image_assets
              : savingIds.has(selectedImage.id)
                ? t.ff_saving_to_image_assets
                : t.ff_save_to_image_assets
          }
          saveDisabled={savingIds.has(selectedImage.id) || savedIds.has(selectedImage.id)}
          zoomMode="toggle"
          zoomLabel={t.ff_detail_zoom || '放大查看'}
          closeLabel={t.pg_main_btn_close || '关闭'}
          expandLabel={t.ff_detail_expand || '展开'}
          collapseLabel={t.ff_detail_collapse || '收起'}
        />
      ) : null}

      {showFullImage && selectedImage && isResultSucceeded(selectedImage) ? (
        <ImageInpaintDialog
          open={isInpaintOpen}
          imageUrl={selectedImage.imageUrl}
          onClose={() => setIsInpaintOpen(false)}
          onRun={runInpaint}
          onApply={async (nextUrl) => {
            await onReplaceImage?.(selectedImage.id, nextUrl);
          }}
          labels={{
            title: t.pg_main_inpaint_local_edit || '局部重绘修改',
            resultTitle: t.pg_main_inpaint_choose_result || '重绘结果选择',
            subtitle: t.pg_main_inpaint_select_on_left || '请在左侧框选需要修改的部分',
            resultSubtitle: t.pg_main_inpaint_compare_hint || '对比两张图片，选择继续修改或应用覆盖原图。',
            original: t.pg_main_original || '原图',
            edited: t.pg_main_edited || '修改后',
            promptLabel: t.pi_gallery_inpaint_prompt_label || '修改指令',
            promptPlaceholder: t.pi_gallery_inpaint_prompt_placeholder || '',
            promptHint: t.pg_main_inpaint_prompt_hint || '',
            clearSelection: t.pg_main_btn_clear_all_selection || '清除框选',
            start: t.pg_main_btn_start_editing || '开始修改',
            generating: t.pi_gallery_inpaint_generating || '生成中...',
            continueEditing: t.pg_main_btn_continue_editing || '继续修改',
            apply: t.pg_main_btn_apply_replace_original || '应用并替换原图',
            keepOriginal: t.pg_main_btn_keep_original || '保留原图',
            selectAreaError: t.pg_main_inpaint_error_select_area || '请先框选要修改的区域',
            imageNotReadyError: t.pg_main_inpaint_error_image_not_ready || '图片未加载完成',
            promptError: t.pg_main_inpaint_error_enter_instruction || '请填写修改指令',
          }}
        />
      ) : null}
    </div>
  );
};
