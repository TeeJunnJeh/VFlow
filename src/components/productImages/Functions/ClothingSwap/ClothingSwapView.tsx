/**
 * AI 换装 (Clothing Swap) — 3-column layout aligned with FirstFrameView
 * Supports multi-workspace, multi-output, background/aspect-ratio controls.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { ImageUploader } from '../../Common/ImageUploader';
import { ClothingSwapForm } from './ClothingSwapForm';
import { ClothingSwapResult } from './ClothingSwapResult';
import ResizableSplitter from '../../../common/ResizableSplitter';
import { LoadingProgress } from '../../Common/LoadingProgress';
import { ErrorDialog, type ErrorInfo } from '../../Common/ErrorDialog';
import { productImagesApi } from '../../../../services/productImagesApi';
import type {
  ClothingSwapAspectRatio,
  ClothingSwapBackground,
  ClothingSwapCategory,
  ClothingSwapColor,
  ClothingSwapOutputCount,
  ClothingSwapParams,
  ProductImageResult,
} from '../../../../types/productImages';
import {
  notifyImageHistoryUpdated,
  readImageHistoryByFeature,
  refreshImageHistory,
  subscribeImageHistory,
  type ImageHistoryItem,
} from '../../../../utils/imageHistory';
import {
  extractLoadingThemeFromSources,
  getDefaultLoadingTheme,
  type LoadingTheme,
} from '../../../../utils/loadingTheme';
import { saveBlobWithPickerFallback, downloadUrlDirectly } from '../../../../utils/browserDownload';
import { useRequireAuth } from '../../../../utils/useRequireAuth';

type Phase = 'upload' | 'form' | 'generating' | 'result' | 'error';

interface ClothingSwapViewProps {
  onBack?: () => void;
  projectId?: string;
  embedded?: boolean;
  isVisible?: boolean;
}

interface ClothingSwapHistoryItem {
  id: string;
  workspaceId: string;
  workspaceOrder: number;
  createdAt: string;
  outputImages: ProductImageResult[];
  settings: {
    category?: ClothingSwapCategory;
    targetColor?: ClothingSwapColor;
    background?: ClothingSwapBackground;
    aspectRatio?: ClothingSwapAspectRatio;
    outputCount?: ClothingSwapOutputCount;
  };
}

const CS_COUNTDOWN_SECONDS = 60;
const CS_PROGRESS_HOLD_MAX = 95;
const CS_PANEL_MIN_WIDTH = 280;
const CS_PANEL_MAX_WIDTH = 720;
const CS_DEFAULT_LEFT_RATIO = 0.8;
const CS_DEFAULT_MIDDLE_RATIO = 1;
const CS_DEFAULT_RIGHT_RATIO = 1;
const CS_DEFAULT_TOTAL_RATIO = CS_DEFAULT_LEFT_RATIO + CS_DEFAULT_MIDDLE_RATIO + CS_DEFAULT_RIGHT_RATIO;
const CS_VIDEO_CACHE_KEY = 'vflow_cs_videos';

/**
 * 与 productImagesApi.toDisplayUrl 保持一致的 URL 规范化：
 * 将后端返回的原始 /media/... 路径转换为带 VITE_MEDIA_BASE_URL 前缀的完整 URL，
 * 确保历史记录恢复时的图片 URL 与生成时存入 videoMap 的 key 相同。
 */
function normalizeMediaUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
  const normalized = s.startsWith('/') ? s : `/${s}`;
  const base = (import.meta.env.VITE_MEDIA_BASE_URL as string) || '';
  if (base && normalized.startsWith('/media/')) return `${base}${normalized}`;
  return normalized;
}

const sanitizeHistoryImage = (item: any, index: number, historyId: string): ProductImageResult | null => {
  const rawUrl = String(item?.imageUrl || item?.downloadUrl || '').trim();
  if (!rawUrl) return null;
  // 规范化 URL：使历史记录的 imageUrl 与生成时存入 videoMap 的 key 保持一致
  const imageUrl = normalizeMediaUrl(rawUrl);
  const rawId = String(item?.id || '').trim();
  const namespacedId = rawId
    ? `clothing-swap-history-${historyId}-${index}-${rawId}`
    : `clothing-swap-history-${historyId}-${index}`;
  return {
    id: namespacedId,
    imageUrl,
    downloadUrl: String(item?.downloadUrl || rawUrl),
    format: String(item?.format || 'png'),
  };
};

const mapImageHistoryToCsItem = (item: ImageHistoryItem): ClothingSwapHistoryItem | null => {
  if (item.featureType !== 'clothing_swap') return null;
  const historyId = String(item.id || '').trim();

  const metaOutputs = Array.isArray((item.metadata as any)?.outputImages)
    ? (item.metadata as any).outputImages
    : null;
  const outputImages = (metaOutputs
    ? metaOutputs
        .map((img: any, index: number) => sanitizeHistoryImage(img, index, historyId))
        .filter(Boolean)
    : item.images
        .map((imageUrl, index) => sanitizeHistoryImage({ imageUrl, downloadUrl: imageUrl }, index, historyId))
        .filter(Boolean)) as ProductImageResult[];

  if (outputImages.length === 0) return null;

  const settings = (item.settings as Record<string, any>) || {};

  return {
    id: item.id,
    workspaceId: item.workspaceId || 'cs-workspace-1',
    workspaceOrder: item.workspaceOrder || 1,
    createdAt: item.createdAt,
    outputImages,
    settings: {
      category: settings.category as ClothingSwapCategory | undefined,
      targetColor: settings.targetColor as ClothingSwapColor | undefined,
      background: settings.background as ClothingSwapBackground | undefined,
      aspectRatio: settings.aspectRatio as ClothingSwapAspectRatio | undefined,
      outputCount: settings.outputCount as ClothingSwapOutputCount | undefined,
    },
  } satisfies ClothingSwapHistoryItem;
};

interface ClothingSwapWorkspacePaneProps {
  workspaceId: string;
  workspaceOrder: number;
  projectId?: string;
  isVisible?: boolean;
}

const ClothingSwapWorkspacePane: React.FC<ClothingSwapWorkspacePaneProps> = ({
  workspaceId,
  workspaceOrder: _workspaceOrder,
  projectId,
  isVisible = true,
}) => {
  const { t } = useLanguage();
  const { requireAuth } = useRequireAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousContainerWidthRef = useRef(0);
  const [leftWidth, setLeftWidth] = useState<number>(500);
  const [middleWidth, setMiddleWidth] = useState<number>(600);

  const [phase, setPhase] = useState<Phase>('upload');
  const [modelImage, setModelImage] = useState<File | null>(null);
  const [garmentImage, setGarmentImage] = useState<File | null>(null);
  const [modelUploaderKey, setModelUploaderKey] = useState(0);
  const [garmentUploaderKey, setGarmentUploaderKey] = useState(0);
  const [results, setResults] = useState<ProductImageResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [rightPanel, setRightPanel] = useState<'preview' | 'history'>('preview');
  const [historyItems, setHistoryItems] = useState<ClothingSwapHistoryItem[]>([]);
  const [resultSelectionKey, setResultSelectionKey] = useState<string>('');
  const [restoredParams, setRestoredParams] = useState<Partial<ClothingSwapParams> | undefined>(undefined);
  const [loadingTheme, setLoadingTheme] = useState<LoadingTheme>(getDefaultLoadingTheme());
  const [loadingBackgroundSrc, setLoadingBackgroundSrc] = useState<string>('');
  // ── video state ──────────────────────────────────────────────────────────────
  const [videoMap, setVideoMap] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(CS_VIDEO_CACHE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch { return {}; }
  });
  const [generatingVideoIds, setGeneratingVideoIds] = useState<Set<string>>(new Set());
  const [lastGeneratedBackground, setLastGeneratedBackground] = useState<ClothingSwapBackground>('model');

  const generationSeqRef = useRef(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressStartedAtRef = useRef<number | null>(null);

  const isGenerating = phase === 'generating';
  const hasResults = results.length > 0;
  const hasBothImages = !!modelImage && !!garmentImage;

  useEffect(() => {
    if (phase === 'generating' || phase === 'result' || phase === 'error') return;
    setPhase(hasBothImages ? 'form' : 'upload');
  }, [hasBothImages, phase]);

  const refreshWorkspaceHistory = useCallback(async () => {
    await refreshImageHistory();
    const filtered = (readImageHistoryByFeature('clothing_swap')
      .map((item) => mapImageHistoryToCsItem(item))
      .filter(Boolean) as ClothingSwapHistoryItem[])
      .filter((item) => item.workspaceId === workspaceId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    setHistoryItems(filtered);
  }, [workspaceId]);

  useEffect(() => {
    void refreshWorkspaceHistory();
    return subscribeImageHistory(() => {
      void refreshWorkspaceHistory();
    });
  }, [refreshWorkspaceHistory]);

  useEffect(() => {
    let alive = true;
    const files = [modelImage, garmentImage].filter(Boolean) as File[];
    if (files.length === 0) {
      setLoadingTheme(getDefaultLoadingTheme());
      setLoadingBackgroundSrc('');
      return;
    }
    const objectUrls = files.map((file) => URL.createObjectURL(file));
    setLoadingBackgroundSrc(objectUrls[0] || '');
    void extractLoadingThemeFromSources(objectUrls).then((theme) => {
      if (alive) setLoadingTheme(theme);
    });
    return () => {
      alive = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [modelImage, garmentImage]);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const startProgressSimulation = useCallback(() => {
    clearProgressTimer();
    progressStartedAtRef.current = Date.now();
    setProgress((prev) => Math.max(2, prev));

    progressTimerRef.current = window.setInterval(() => {
      const startedAt = progressStartedAtRef.current;
      if (!startedAt) return;
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const ratio = Math.max(0, Math.min(1, elapsedMs / (CS_COUNTDOWN_SECONDS * 1000)));
      const eased = 1 - Math.pow(1 - ratio, 1.8);
      const simulated = Math.round(eased * CS_PROGRESS_HOLD_MAX);
      setProgress((prev) => Math.max(prev, Math.min(CS_PROGRESS_HOLD_MAX, Math.max(2, simulated))));
    }, 800);
  }, [clearProgressTimer]);

  useEffect(() => () => { clearProgressTimer(); }, [clearProgressTimer]);

  const handleModelImagesSelected = useCallback((files: File[]) => {
    setModelImage(files[0] || null);
    setError(null);
    setProgress(0);
    setResults([]);
  }, []);

  const handleGarmentImagesSelected = useCallback((files: File[]) => {
    setGarmentImage(files[0] || null);
    setError(null);
    setProgress(0);
    setResults([]);
  }, []);

  const handleGenerateFormSubmit = async (
    params: Required<Pick<ClothingSwapParams, 'category' | 'targetColor' | 'background' | 'aspectRatio' | 'outputCount'>>,
  ) => {
    if (!requireAuth()) return;
    if (!modelImage || !garmentImage) {
      setError({
        code: 'NO_IMAGES',
        message: t.cs_error_upload_first,
        severity: 'warning',
      });
      return;
    }

    const runSeq = generationSeqRef.current + 1;
    generationSeqRef.current = runSeq;

    try {
      setPhase('generating');
      setRightPanel('preview');
      setError(null);
      setProgress(2);
      setLastGeneratedBackground(params.background ?? 'model');
      startProgressSimulation();

      const clientHistoryId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `clothing-swap-${Date.now()}`;

      const response = await productImagesApi.generateClothingSwap(
        modelImage,
        garmentImage,
        params,
        { projectId, workspaceId, clientHistoryId },
      );

      if (generationSeqRef.current !== runSeq) return;

      clearProgressTimer();
      setProgress(100);
      progressStartedAtRef.current = null;

      if (response && response.outputImages && response.outputImages.length > 0) {
        setResults(response.outputImages);
        setResultSelectionKey(`generation:${workspaceId}:${Date.now()}`);
        await refreshWorkspaceHistory();
        notifyImageHistoryUpdated();
        setPhase('result');
        return;
      }

      setError({
        code: 'CLOTHING_SWAP_EMPTY',
        message: t.cs_error_generic,
        severity: 'error',
      });
      setPhase('error');
    } catch (err) {
      if (generationSeqRef.current !== runSeq) return;
      clearProgressTimer();
      const message = err instanceof Error ? err.message : t.cs_error_generic;
      setError({
        code: 'CLOTHING_SWAP_FAILED',
        message,
        severity: 'error',
      });
      setPhase('error');
    }
  };

  const handleCancelGeneration = () => {
    generationSeqRef.current += 1;
    clearProgressTimer();
    progressStartedAtRef.current = null;
    setPhase(hasBothImages ? 'form' : 'upload');
    setProgress(0);
  };

  const handleRegenerate = () => {
    setResults([]);
    setPhase('form');
    setProgress(0);
    setError(null);
    setRightPanel('preview');
  };

  const handleResetLayout = useCallback(() => {
    generationSeqRef.current += 1;
    clearProgressTimer();
    progressStartedAtRef.current = null;
    setResults([]);
    setProgress(0);
    setError(null);
    setPhase(hasBothImages ? 'form' : 'upload');
  }, [clearProgressTimer, hasBothImages]);

  const buildFileName = useCallback((prefix: string, index: number, imageId: string) => {
    const safePrefix = prefix.trim() || 'ai_clothing_swap';
    const shortId = imageId.slice(0, 8);
    return `${safePrefix}_${index + 1}_${shortId}.png`;
  }, []);

  const handleDownload = async (imageId: string, filename?: string) => {
    try {
      const index = results.findIndex((item) => item.id === imageId);
      const selected = index >= 0 ? results[index] : null;
      if (!selected) return;
      const blob = await productImagesApi.downloadImageByUrl(selected.imageUrl);
      const nextName = filename || buildFileName('ai_clothing_swap', Math.max(index, 0), imageId);
      await saveBlobWithPickerFallback(blob, nextName);
    } catch {
      setError({
        code: 'DOWNLOAD_FAILED',
        message: t.cs_error_download_failed,
        severity: 'error',
      });
    }
  };

  const handleDownloadAll = async (prefix: string) => {
    const safePrefix = prefix.trim() || 'ai_clothing_swap';
    for (let i = 0; i < results.length; i += 1) {
      const item = results[i];
      // download image
      // eslint-disable-next-line no-await-in-loop
      await downloadUrlDirectly(item.imageUrl, buildFileName(safePrefix, i, item.id));
      // download associated video if available
      const videoUrl = videoMap[item.imageUrl];
      if (videoUrl) {
        const shortId =
          item.imageUrl.split('/').pop()?.replace(/\.[^.]+$/, '') ?? item.id.slice(0, 8);
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((res) => setTimeout(res, 300));
        // eslint-disable-next-line no-await-in-loop
        await downloadUrlDirectly(videoUrl, `${safePrefix}_${i + 1}_${shortId}.mp4`);
      }
      if (i < results.length - 1) {
        // small delay so browser doesn't block rapid-fire downloads
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((res) => setTimeout(res, 300));
      }
    }
  };

  const handleErrorRetry = () => {
    setError(null);
    if (phase === 'error') {
      setPhase(hasBothImages ? 'form' : 'upload');
    }
  };

  // ── video helpers ────────────────────────────────────────────────────────────
  // videoMap is keyed by imageUrl (stable across history restores, not ephemeral imageId)
  const saveVideoToCache = useCallback((imageUrl: string, videoUrl: string) => {
    setVideoMap((prev) => {
      const next = { ...prev, [imageUrl]: videoUrl };
      try {
        window.localStorage.setItem(CS_VIDEO_CACHE_KEY, JSON.stringify(next));
      } catch { /* storage full — ignore */ }
      return next;
    });
  }, []);

  const handleGenerateVideo = useCallback(async (imageId: string) => {
    const imageItem = results.find((r) => r.id === imageId);
    if (!imageItem) return;
    if (generatingVideoIds.has(imageId)) return; // 防止重复触发
    const background: ClothingSwapBackground =
      (restoredParams?.background) ?? lastGeneratedBackground ?? 'model';
    setGeneratingVideoIds((prev) => new Set([...prev, imageId]));
    try {
      const result = await productImagesApi.generateClothingSwapVideo(
        imageItem.imageUrl,
        background,
      );
      // key by imageUrl so the video survives history restores
      saveVideoToCache(imageItem.imageUrl, result.videoUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : (t.cs_video_error || 'Video generation failed');
      setError({ code: 'VIDEO_FAILED', message, severity: 'error' });
    } finally {
      setGeneratingVideoIds((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  }, [generatingVideoIds, lastGeneratedBackground, restoredParams, results, saveVideoToCache, t]);

  const handleDownloadVideo = useCallback(async (imageId: string) => {
    const imageItem = results.find((r) => r.id === imageId);
    const videoUrl = imageItem ? videoMap[imageItem.imageUrl] : undefined;
    if (!videoUrl) return;
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const shortId = imageItem?.imageUrl.split('/').pop()?.replace(/\.[^.]+$/, '') || imageId.slice(0, 8);
      await saveBlobWithPickerFallback(blob, `ai_clothing_swap_video_${shortId}.mp4`);
    } catch (err) {
      const message = err instanceof Error ? err.message : (t.cs_error_download_failed || 'Download failed');
      setError({ code: 'DOWNLOAD_FAILED', message, severity: 'error' });
    }
  }, [results, videoMap, t]);

  const activateHistoryItem = (item: ClothingSwapHistoryItem) => {
    if (!item.outputImages || item.outputImages.length === 0) return;
    setResults(item.outputImages);
    setResultSelectionKey(`history:${item.id}:${item.createdAt}`);
    if (item.settings) {
      setRestoredParams({
        category: item.settings.category,
        targetColor: item.settings.targetColor,
        background: item.settings.background,
        aspectRatio: item.settings.aspectRatio,
        outputCount: item.settings.outputCount,
      });
    }
    setPhase('result');
    setProgress(100);
    setRightPanel('preview');
    setError(null);
  };

  const formatHistoryTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const clampPanelWidth = useCallback((requested: number, min: number, max: number) => (
    Math.min(Math.max(requested, min), max)
  ), []);

  const computeDefaultPanelWidths = useCallback((containerWidth: number) => {
    const leftRaw = (containerWidth * CS_DEFAULT_LEFT_RATIO) / CS_DEFAULT_TOTAL_RATIO;
    const middleRaw = (containerWidth * CS_DEFAULT_MIDDLE_RATIO) / CS_DEFAULT_TOTAL_RATIO;
    let nextLeft = clampPanelWidth(leftRaw, CS_PANEL_MIN_WIDTH, CS_PANEL_MAX_WIDTH);
    let nextMiddle = clampPanelWidth(middleRaw, CS_PANEL_MIN_WIDTH, CS_PANEL_MAX_WIDTH);
    const maxMiddleByContainer = containerWidth - nextLeft - CS_PANEL_MIN_WIDTH;
    nextMiddle = Math.max(CS_PANEL_MIN_WIDTH, Math.min(nextMiddle, maxMiddleByContainer));
    const maxLeftByContainer = containerWidth - nextMiddle - CS_PANEL_MIN_WIDTH;
    nextLeft = Math.max(CS_PANEL_MIN_WIDTH, Math.min(nextLeft, maxLeftByContainer));
    return { nextLeft, nextMiddle };
  }, [clampPanelWidth]);

  const resetPanelWidthsForVisibleLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    if (!Number.isFinite(containerWidth) || containerWidth <= CS_PANEL_MIN_WIDTH * 2) return;
    const { nextLeft, nextMiddle } = computeDefaultPanelWidths(containerWidth);
    setLeftWidth(nextLeft);
    setMiddleWidth(nextMiddle);
  }, [computeDefaultPanelWidths]);

  const handleLeftResize = useCallback((width: number) => {
    const requestedWidth = clampPanelWidth(width, CS_PANEL_MIN_WIDTH, CS_PANEL_MAX_WIDTH);
    const container = containerRef.current;
    if (!container) {
      setLeftWidth(requestedWidth);
      return;
    }
    const containerWidth = container.clientWidth;
    const safeMiddle = Math.max(middleWidth, CS_PANEL_MIN_WIDTH);
    const maxLeftByContainer = containerWidth - safeMiddle - CS_PANEL_MIN_WIDTH;
    const limited = Math.max(CS_PANEL_MIN_WIDTH, Math.min(requestedWidth, maxLeftByContainer));
    setLeftWidth(limited);
  }, [clampPanelWidth, middleWidth]);

  const handleMiddleResize = useCallback((width: number) => {
    const requestedWidth = clampPanelWidth(width, CS_PANEL_MIN_WIDTH, CS_PANEL_MAX_WIDTH);
    const container = containerRef.current;
    if (!container) {
      setMiddleWidth(requestedWidth);
      return;
    }
    const containerWidth = container.clientWidth;
    const safeLeft = Math.max(leftWidth, CS_PANEL_MIN_WIDTH);
    const maxMiddleByContainer = containerWidth - safeLeft - CS_PANEL_MIN_WIDTH;
    const limited = Math.max(CS_PANEL_MIN_WIDTH, Math.min(requestedWidth, maxMiddleByContainer));
    setMiddleWidth(limited);
  }, [clampPanelWidth, leftWidth]);

  useEffect(() => {
    if (!isVisible) return;
    const keepWidthsValid = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.clientWidth;
      const safeLeft = clampPanelWidth(leftWidth, CS_PANEL_MIN_WIDTH, CS_PANEL_MAX_WIDTH);
      const maxMiddleByContainer = containerWidth - safeLeft - CS_PANEL_MIN_WIDTH;
      const nextMiddle = Math.max(
        CS_PANEL_MIN_WIDTH,
        Math.min(clampPanelWidth(middleWidth, CS_PANEL_MIN_WIDTH, CS_PANEL_MAX_WIDTH), maxMiddleByContainer),
      );
      const maxLeftByContainer = containerWidth - nextMiddle - CS_PANEL_MIN_WIDTH;
      const nextLeft = Math.max(CS_PANEL_MIN_WIDTH, Math.min(safeLeft, maxLeftByContainer));
      if (nextLeft !== leftWidth) setLeftWidth(nextLeft);
      if (nextMiddle !== middleWidth) setMiddleWidth(nextMiddle);
    };
    keepWidthsValid();
    window.addEventListener('resize', keepWidthsValid);
    return () => window.removeEventListener('resize', keepWidthsValid);
  }, [clampPanelWidth, isVisible, leftWidth, middleWidth]);

  useEffect(() => {
    if (!isVisible) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const rafId = window.requestAnimationFrame(() => {
      resetPanelWidthsForVisibleLayout();
      timeoutId = window.setTimeout(() => {
        resetPanelWidthsForVisibleLayout();
      }, 120);
    });
    return () => {
      window.cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [isVisible, resetPanelWidthsForVisibleLayout]);

  useEffect(() => {
    if (!isVisible) return;
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    previousContainerWidthRef.current = container.clientWidth;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = entry.contentRect.width;
      const prevWidth = previousContainerWidthRef.current;
      previousContainerWidthRef.current = nextWidth;
      const widthsLookCollapsed =
        leftWidth <= CS_PANEL_MIN_WIDTH + 1 &&
        middleWidth <= CS_PANEL_MIN_WIDTH + 1;
      const containerCanFitDefaultLayout = nextWidth >= CS_PANEL_MIN_WIDTH * 3;
      if ((prevWidth <= 1 || widthsLookCollapsed) && containerCanFitDefaultLayout) {
        window.requestAnimationFrame(() => {
          resetPanelWidthsForVisibleLayout();
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [isVisible, leftWidth, middleWidth, resetPanelWidthsForVisibleLayout]);

  const resetUploaders = () => {
    setModelImage(null);
    setGarmentImage(null);
    setModelUploaderKey((k) => k + 1);
    setGarmentUploaderKey((k) => k + 1);
  };

  return (
    <>
      {phase !== 'error' && (
        <div ref={containerRef} className="relative flex h-full min-h-0 items-stretch overflow-hidden">
          {/* Left: Upload */}
          <section
            className="mr-3 h-full shrink-0 overflow-y-auto rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-[width] duration-100"
            style={{ width: `${leftWidth}px`, minWidth: `${CS_PANEL_MIN_WIDTH}px`, scrollbarColor: 'black transparent', scrollbarWidth: 'thin' }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{t.cs_upload_materials}</h2>
              {(modelImage || garmentImage) && (
                <button
                  type="button"
                  onClick={resetUploaders}
                  className="px-2 py-1 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition"
                >
                  {t.cs_btn_clear}
                </button>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-2">{t.cs_upload_model_title}</h3>
                <ImageUploader
                  key={`${workspaceId}-model-${modelUploaderKey}`}
                  maxFiles={1}
                  previewVariant="first-frame"
                  onFilesSelected={handleModelImagesSelected}
                  onError={(err) => setError({ code: 'UPLOAD_ERROR', message: err, severity: 'warning' })}
                />
              </div>
              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-2">{t.cs_upload_garment_title}</h3>
                <ImageUploader
                  key={`${workspaceId}-garment-${garmentUploaderKey}`}
                  maxFiles={1}
                  previewVariant="first-frame"
                  onFilesSelected={handleGarmentImagesSelected}
                  onError={(err) => setError({ code: 'UPLOAD_ERROR', message: err, severity: 'warning' })}
                />
              </div>
            </div>
          </section>

          <ResizableSplitter
            position={leftWidth}
            minSize={CS_PANEL_MIN_WIDTH}
            onResize={handleLeftResize}
            orientation="vertical"
            className="hover:bg-orange-500/20"
            hitAreaSize={8}
            lineThickness={2}
          />

          {/* Middle: Form */}
          <section
            className="mx-3 h-full shrink-0 overflow-y-auto rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-[width] duration-100"
            style={{ width: `${middleWidth}px`, minWidth: `${CS_PANEL_MIN_WIDTH}px`, scrollbarColor: 'black transparent', scrollbarWidth: 'thin' }}
          >
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">{t.cs_generation_settings}</h2>
            </div>
            <ClothingSwapForm
              modelImage={modelImage}
              garmentImage={garmentImage}
              workspaceId={workspaceId}
              isSubmitting={isGenerating}
              onSubmit={handleGenerateFormSubmit}
              onReset={handleResetLayout}
              defaultParams={restoredParams}
            />
          </section>

          <ResizableSplitter
            position={middleWidth}
            minSize={CS_PANEL_MIN_WIDTH}
            onResize={handleMiddleResize}
            orientation="vertical"
            className="hover:bg-orange-500/20"
            hitAreaSize={8}
            lineThickness={2}
          />

          {/* Right: Result */}
          <section
            className="ml-3 h-full flex-1 overflow-y-auto rounded-2xl border border-white/5 bg-white/[0.02] p-5"
            style={{ minWidth: `${CS_PANEL_MIN_WIDTH}px` }}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">{t.cs_result_preview}</h2>
                {generatingVideoIds.size > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/15 border border-violet-500/30 text-violet-300 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                    {generatingVideoIds.size === 1
                      ? (t.cs_generating_video || '正在生成视频…')
                      : `正在生成 ${generatingVideoIds.size} 个视频…`}
                  </span>
                )}
              </div>
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20 p-1">
                <button
                  type="button"
                  onClick={() => setRightPanel('preview')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition ${
                    rightPanel === 'preview'
                      ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                      : 'border-transparent bg-transparent text-zinc-300 hover:bg-zinc-800/70'
                  }`}
                >
                  {t.cs_preview_tab}
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanel('history')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition ${
                    rightPanel === 'history'
                      ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                      : 'border-transparent bg-transparent text-zinc-300 hover:bg-zinc-800/70'
                  }`}
                >
                  {t.cs_history_tab}
                </button>
              </div>
            </div>

            {rightPanel === 'preview' ? (
              isGenerating ? (
                <div className="flex min-h-[420px] items-center justify-center">
                  <LoadingProgress
                    progress={progress}
                    countdownStartSeconds={CS_COUNTDOWN_SECONDS}
                    startedAtMs={progressStartedAtRef.current || undefined}
                    currentStep={t.cs_generating}
                    totalSteps={1}
                    theme={loadingTheme}
                    backgroundImageSrc={loadingBackgroundSrc}
                    onCancel={handleCancelGeneration}
                  />
                </div>
              ) : hasResults ? (
                <ClothingSwapResult
                  results={results}
                  selectionKey={resultSelectionKey}
                  onRegenerate={handleRegenerate}
                  onDownload={handleDownload}
                  onDownloadAll={handleDownloadAll}
                  onGenerateVideo={(id) => void handleGenerateVideo(id)}
                  generatingVideoIds={generatingVideoIds}
                  videoMap={videoMap}
                  onDownloadVideo={(id) => void handleDownloadVideo(id)}
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                  <div>
                    <p className="text-sm font-medium text-zinc-300">{t.cs_preview_empty_title}</p>
                    <p className="mt-2 text-xs text-zinc-500">{t.cs_preview_empty_desc}</p>
                  </div>
                </div>
              )
            ) : (
              <div className="min-h-[420px] rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
                {historyItems.length === 0 ? (
                  <div className="h-full min-h-[380px] flex items-center justify-center text-zinc-500 text-sm">
                    {t.cs_no_history_yet}
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {historyItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                        <div className="px-3 py-2 border-b border-white/10 bg-black/40 flex items-center justify-between text-xs text-zinc-400">
                          <span>{t.cs_workspace} {item.workspaceOrder}</span>
                          <span>{formatHistoryTime(item.createdAt)}</span>
                        </div>
                        <div className="p-3 grid grid-cols-4 gap-2">
                          {item.outputImages.slice(0, 4).map((img, idx) => (
                            <div key={`${item.id}-${idx}`} className="relative">
                              <img
                                src={img.imageUrl}
                                alt={`history-${item.id}-${idx}`}
                                className="w-full aspect-square object-cover rounded-lg border border-white/10"
                              />
                              {videoMap[img.imageUrl] && (
                                <span className="absolute bottom-0.5 right-0.5 bg-violet-600/90 rounded text-[9px] px-1 py-px text-white font-bold leading-none">
                                  ▶
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="px-3 pb-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => activateHistoryItem(item)}
                            className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
                          >
                            {t.cs_restore_record}
                          </button>
                          {item.outputImages.some((img) => videoMap[img.imageUrl]) && (
                            <button
                              type="button"
                              onClick={() => activateHistoryItem(item)}
                              className="px-3 py-2 rounded-lg text-xs font-semibold bg-violet-500/10 border border-violet-500/30 text-violet-300 hover:bg-violet-500/20 transition"
                              title={t.cs_video_ready || 'Video ready — restore to view'}
                            >
                              ▶ {t.cs_video_ready || 'Video'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {phase === 'error' && error && (
        <ErrorDialog
          isOpen={true}
          error={error}
          onClose={() => setPhase(hasBothImages ? 'form' : 'upload')}
          onRetry={handleErrorRetry}
          showRetry={true}
        />
      )}

      {error && phase !== 'error' && (
        <ErrorDialog
          isOpen={!!error}
          error={error}
          onClose={() => setError(null)}
          onRetry={handleErrorRetry}
          showRetry={true}
        />
      )}
    </>
  );
};

export const ClothingSwapView: React.FC<ClothingSwapViewProps> = ({
  onBack,
  projectId,
  embedded = false,
  isVisible = true,
}) => {
  const { t } = useLanguage();

  const shellClassName = useMemo(
    () => (embedded
      ? 'flex h-full min-h-0 flex-col'
      : 'min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 p-6'),
    [embedded],
  );

  const contentWrapClassName = embedded
    ? 'flex h-full min-h-0 w-full flex-col'
    : 'mx-auto max-w-[1600px] pb-10';

  return (
    <div className={shellClassName}>
      <div className={contentWrapClassName}>
        {!embedded && (
          <div className="flex items-center gap-4 mb-8">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-zinc-800 rounded-lg transition"
                title={t.cs_back}
              >
                <ChevronLeft className="w-6 h-6 text-zinc-400" />
              </button>
            )}
            <h1 className="text-2xl font-bold text-white mb-1">{t.cs_page_title}</h1>
          </div>
        )}
        <ClothingSwapWorkspacePane
          workspaceId="cs-workspace-1"
          workspaceOrder={1}
          projectId={projectId}
          isVisible={isVisible}
        />
      </div>
    </div>
  );
};
