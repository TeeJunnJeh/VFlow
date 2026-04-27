import React, { useEffect, useState } from 'react';
import { ArrowRight, Download, FolderPlus, RotateCcw } from 'lucide-react';
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

export const FirstFrameResult: React.FC<FirstFrameResultProps> = ({
  results,
  isLoading = false,
  elapsedSeconds: _elapsedSeconds = null,
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
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

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

  if (isLoading) return null;

  const handleDownload = async (imageId: string) => {
    const current = results.find((item) => item.id === imageId);
    if (!current) return;

    setDownloadingIds((prev) => new Set(prev).add(imageId));
    try {
      const index = results.findIndex((item) => item.id === imageId);
      const filename = `ai_first_frame_${Math.max(index + 1, 1)}_${imageId.slice(0, 8)}.jpg`;
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
              </div>
            ) : (
              <div className="flex h-96 w-sm items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800">
                <p className="text-zinc-500">{t.ff_no_result}</p>
              </div>
            )}
          </div>
        </div>

        {results.length > 1 && (
          <div className="bg-transparent px-8 pb-6 pt-2">
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
