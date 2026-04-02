import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { DropdownSelect } from '../../../common/DropdownSelect';
import { ImageUploader } from '../../Common/ImageUploader';
import { FirstFrameForm } from './FirstFrameForm';
import { FirstFrameResult } from './FirstFrameResult';
import { LoadingProgress } from '../../Common/LoadingProgress';
import { ErrorDialog, type ErrorInfo } from '../../Common/ErrorDialog';
import { downloadBlob, productImagesApi } from '../../../../services/productImagesApi';
import type { FirstFrameParams, ProductImageResult } from '../../../../types/productImages';

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
}

interface FirstFrameViewProps {
  onBack?: () => void;
  projectId?: string;
  embedded?: boolean;
  onApplyToWorkbench?: () => void;
}

const FIRST_FRAME_TRANSFER_KEY = 'vflow_apply_first_frame';
const FIRST_FRAME_HISTORY_KEY = 'vflow_first_frame_history_v1';
const FIRST_FRAME_WORKSPACE_META_KEY = 'vflow_first_frame_workspaces_v1';
const FIRST_FRAME_ACTIVE_WORKSPACE_KEY = 'vflow_first_frame_active_workspace_v1';
const FIRST_FRAME_COUNTDOWN_SECONDS = 120;
const FIRST_FRAME_PROGRESS_HOLD_MAX = 95;

const createDefaultWorkspaceMeta = (): FirstFrameWorkspaceMeta => ({
  id: 'ff-workspace-1',
  order: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const sanitizeHistoryImage = (item: any, index: number): ProductImageResult | null => {
  const imageUrl = String(item?.imageUrl || item?.downloadUrl || '').trim();
  if (!imageUrl) return null;

  return {
    id: String(item?.id || `first-frame-history-${Date.now()}-${index}`),
    imageUrl,
    downloadUrl: String(item?.downloadUrl || imageUrl),
    format: String(item?.format || 'jpg'),
    category: item?.category,
    metadata: item?.metadata,
    size: typeof item?.size === 'number' ? item.size : undefined,
  };
};

const readFirstFrameHistory = (): FirstFrameHistoryItem[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(FIRST_FRAME_HISTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: any) => {
        const id = String(item?.id || '').trim();
        const workspaceId = String(item?.workspaceId || '').trim();
        const createdAt = String(item?.createdAt || '').trim();
        const workspaceOrderRaw = Number(item?.workspaceOrder);
        const workspaceOrder = Number.isFinite(workspaceOrderRaw) && workspaceOrderRaw > 0
          ? Math.floor(workspaceOrderRaw)
          : 1;

        const outputImages = Array.isArray(item?.outputImages)
          ? item.outputImages
              .map((img: any, index: number) => sanitizeHistoryImage(img, index))
              .filter(Boolean) as ProductImageResult[]
          : [];

        if (!id || !workspaceId || !createdAt || outputImages.length === 0) return null;

        return {
          id,
          workspaceId,
          workspaceOrder,
          createdAt,
          outputImages,
        } satisfies FirstFrameHistoryItem;
      })
      .filter(Boolean) as FirstFrameHistoryItem[];
  } catch {
    return [];
  }
};

const writeFirstFrameHistory = (items: FirstFrameHistoryItem[]) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(FIRST_FRAME_HISTORY_KEY, JSON.stringify(items));
  } catch {
    // Ignore localStorage write failures.
  }
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
  onApplyToWorkbench?: () => void;
}

const FirstFrameWorkspacePane: React.FC<FirstFrameWorkspacePaneProps> = ({
  workspaceId,
  workspaceOrder,
  workspaceLabel,
  projectId,
  onApplyToWorkbench,
}) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);

  const [phase, setPhase] = useState<Phase>('upload');
  const [images, setImages] = useState<File[]>([]);
  const [results, setResults] = useState<ProductImageResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [uploaderResetKey, setUploaderResetKey] = useState(0);
  const [rightPanel, setRightPanel] = useState<'preview' | 'history'>('preview');
  const [historyItems, setHistoryItems] = useState<FirstFrameHistoryItem[]>([]);

  const generationSeqRef = useRef(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressStartedAtRef = useRef<number | null>(null);

  const isGenerating = phase === 'generating';
  const hasResults = results.length > 0;

  const refreshWorkspaceHistory = useCallback(() => {
    const all = readFirstFrameHistory();
    const filtered = all
      .filter((item) => item.workspaceId === workspaceId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    setHistoryItems(filtered);
  }, [workspaceId]);

  useEffect(() => {
    refreshWorkspaceHistory();
  }, [refreshWorkspaceHistory]);

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

  const appendHistory = useCallback((generated: ProductImageResult[]) => {
    const outputImages = generated
      .map((item, index) => sanitizeHistoryImage(item, index))
      .filter(Boolean) as ProductImageResult[];

    if (outputImages.length === 0) return;

    const nextItem: FirstFrameHistoryItem = {
      id: `ff-history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspaceId,
      workspaceOrder,
      createdAt: new Date().toISOString(),
      outputImages,
    };

    const all = [nextItem, ...readFirstFrameHistory()].slice(0, 200);
    writeFirstFrameHistory(all);

    const filtered = all
      .filter((item) => item.workspaceId === workspaceId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    setHistoryItems(filtered);
  }, [workspaceId, workspaceOrder]);

  const handleImagesSelected = useCallback((files: File[]) => {
    setImages(files);
    setError(null);
    setProgress(0);
    setResults([]);
    setPhase(files.length > 0 ? 'form' : 'upload');
  }, []);

  const handleGenerateFormSubmit = async (params: FirstFrameParams) => {
    if (images.length === 0) {
      setError({
        code: 'NO_IMAGES',
        message: tr('请先上传商品图片', 'Please upload a product image first'),
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

      const response = await productImagesApi.generateFirstFrame(images, params, projectId);
      if (generationSeqRef.current !== runSeq) return;

      clearProgressTimer();
      setProgress(100);

      if (response.status === 'completed' && response.outputImages && response.outputImages.length > 0) {
        setResults(response.outputImages);
        appendHistory(response.outputImages);
        setPhase('result');
        return;
      }

      setError({
        code: 'GENERATION_FAILED',
        message: tr('生成失败，请检查输入并重试', 'Generation failed. Please check your input and try again.'),
        severity: 'error',
        suggestion: tr('确保上传的是清晰、正面展示的商品图片', 'Use a clear front-facing product image.'),
      });
      setPhase('error');
    } catch (err) {
      if (generationSeqRef.current !== runSeq) return;

      clearProgressTimer();
      const message = err instanceof Error ? err.message : tr('未知错误', 'Unknown error');
      setError({
        code: 'GENERATION_ERROR',
        message,
        severity: 'error',
        suggestion: tr('请检查网络连接并稍后重试', 'Please check your network and try again later.'),
      });
      setPhase('error');
    }
  };

  const handleCancelGeneration = () => {
    generationSeqRef.current += 1;
    clearProgressTimer();
    progressStartedAtRef.current = null;
    setPhase(images.length > 0 ? 'form' : 'upload');
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

    setImages([]);
    setResults([]);
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
        message: tr('下载失败，请重试', 'Download failed. Please retry.'),
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
      imageName: tr('AI首帧图', 'AI First Frame'),
      timestamp: new Date().toISOString(),
      firstFrameWorkspaceId: workspaceId,
      firstFrameWorkspaceOrder: workspaceOrder,
    };

    window.localStorage.setItem(FIRST_FRAME_TRANSFER_KEY, JSON.stringify(payload));
    onApplyToWorkbench?.();
  };

  const handleSetAsFirstFrame = (imageId: string) => {
    const image = results.find((r) => r.id === imageId);
    if (!image) return;
    applyToWorkbench(image);
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

  return (
    <>
      {phase !== 'error' && (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(280px,1fr)_minmax(380px,1.2fr)_minmax(320px,1fr)]">
          <section className="self-start rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">
                {tr('素材上传', 'Upload Materials')}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {tr('上传 1 张商品图，用于首帧图生成', 'Upload one product image for first-frame generation')}
              </p>
            </div>
            <ImageUploader
              key={`${workspaceId}-${uploaderResetKey}`}
              maxFiles={1}
              uploadedStatusText={
                images.length > 0
                  ? `${tr('已上传', 'Uploaded')} ${images.length} ${tr('张商品图', 'product image(s)')}`
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

          <section className="self-start rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">
                {tr('生成配置', 'Generation Settings')}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {tr('保留原有功能选项，只调整为连续配置视图', 'Keep the existing options and configure them in a single view')}
              </p>
            </div>

            <FirstFrameForm
              images={images}
              isSubmitting={isGenerating}
              onSubmit={handleGenerateFormSubmit}
              onReset={handleResetLayout}
            />
          </section>

          <section className="self-start rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {tr('结果预览', 'Result Preview')}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {tr('在这里查看生成结果并进行下载或应用', 'Preview results here and continue with download or apply')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRightPanel('preview')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition border ${
                    rightPanel === 'preview'
                      ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                      : 'bg-zinc-900/70 border-white/10 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {tr('预览区', 'Preview')}
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanel('history')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition border ${
                    rightPanel === 'history'
                      ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                      : 'bg-zinc-900/70 border-white/10 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {tr('历史记录', 'History')}
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
                    currentStep={tr('生成首帧图中', 'Generating first-frame images')}
                    totalSteps={3}
                    onCancel={handleCancelGeneration}
                  />
                </div>
              ) : hasResults ? (
                <FirstFrameResult
                  results={results}
                  onRegenerate={handleRegenerate}
                  onDownload={handleDownload}
                  onDownloadAll={handleDownloadAll}
                  onSetAsFirstFrame={handleSetAsFirstFrame}
                  onNextStep={handleNextStep}
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                  <div>
                    <p className="text-sm font-medium text-zinc-300">
                      {tr('完成配置后点击生成', 'Generate after finishing the settings')}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {tr('生成结果将在这里展示', 'Generated images will appear here')}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="min-h-[420px] rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
                {historyItems.length === 0 ? (
                  <div className="h-full min-h-[380px] flex items-center justify-center text-zinc-500 text-sm">
                    {tr('暂无历史记录', 'No history yet')}
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {historyItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                        <div className="px-3 py-2 border-b border-white/10 bg-black/40 flex items-center justify-between text-xs text-zinc-400">
                          <span>{tr('工作区', 'Workspace')} {item.workspaceOrder}</span>
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
                            {tr('恢复此记录', 'Restore This Record')}
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
  onApplyToWorkbench,
}) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);

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

  const nextWorkspaceOrderRef = useRef(
    Math.max(...initialWorkspaceMetas.map((ws) => ws.order), 0) + 1
  );

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
    tr(`工作区 ${workspace.order}`, `Workspace ${workspace.order}`)
  ), [isZh]);

  const workspaceOptions = useMemo(
    () => workspaceMetas.map((workspace) => ({
      value: workspace.id,
      label: workspaceLabel(workspace),
    })),
    [workspaceMetas, workspaceLabel]
  );

  const createWorkspace = () => {
    const order = nextWorkspaceOrderRef.current;
    nextWorkspaceOrderRef.current += 1;

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

  const shellClassName = useMemo(
    () => (embedded
      ? 'h-full'
      : 'min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 p-6'),
    [embedded]
  );

  const contentWrapClassName = embedded ? 'w-full' : 'max-w-[1600px] mx-auto';

  return (
    <div className={shellClassName}>
      <div className={`${contentWrapClassName} pb-10`}>
        <div className={`flex items-center gap-4 ${embedded ? 'mb-4' : 'mb-8'}`}>
          {!embedded && onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-zinc-800 rounded-lg transition"
              title={tr('返回', 'Back')}
            >
              <ChevronLeft className="w-6 h-6 text-zinc-400" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              {tr('AI首帧图生成', 'AI First-Frame Generator')}
            </h1>
            <p className="text-zinc-400 text-sm">
              {tr('为视频生成提供起始视觉素材', 'Generate hand-held product key frames for video workflow')}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="w-48">
              <DropdownSelect
                value={activeWorkspaceId}
                options={workspaceOptions}
                onChange={(value) => switchWorkspace(String(value || ''))}
                buttonClassName="w-full bg-zinc-900/70 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                iconClassName="w-4 h-4 text-zinc-500"
                optionClassName="text-xs"
              />
            </div>
            <button
              type="button"
              onClick={createWorkspace}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-orange-500/10 border border-orange-500/40 text-orange-300 hover:bg-orange-500/20 transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {tr('新建工作区', 'New Workspace')}
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <p className="text-xs text-blue-300">
            {tr('提示：可创建多个首帧图工作区并行生成，切换后会保留各自记录。', 'Tip: You can create multiple first-frame workspaces and run generation in parallel. Switching keeps each workspace record.')}
          </p>
        </div>

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
              onApplyToWorkbench={onApplyToWorkbench}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
