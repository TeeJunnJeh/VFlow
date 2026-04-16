import React, { useEffect, useState } from 'react';
import { ArrowRight, Download, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ProductImageResult } from '../../../../types/productImages';

interface FirstFrameResultProps {
  results: ProductImageResult[];
  isLoading?: boolean;
  elapsedSeconds?: number | null;
  selectionKey?: string;
  onRegenerate: () => void;
  onDownload: (imageId: string, filename?: string) => Promise<void>;
  onDownloadAll: (prefix: string) => Promise<void>;
  onSaveToAssets: (imageId: string) => Promise<boolean>;
  onNextStep: (imageId: string) => void;
}

function getImageDeclaredSize(image: ProductImageResult | null | undefined): number | undefined {
  if (!image) return undefined;

  const metadata = image.metadata || {};
  const candidate = [
    image.size,
    typeof metadata.size === 'number' ? metadata.size : undefined,
    typeof metadata.size_bytes === 'number' ? metadata.size_bytes : undefined,
  ].find((value) => typeof value === 'number' && value > 0);

  return typeof candidate === 'number' ? candidate : undefined;
}

export const FirstFrameResult: React.FC<FirstFrameResultProps> = ({
  results,
  isLoading = false,
  elapsedSeconds = null,
  selectionKey,
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
  const [filenamePrefix, setFilenamePrefix] = useState('ai_first_frame');
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [resolvedSizes, setResolvedSizes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (results.length === 0) {
      setSelectedImageId(null);
      return;
    }

    if (!results.some((item) => item.id === selectedImageId)) {
      setSelectedImageId(results[0].id);
    }
  }, [results, selectedImageId]);

  useEffect(() => {
    setSelectedImageId(results[0]?.id || null);
  }, [results, selectionKey]);

  const selectedImage = results.find((r) => r.id === selectedImageId) || results[0] || null;

  useEffect(() => {
    const candidate = selectedImage;
    if (!candidate) return;

    const declaredSize = getImageDeclaredSize(candidate);
    if (declaredSize) {
      setResolvedSizes((prev) => (prev[candidate.id] ? prev : { ...prev, [candidate.id]: declaredSize }));
      return;
    }

    if (resolvedSizes[candidate.id]) return;

    let cancelled = false;

    const resolveSize = async () => {
      try {
        const headResponse = await fetch(candidate.imageUrl, {
          method: 'HEAD',
          credentials: 'include',
        });
        if (headResponse.ok) {
          const contentLength = Number(headResponse.headers.get('content-length'));
          if (Number.isFinite(contentLength) && contentLength > 0) {
            if (!cancelled) {
              setResolvedSizes((prev) => ({ ...prev, [candidate.id]: contentLength }));
            }
            return;
          }
        }
      } catch {
        // Fall back to reading the blob size below.
      }

      try {
        const imageResponse = await fetch(candidate.imageUrl, { credentials: 'include' });
        if (!imageResponse.ok) return;

        const imageBlob = await imageResponse.blob();
        if (!cancelled && imageBlob.size > 0) {
          setResolvedSizes((prev) => ({ ...prev, [candidate.id]: imageBlob.size }));
        }
      } catch {
        // Keep the placeholder when the file size cannot be resolved.
      }
    };

    void resolveSize();

    return () => {
      cancelled = true;
    };
  }, [resolvedSizes, selectedImage]);

  if (isLoading) return null;

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '-';
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const resolvedFormat = (() => {
    const raw = String(selectedImage?.format || '').trim();
    if (raw) return raw.toUpperCase();

    const url = String(selectedImage?.imageUrl || '').toLowerCase();
    if (url.endsWith('.png')) return 'PNG';
    if (url.endsWith('.webp')) return 'WEBP';
    return 'JPG';
  })();

  const resolvedSize = selectedImage
    ? resolvedSizes[selectedImage.id] || getImageDeclaredSize(selectedImage)
    : undefined;

  const handleDownload = async (imageId: string) => {
    const current = results.find((item) => item.id === imageId);
    if (!current) return;

    setDownloadingIds((prev) => new Set(prev).add(imageId));
    try {
      const index = results.findIndex((item) => item.id === imageId);
      const filename = `${filenamePrefix || 'ai_first_frame'}_${Math.max(index + 1, 1)}_${imageId.slice(0, 8)}.jpg`;
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
      await onDownloadAll(filenamePrefix || 'ai_first_frame');
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
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-sm font-medium text-emerald-400/85">
          {t.ff_result_generated_prefix} {results.length} {t.ff_result_generated_suffix}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900">
        <div className="flex justify-center bg-black/30 p-8">
          <div className="relative">
            {selectedImage ? (
              <div className="relative">
                <img
                  src={selectedImage.imageUrl}
                  alt={t.ff_first_frame_alt}
                  className="max-h-96 max-w-sm cursor-pointer rounded-lg border-2 border-orange-500/30 object-contain transition hover:border-orange-500"
                  onClick={() => setShowFullImage(true)}
                />
                <div className="absolute right-4 top-4 rounded bg-blue-600/80 px-2 py-1 text-xs font-medium text-white">
                  {t.ff_vertical_badge}
                </div>
              </div>
            ) : (
              <div className="flex h-96 w-sm items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800">
                <p className="text-zinc-500">{t.ff_no_result}</p>
              </div>
            )}
          </div>
        </div>

        {results.length > 1 && (
          <div className="border-t border-zinc-700 bg-zinc-800/30 px-8 py-6">
            <p className="mb-4 text-sm font-medium text-zinc-300">{t.ff_preview_variants}</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => setSelectedImageId(result.id)}
                  className={`relative overflow-hidden rounded-lg border-2 transition ${selectedImageId === result.id ? 'border-orange-500' : 'border-zinc-600 hover:border-orange-500/50'}`}
                >
                  <img src={result.imageUrl} alt="thumbnail" className="aspect-square w-full object-cover" />
                  {selectedImageId === result.id && <div className="absolute inset-0 bg-orange-500/20" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedImage && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
              <p className="mb-1 text-xs text-zinc-400">{t.ff_file_size}</p>
              <p className="text-white font-semibold">{formatBytes(resolvedSize)}</p>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
              <p className="mb-1 text-xs text-zinc-400">{t.ff_image_format}</p>
              <p className="text-white font-semibold">{resolvedFormat}</p>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
              <p className="mb-1 text-xs text-zinc-400">{t.ff_loading_elapsed}</p>
              <p className="font-semibold text-emerald-400/85">
                {elapsedSeconds !== null ? formatDuration(elapsedSeconds) : '-'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              onClick={() => handleDownload(selectedImage.id)}
              disabled={downloadingIds.has(selectedImage.id)}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {downloadingIds.has(selectedImage.id) ? t.ff_downloading : t.ff_download_image}
            </button>
            <button
              onClick={() => void handleSaveToAssets(selectedImage.id)}
              disabled={savingIds.has(selectedImage.id) || savedIds.has(selectedImage.id)}
              className="flex items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savedIds.has(selectedImage.id)
                ? t.ff_saved_to_image_assets
                : savingIds.has(selectedImage.id)
                  ? t.ff_saving_to_image_assets
                  : t.ff_save_to_image_assets}
            </button>
          </div>

          <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
            <label className="block text-xs font-medium text-zinc-400">{t.ff_post_process_download_prefix}</label>
            <input
              value={filenamePrefix}
              onChange={(e) => setFilenamePrefix(e.target.value.replace(/\s+/g, '_'))}
              className="w-full rounded-lg border border-zinc-700 bg-black/20 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="ai_first_frame"
            />
            <button
              onClick={handleDownloadAll}
              disabled={isDownloadingAll}
              className="w-full rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-60"
            >
              {isDownloadingAll ? t.ff_downloading_all : `${t.ff_download_all} (${results.length})`}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              onClick={onRegenerate}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
            >
              <RotateCcw className="h-4 w-4" />
              {t.ff_regenerate}
            </button>
            <button
              onClick={() => onNextStep(selectedImage.id)}
              className="flex items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20"
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
