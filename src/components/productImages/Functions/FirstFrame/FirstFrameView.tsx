import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Minus, Plus } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { DropdownSelect } from '../../../common/DropdownSelect';
import { ImageUploader } from '../../Common/ImageUploader';
import { FirstFrameForm } from './FirstFrameForm';
import { FirstFrameResult } from './FirstFrameResult';
import ResizableSplitter from '../../../common/ResizableSplitter';
import { LoadingProgress } from '../../Common/LoadingProgress';
import { ErrorDialog, type ErrorInfo } from '../../Common/ErrorDialog';
import { downloadBlob, productImagesApi } from '../../../../services/productImagesApi';
import { assetsApi } from '../../../../services/assets';
import type { FirstFrameParams, ProductImageResult } from '../../../../types/productImages';
import { deleteImageHistoryItem, notifyImageHistoryUpdated, readImageHistoryByFeature, refreshImageHistory, subscribeImageHistory, type ImageHistoryItem } from '../../../../utils/imageHistory';
import { extractLoadingThemeFromSources, getDefaultLoadingTheme, type LoadingTheme } from '../../../../utils/loadingTheme';
import { useRequireAuth } from '../../../../utils/useRequireAuth';

type Phase = 'upload' | 'form' | 'generating' | 'result' | 'error';

interface FirstFrameWorkspaceMeta {
  id: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

interface FirstFrameHistoryItem {
  id: string;
  workspaceId: string;
  workspaceOrder: number;
  createdAt: string;
  outputImages: ProductImageResult[];
  elapsedSeconds: number | null;
}

interface FirstFrameViewProps {
  onBack?: () => void;
  projectId?: string;
  embedded?: boolean;
  isVisible?: boolean;
  onApplyToWorkbench?: () => void;
  headerActionsContainer?: HTMLElement | null;
}

const FIRST_FRAME_TRANSFER_KEY = 'vflow_apply_first_frame';
const FIRST_FRAME_WORKSPACE_META_KEY = 'vflow_first_frame_workspaces_v1';
const FIRST_FRAME_ACTIVE_WORKSPACE_KEY = 'vflow_first_frame_active_workspace_v1';
const FIRST_FRAME_COUNTDOWN_SECONDS = 120;
const FIRST_FRAME_PROGRESS_HOLD_MAX = 95;
const FIRST_FRAME_PANEL_MIN_WIDTH = 280;
const FIRST_FRAME_PANEL_MAX_WIDTH = 720;
const FIRST_FRAME_LEFT_DEFAULT_WIDTH = 500;
const FIRST_FRAME_MIDDLE_DEFAULT_WIDTH = 600;

const createDefaultWorkspaceMeta = (): FirstFrameWorkspaceMeta => ({
  id: 'ff-workspace-1',
  order: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const sanitizeHistoryImage = (item: any, index: number, historyId: string): ProductImageResult | null => {
  const imageUrl = String(item?.imageUrl || item?.downloadUrl || '').trim();
  if (!imageUrl) return null;

  const rawId = String(item?.id || '').trim();
  const namespacedId = rawId
    ? `first-frame-history-${historyId}-${index}-${rawId}`
    : `first-frame-history-${historyId}-${index}`;

  return {
    id: namespacedId,
    imageUrl,
    downloadUrl: String(item?.downloadUrl || imageUrl),
    format: String(item?.format || 'jpg'),
    category: item?.category,
    metadata: item?.metadata,
    size: typeof item?.size === 'number' ? item.size : undefined,
  };
};

const mapImageHistoryToFirstFrameItem = (item: ImageHistoryItem): FirstFrameHistoryItem | null => {
  if (item.featureType !== 'first_frame') return null;

  const historyId = String(item.id || '').trim();
  const outputImages = (Array.isArray(item.metadata?.outputImages)
    ? item.metadata.outputImages
        .map((img: any, index: number) => sanitizeHistoryImage(img, index, historyId))
        .filter(Boolean)
    : item.images
        .map((imageUrl, index) => sanitizeHistoryImage({ imageUrl, downloadUrl: imageUrl }, index, historyId))
        .filter(Boolean)) as ProductImageResult[];

  if (outputImages.length === 0) return null;

  const rawElapsedSeconds = Number(item.metadata?.elapsedSeconds ?? item.metadata?.elapsed_seconds);
  const elapsedSeconds = Number.isFinite(rawElapsedSeconds) && rawElapsedSeconds > 0
    ? Math.round(rawElapsedSeconds)
    : null;

  return {
    id: item.id,
    workspaceId: item.workspaceId || 'ff-workspace-1',
    workspaceOrder: item.workspaceOrder || 1,
    createdAt: item.createdAt,
    outputImages,
    elapsedSeconds,
  } satisfies FirstFrameHistoryItem;
};

const readWorkspaceMetas = (): FirstFrameWorkspaceMeta[] => {
  if (typeof window === 'undefined') return [createDefaultWorkspaceMeta()];

  try {
    const raw = window.localStorage.getItem(FIRST_FRAME_WORKSPACE_META_KEY);
    if (!raw) return [createDefaultWorkspaceMeta()];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [createDefaultWorkspaceMeta()];

    const normalized = parsed
      .map((item: any, index: number) => {
        const id = String(item?.id || '').trim();
        const orderRaw = Number(item?.order);
        const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.floor(orderRaw) : index + 1;
        const createdAtRaw = Number(item?.createdAt);
        const updatedAtRaw = Number(item?.updatedAt);

        if (!id) return null;

        return {
          id,
          order,
          createdAt: Number.isFinite(createdAtRaw) ? createdAtRaw : Date.now(),
          updatedAt: Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now(),
        } satisfies FirstFrameWorkspaceMeta;
      })
      .filter(Boolean) as FirstFrameWorkspaceMeta[];

    return normalized.length > 0 ? normalized : [createDefaultWorkspaceMeta()];
  } catch {
    return [createDefaultWorkspaceMeta()];
  }
};

interface FirstFrameWorkspacePaneProps {
  workspaceId: string;
  workspaceOrder: number;
  workspaceLabel: string;
  projectId?: string;
  isVisible?: boolean;
  onApplyToWorkbench?: () => void;
}

const FirstFrameWorkspacePane: React.FC<FirstFrameWorkspacePaneProps> = ({
  workspaceId,
  workspaceOrder,
  workspaceLabel,
  projectId,
  isVisible = true,
  onApplyToWorkbench,
}) => {
  const { t } = useLanguage();
  const { requireAuth } = useRequireAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousContainerWidthRef = useRef(0);
  const [leftWidth, setLeftWidth] = useState<number>(FIRST_FRAME_LEFT_DEFAULT_WIDTH);
  const [middleWidth, setMiddleWidth] = useState<number>(FIRST_FRAME_MIDDLE_DEFAULT_WIDTH);

  const [phase, setPhase] = useState<Phase>('upload');
  const [images, setImages] = useState<File[]>([]);
  const [results, setResults] = useState<ProductImageResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [uploaderResetKey, setUploaderResetKey] = useState(0);
  const [rightPanel, setRightPanel] = useState<'preview' | 'history'>('preview');
  const [historyItems, setHistoryItems] = useState<FirstFrameHistoryItem[]>([]);
  const [lastElapsedSeconds, setLastElapsedSeconds] = useState<number | null>(null);
  const [resultSelectionKey, setResultSelectionKey] = useState<string>('');
  const [loadingTheme, setLoadingTheme] = useState<LoadingTheme>(getDefaultLoadingTheme());
  const [loadingBackgroundSrc, setLoadingBackgroundSrc] = useState<string>('');

  const generationSeqRef = useRef(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressStartedAtRef = useRef<number | null>(null);

  const isGenerating = phase === 'generating';
  const hasResults = results.length > 0;

  const refreshWorkspaceHistory = useCallback(async () => {
    await refreshImageHistory();
    const filtered = (readImageHistoryByFeature('first_frame')
      .map((item) => mapImageHistoryToFirstFrameItem(item))
      .filter(Boolean) as FirstFrameHistoryItem[])
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
    if (images.length === 0) {
      setLoadingTheme(getDefaultLoadingTheme());
      setLoadingBackgroundSrc('');
      return;
    }

    const objectUrls = images.map((file) => URL.createObjectURL(file));
    setLoadingBackgroundSrc(objectUrls[0] || '');
    void extractLoadingThemeFromSources(objectUrls).then((theme) => {
      if (alive) setLoadingTheme(theme);
    });

    return () => {
      alive = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [images]);

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
      const ratio = Math.max(0, Math.min(1, elapsedMs / (FIRST_FRAME_COUNTDOWN_SECONDS * 1000)));
      const eased = 1 - Math.pow(1 - ratio, 1.8);
      const simulated = Math.round(eased * FIRST_FRAME_PROGRESS_HOLD_MAX);

      setProgress((prev) => Math.max(prev, Math.min(FIRST_FRAME_PROGRESS_HOLD_MAX, Math.max(2, simulated))));
    }, 800);
  }, [clearProgressTimer]);

  useEffect(() => () => {
    clearProgressTimer();
  }, [clearProgressTimer]);

  const handleImagesSelected = useCallback((files: File[]) => {
    setImages(files);
    setError(null);
    setProgress(0);
    setResults([]);
    setLastElapsedSeconds(null);
    setPhase(files.length > 0 ? 'form' : 'upload');
  }, []);

  const handleGenerateFormSubmit = async (params: FirstFrameParams) => {
    if (!requireAuth()) return;
    if (images.length === 0) {
      setError({
        code: 'NO_IMAGES',
        message: t.ff_error_upload_product_image_first,
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
      startProgressSimulation();

      const response = await productImagesApi.generateFirstFrame(images, params, projectId, {
        workspaceId,
        workspaceOrder,
      });
      if (generationSeqRef.current !== runSeq) return;

      clearProgressTimer();
      setProgress(100);
      const completedElapsedSeconds = progressStartedAtRef.current
        ? Math.max(1, Math.floor((Date.now() - progressStartedAtRef.current) / 1000))
        : null;
      setLastElapsedSeconds(completedElapsedSeconds);
      progressStartedAtRef.current = null;

      if (response.status === 'completed' && response.outputImages && response.outputImages.length > 0) {
        setResults(response.outputImages);
        setResultSelectionKey(`generation:${workspaceId}:${Date.now()}`);
        await refreshWorkspaceHistory();
        notifyImageHistoryUpdated();
        setPhase('result');
        return;
      }

      setError({
        code: 'GENERATION_FAILED',
        message: t.ff_error_generation_failed,
        severity: 'error',
        suggestion: t.ff_error_suggestion_clear_front_image,
      });
      setPhase('error');
    } catch (err) {
      if (generationSeqRef.current !== runSeq) return;

      clearProgressTimer();
      const message = err instanceof Error ? err.message : t.ff_unknown_error;
      setError({
        code: 'GENERATION_ERROR',
        message,
        severity: 'error',
        suggestion: t.ff_error_suggestion_check_network,
      });
      setPhase('error');
    }
  };

  const handleCancelGeneration = () => {
    generationSeqRef.current += 1;
    clearProgressTimer();
    progressStartedAtRef.current = null;
    setLastElapsedSeconds(null);
    setPhase(images.length > 0 ? 'form' : 'upload');
    setProgress(0);
  };

  const handleRegenerate = () => {
    setResults([]);
    setLastElapsedSeconds(null);
    setPhase('form');
    setProgress(0);
    setError(null);
    setRightPanel('preview');
  };

  const handleResetLayout = useCallback(() => {
    generationSeqRef.current += 1;
    clearProgressTimer();
    progressStartedAtRef.current = null;

    setImages([]);
    setResults([]);
    setLastElapsedSeconds(null);
    setProgress(0);
    setError(null);
    setPhase('upload');
    setUploaderResetKey((prev) => prev + 1);
  }, [clearProgressTimer]);

  const buildFileName = useCallback((prefix: string, index: number, imageId: string) => {
    const safePrefix = prefix.trim() || 'ai_first_frame';
    const shortId = imageId.slice(0, 8);
    return `${safePrefix}_${index + 1}_${shortId}.jpg`;
  }, []);

  const handleDownload = async (imageId: string, filename?: string) => {
    try {
      const index = results.findIndex((item) => item.id === imageId);
      const selected = index >= 0 ? results[index] : null;
      if (!selected) return;

      const blob = await productImagesApi.downloadImageByUrl(selected.imageUrl);
      const nextName = filename || buildFileName('ai_first_frame', Math.max(index, 0), imageId);
      downloadBlob(blob, nextName);
    } catch {
      setError({
        code: 'DOWNLOAD_FAILED',
        message: t.ff_error_download_failed,
        severity: 'error',
      });
    }
  };

  const handleDownloadAll = async (prefix: string) => {
    for (let i = 0; i < results.length; i += 1) {
      const item = results[i];
      // Keep sequential order so filenames are deterministic.
      // eslint-disable-next-line no-await-in-loop
      await handleDownload(item.id, buildFileName(prefix, i, item.id));
    }
  };

  const applyToWorkbench = (image: ProductImageResult) => {
    const payload = {
      imageUrl: image.imageUrl,
      imageName: t.ff_ai_first_frame_name,
      timestamp: new Date().toISOString(),
      firstFrameWorkspaceId: workspaceId,
      firstFrameWorkspaceOrder: workspaceOrder,
    };

    window.localStorage.setItem(FIRST_FRAME_TRANSFER_KEY, JSON.stringify(payload));
    onApplyToWorkbench?.();
  };

  const buildAssetFileName = (image: ProductImageResult, index: number) => {
    const rawFormat = String(image.format || '').trim().toLowerCase();
    const url = String(image.imageUrl || '').toLowerCase();
    const extension = rawFormat
      || (url.endsWith('.png') ? 'png' : '')
      || (url.endsWith('.webp') ? 'webp' : '')
      || 'jpg';

    const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension;
    return buildFileName('ai_first_frame', Math.max(index, 0), image.id).replace(/\.jpg$/i, `.${normalizedExtension}`);
  };

  const handleSaveToAssets = async (imageId: string): Promise<boolean> => {
    if (!requireAuth()) return false;

    const image = results.find((r) => r.id === imageId);
    if (!image) {
      throw new Error('Selected image not found');
    }

    try {
      const index = results.findIndex((item) => item.id === imageId);
      const blob = await productImagesApi.downloadImageByUrl(image.imageUrl);
      const fileName = buildAssetFileName(image, index);
      const fileType = blob.type || `image/${fileName.toLowerCase().endsWith('.png') ? 'png' : fileName.toLowerCase().endsWith('.webp') ? 'webp' : 'jpeg'}`;
      const file = new File([blob], fileName, { type: fileType });
      await assetsApi.uploadAsset(file, 'product');
      return true;
    } catch (error) {
      setError({
        code: 'SAVE_TO_ASSETS_FAILED',
        message: t.ff_error_save_to_image_assets_failed,
        severity: 'error',
      });
      throw error;
    }
  };

  const handleNextStep = (imageId: string) => {
    const image = results.find((r) => r.id === imageId);
    if (!image) return;
    applyToWorkbench(image);
  };

  const handleErrorRetry = () => {
    setError(null);
    if (phase === 'error') {
      setPhase(images.length > 0 ? 'form' : 'upload');
    }
  };

  const activateHistoryItem = (item: FirstFrameHistoryItem) => {
    if (!item.outputImages || item.outputImages.length === 0) return;
    setResults(item.outputImages);
    setLastElapsedSeconds(item.elapsedSeconds);
    setResultSelectionKey(`history:${item.id}:${item.createdAt}`);
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

  const resetPanelWidthsForVisibleLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth;
    if (!Number.isFinite(containerWidth) || containerWidth <= FIRST_FRAME_PANEL_MIN_WIDTH * 2) return;

    let nextLeft = clampPanelWidth(
      FIRST_FRAME_LEFT_DEFAULT_WIDTH,
      FIRST_FRAME_PANEL_MIN_WIDTH,
      FIRST_FRAME_PANEL_MAX_WIDTH
    );
    let nextMiddle = clampPanelWidth(
      FIRST_FRAME_MIDDLE_DEFAULT_WIDTH,
      FIRST_FRAME_PANEL_MIN_WIDTH,
      FIRST_FRAME_PANEL_MAX_WIDTH
    );

    const maxMiddleByContainer = containerWidth - nextLeft - FIRST_FRAME_PANEL_MIN_WIDTH;
    nextMiddle = Math.max(
      FIRST_FRAME_PANEL_MIN_WIDTH,
      Math.min(nextMiddle, maxMiddleByContainer)
    );

    const maxLeftByContainer = containerWidth - nextMiddle - FIRST_FRAME_PANEL_MIN_WIDTH;
    nextLeft = Math.max(
      FIRST_FRAME_PANEL_MIN_WIDTH,
      Math.min(nextLeft, maxLeftByContainer)
    );

    setLeftWidth(nextLeft);
    setMiddleWidth(nextMiddle);
  }, [clampPanelWidth]);

  const handleLeftResize = useCallback((width: number) => {
    const requestedWidth = clampPanelWidth(width, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH);
    const container = containerRef.current;
    if (!container) {
      setLeftWidth(requestedWidth);
      return;
    }

    const containerWidth = container.clientWidth;
    const safeMiddle = Math.max(middleWidth, FIRST_FRAME_PANEL_MIN_WIDTH);
    const maxLeftByContainer = containerWidth - safeMiddle - FIRST_FRAME_PANEL_MIN_WIDTH;
    const limitedWidth = Math.max(FIRST_FRAME_PANEL_MIN_WIDTH, Math.min(requestedWidth, maxLeftByContainer));
    setLeftWidth(limitedWidth);
  }, [clampPanelWidth, middleWidth]);

  const handleMiddleResize = useCallback((width: number) => {
    const requestedWidth = clampPanelWidth(width, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH);
    const container = containerRef.current;
    if (!container) {
      setMiddleWidth(requestedWidth);
      return;
    }

    const containerWidth = container.clientWidth;
    const safeLeft = Math.max(leftWidth, FIRST_FRAME_PANEL_MIN_WIDTH);
    const maxMiddleByContainer = containerWidth - safeLeft - FIRST_FRAME_PANEL_MIN_WIDTH;
    const limitedWidth = Math.max(FIRST_FRAME_PANEL_MIN_WIDTH, Math.min(requestedWidth, maxMiddleByContainer));
    setMiddleWidth(limitedWidth);
  }, [clampPanelWidth, leftWidth]);

  useEffect(() => {
    if (!isVisible) return;

    const keepWidthsValid = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const safeLeft = clampPanelWidth(leftWidth, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH);
      const maxMiddleByContainer = containerWidth - safeLeft - FIRST_FRAME_PANEL_MIN_WIDTH;
      const nextMiddle = Math.max(
        FIRST_FRAME_PANEL_MIN_WIDTH,
        Math.min(clampPanelWidth(middleWidth, FIRST_FRAME_PANEL_MIN_WIDTH, FIRST_FRAME_PANEL_MAX_WIDTH), maxMiddleByContainer)
      );

      const maxLeftByContainer = containerWidth - nextMiddle - FIRST_FRAME_PANEL_MIN_WIDTH;
      const nextLeft = Math.max(
        FIRST_FRAME_PANEL_MIN_WIDTH,
        Math.min(safeLeft, maxLeftByContainer)
      );

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
        leftWidth <= FIRST_FRAME_PANEL_MIN_WIDTH + 1 &&
        middleWidth <= FIRST_FRAME_PANEL_MIN_WIDTH + 1;
      const containerCanFitDefaultLayout =
        nextWidth >= FIRST_FRAME_LEFT_DEFAULT_WIDTH + FIRST_FRAME_MIDDLE_DEFAULT_WIDTH + FIRST_FRAME_PANEL_MIN_WIDTH;

      if ((prevWidth <= 1 || widthsLookCollapsed) && containerCanFitDefaultLayout) {
        window.requestAnimationFrame(() => {
          resetPanelWidthsForVisibleLayout();
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isVisible, leftWidth, middleWidth, resetPanelWidthsForVisibleLayout]);

  return (
    <>
      {phase !== 'error' && (
        <div ref={containerRef} className="flex min-h-0 overflow-hidden relative">
          <section
            className="self-start rounded-2xl border border-white/5 bg-white/[0.02] p-5 shrink-0 transition-[width] duration-100 mr-3"
            style={{ width: `${leftWidth}px`, minWidth: `${FIRST_FRAME_PANEL_MIN_WIDTH}px` }}
          >
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">
                {t.ff_upload_materials}
              </h2>
            </div>
            <ImageUploader
              key={`${workspaceId}-${uploaderResetKey}`}
              maxFiles={1}
              uploadedStatusText={
                images.length > 0
                  ? `${t.ff_uploaded_status_prefix} ${images.length} ${t.ff_uploaded_status_suffix}`
                  : undefined
              }
              onFilesSelected={handleImagesSelected}
              onError={(err) =>
                setError({
                  code: 'UPLOAD_ERROR',
                  message: err,
                  severity: 'warning',
                })
              }
            />
          </section>

          <ResizableSplitter
            position={leftWidth}
            minSize={FIRST_FRAME_PANEL_MIN_WIDTH}
            onResize={handleLeftResize}
            orientation="vertical"
            className="hover:bg-orange-500/20"
            hitAreaSize={8}
            lineThickness={2}
          />

          <section
            className="self-start rounded-2xl border border-white/5 bg-white/[0.02] p-5 shrink-0 transition-[width] duration-100 mx-3"
            style={{ width: `${middleWidth}px`, minWidth: `${FIRST_FRAME_PANEL_MIN_WIDTH}px` }}
          >
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">
                {t.ff_generation_settings}
              </h2>
            </div>

            <FirstFrameForm
              images={images}
              isSubmitting={isGenerating}
              onSubmit={handleGenerateFormSubmit}
              onReset={handleResetLayout}
            />
          </section>

          <ResizableSplitter
            position={middleWidth}
            minSize={FIRST_FRAME_PANEL_MIN_WIDTH}
            onResize={handleMiddleResize}
            orientation="vertical"
            className="hover:bg-orange-500/20"
            hitAreaSize={8}
            lineThickness={2}
          />

          <section
            className="self-start rounded-2xl border border-white/5 bg-white/[0.02] p-5 flex-1 ml-3"
            style={{ minWidth: `${FIRST_FRAME_PANEL_MIN_WIDTH}px` }}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {t.ff_result_preview}
                </h2>
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
                  {t.ff_preview_tab}
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
                  {t.ff_history_tab}
                </button>
              </div>
            </div>

            {rightPanel === 'preview' ? (
              isGenerating ? (
                <div className="flex min-h-[420px] items-center justify-center">
                  <LoadingProgress
                    progress={progress}
                    countdownStartSeconds={FIRST_FRAME_COUNTDOWN_SECONDS}
                    startedAtMs={progressStartedAtRef.current || undefined}
                    currentStep={t.ff_generating_first_frame_images}
                    totalSteps={3}
                    theme={loadingTheme}
                    backgroundImageSrc={loadingBackgroundSrc}
                    onCancel={handleCancelGeneration}
                  />
                </div>
              ) : hasResults ? (
                <FirstFrameResult
                  results={results}
                  elapsedSeconds={lastElapsedSeconds}
                  selectionKey={resultSelectionKey}
                  onRegenerate={handleRegenerate}
                  onDownload={handleDownload}
                  onDownloadAll={handleDownloadAll}
                  onSaveToAssets={handleSaveToAssets}
                  onNextStep={handleNextStep}
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                  <div>
                    <p className="text-sm font-medium text-zinc-300">
                      {t.ff_generate_after_finishing_settings}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {t.ff_generated_images_will_appear_here}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="min-h-[420px] rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
                {historyItems.length === 0 ? (
                  <div className="h-full min-h-[380px] flex items-center justify-center text-zinc-500 text-sm">
                    {t.ff_no_history_yet}
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {historyItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                        <div className="px-3 py-2 border-b border-white/10 bg-black/40 flex items-center justify-between text-xs text-zinc-400">
                          <span>{t.ff_workspace} {item.workspaceOrder}</span>
                          <span>{formatHistoryTime(item.createdAt)}</span>
                        </div>
                        <div className="p-3 grid grid-cols-4 gap-2">
                          {item.outputImages.slice(0, 4).map((img, idx) => (
                            <img
                              key={`${item.id}-${idx}`}
                              src={img.imageUrl}
                              alt={`${workspaceLabel}-${idx}`}
                              className="w-full aspect-square object-cover rounded-lg border border-white/10"
                            />
                          ))}
                        </div>
                        <div className="px-3 pb-3">
                          <button
                            type="button"
                            onClick={() => activateHistoryItem(item)}
                            className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition"
                          >
                            {t.ff_restore_this_record}
                          </button>
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
          onClose={() => setPhase(images.length > 0 ? 'form' : 'upload')}
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

export const FirstFrameView: React.FC<FirstFrameViewProps> = ({
  onBack,
  projectId,
  embedded = false,
  isVisible = true,
  onApplyToWorkbench,
  headerActionsContainer,
}) => {
  const { t } = useLanguage();

  const initialWorkspaceMetas = useMemo(() => readWorkspaceMetas(), []);
  const [workspaceMetas, setWorkspaceMetas] = useState<FirstFrameWorkspaceMeta[]>(initialWorkspaceMetas);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    if (typeof window === 'undefined') return initialWorkspaceMetas[0]?.id || createDefaultWorkspaceMeta().id;

    const stored = String(window.localStorage.getItem(FIRST_FRAME_ACTIVE_WORKSPACE_KEY) || '').trim();
    if (stored && initialWorkspaceMetas.some((ws) => ws.id === stored)) {
      return stored;
    }

    return initialWorkspaceMetas[0]?.id || createDefaultWorkspaceMeta().id;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FIRST_FRAME_WORKSPACE_META_KEY, JSON.stringify(workspaceMetas));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [workspaceMetas]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FIRST_FRAME_ACTIVE_WORKSPACE_KEY, activeWorkspaceId);
    } catch {
      // Ignore localStorage write failures.
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (workspaceMetas.length === 0) {
      const fallback = createDefaultWorkspaceMeta();
      setWorkspaceMetas([fallback]);
      setActiveWorkspaceId(fallback.id);
      return;
    }

    if (!workspaceMetas.some((workspace) => workspace.id === activeWorkspaceId)) {
      setActiveWorkspaceId(workspaceMetas[0].id);
    }
  }, [activeWorkspaceId, workspaceMetas]);

  const workspaceLabel = useCallback((workspace: FirstFrameWorkspaceMeta) => (
    `${t.ff_workspace} ${workspace.order}`
  ), [t]);

  const workspaceOptions = useMemo(
    () => workspaceMetas.map((workspace) => ({
      value: workspace.id,
      label: workspaceLabel(workspace),
    })),
    [workspaceMetas, workspaceLabel]
  );

  const createWorkspace = () => {
    const occupiedOrders = new Set(
      workspaceMetas
        .map((workspace) => workspace.order)
        .filter((order) => Number.isFinite(order) && order > 0)
    );
    let order = 1;
    while (occupiedOrders.has(order)) {
      order += 1;
    }

    const now = Date.now();
    const newWorkspace: FirstFrameWorkspaceMeta = {
      id: `ff-workspace-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      order,
      createdAt: now,
      updatedAt: now,
    };

    setWorkspaceMetas((prev) => [newWorkspace, ...prev]);
    setActiveWorkspaceId(newWorkspace.id);
  };

  const switchWorkspace = (workspaceId: string) => {
    const id = String(workspaceId || '').trim();
    if (!id) return;

    setActiveWorkspaceId(id);
    setWorkspaceMetas((prev) => prev.map((workspace) => (
      workspace.id === id
        ? { ...workspace, updatedAt: Date.now() }
        : workspace
    )));
  };

  const deleteWorkspace = useCallback((workspaceId: string) => {
    const id = String(workspaceId || '').trim();
    if (!id || workspaceMetas.length <= 1) return;

    const nextWorkspaces = workspaceMetas.filter((workspace) => workspace.id !== id);
    if (nextWorkspaces.length === workspaceMetas.length) return;

    setWorkspaceMetas(nextWorkspaces);
    if (activeWorkspaceId === id && nextWorkspaces[0]) {
      setActiveWorkspaceId(nextWorkspaces[0].id);
    }

    readImageHistoryByFeature('first_frame')
      .filter((item) => (item.workspaceId || 'ff-workspace-1') === id)
      .forEach((item) => {
        deleteImageHistoryItem(item.id);
      });
  }, [activeWorkspaceId, workspaceMetas]);

  const shellClassName = useMemo(
    () => (embedded
      ? 'h-full'
      : 'min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 p-6'),
    [embedded]
  );

  const contentWrapClassName = embedded ? 'w-full' : 'max-w-[1600px] mx-auto';
  const workspaceActions = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-48">
        <DropdownSelect
          value={activeWorkspaceId}
          options={workspaceOptions}
          onChange={(value) => switchWorkspace(String(value || ''))}
          buttonClassName="w-full bg-zinc-900/70 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          iconClassName="w-4 h-4 text-zinc-500"
          optionClassName="text-xs"
          renderOption={({ option, isSelected, onSelect }) => {
            const canDelete = workspaceMetas.length > 1;
            const targetWorkspace = workspaceMetas.find((workspace) => workspace.id === option.value);
            const optionTitle = targetWorkspace ? workspaceLabel(targetWorkspace) : String(option.value || '');

            return (
              <div
                className={`group flex items-center gap-2 px-3 py-2 text-xs transition ${
                  isSelected ? 'bg-white/5 text-white' : 'text-zinc-200 hover:bg-white/5'
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={onSelect}
                >
                  <span className="block truncate">{option.label}</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteWorkspace(option.value);
                  }}
                  disabled={!canDelete}
                  className={`shrink-0 rounded-full p-0.5 transition ${
                    canDelete
                      ? 'opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300'
                      : 'opacity-0 pointer-events-none'
                  }`}
                  aria-label={`Delete ${optionTitle}`}
                  title={canDelete ? `Delete ${optionTitle}` : undefined}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current">
                    <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </span>
                </button>
              </div>
            );
          }}
        />
      </div>
      <button
        type="button"
        onClick={createWorkspace}
        className="px-3 py-2 rounded-xl text-xs font-semibold bg-orange-500/10 border border-orange-500/40 text-orange-300 hover:bg-orange-500/20 transition inline-flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        {t.ff_new_workspace}
      </button>
    </div>
  );

  return (
    <div className={shellClassName}>
      <div className={`${contentWrapClassName} pb-10`}>
        {!embedded && (
          <div className="flex items-center gap-4 mb-8">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-zinc-800 rounded-lg transition"
                title={t.ff_back}
              >
                <ChevronLeft className="w-6 h-6 text-zinc-400" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                {t.ff_page_title}
              </h1>
            </div>

            <div className="ml-auto">
              {workspaceActions}
            </div>
          </div>
        )}

        {embedded && headerActionsContainer ? createPortal(workspaceActions, headerActionsContainer) : null}

        {workspaceMetas.map((workspace) => (
          <div
            key={workspace.id}
            className={workspace.id === activeWorkspaceId ? 'block' : 'hidden'}
            aria-hidden={workspace.id !== activeWorkspaceId}
          >
            <FirstFrameWorkspacePane
              workspaceId={workspace.id}
              workspaceOrder={workspace.order}
              workspaceLabel={workspaceLabel(workspace)}
              projectId={projectId}
              isVisible={isVisible && workspace.id === activeWorkspaceId}
              onApplyToWorkbench={onApplyToWorkbench}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
