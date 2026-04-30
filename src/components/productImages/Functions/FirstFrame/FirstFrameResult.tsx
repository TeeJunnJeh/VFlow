import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Download, FolderPlus, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ProductImageResult } from '../../../../types/productImages';
import type { LoadingTheme } from '../../../../utils/loadingTheme';

interface FirstFrameResultProps {
  results: ProductImageResult[];
  isLoading?: boolean;
  elapsedSeconds?: number | null;
  selectionKey?: string;
  loadingTheme?: LoadingTheme;
  aspectRatio?: string;
  onRegenerate: () => void;
  onDownload: (imageId: string, filename?: string) => Promise<void>;
  onDownloadAll: (prefix: string) => Promise<void>;
  onSaveToAssets: (imageId: string) => Promise<boolean>;
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
  onRegenerate,
  onDownload,
  onDownloadAll,
  onSaveToAssets,
  onNextStep,
}) => {
  const { t } = useLanguage();

  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [selectedImageId, setSelectedImageId] = useState<string | null>(results[0]?.id || null);
  const [showFullImage, setShowFullImage] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

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

  const selectedImage = results.find((r) => r.id === selectedImageId) || results.find((item) => isResultSucceeded(item)) || results[0] || null;
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

  return (
    <div className="w-full space-y-6">
      <div className="overflow-hidden rounded-xl bg-transparent">
        <div className="flex flex-col items-center gap-4 bg-transparent p-8">
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

      {showFullImage && selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative max-h-screen max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage.imageUrl} alt="preview" className="h-full w-full object-contain" />
            <button
              onClick={() => setShowFullImage(false)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
            >
              x
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
