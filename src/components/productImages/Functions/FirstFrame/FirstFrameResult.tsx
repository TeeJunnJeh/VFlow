import React, { useState } from 'react';
import { ArrowRight, Download, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ProductImageResult } from '../../../../types/productImages';

interface FirstFrameResultProps {
  results: ProductImageResult[];
  isLoading?: boolean;
  onRegenerate: () => void;
  onDownload: (imageId: string, filename?: string) => Promise<void>;
  onDownloadAll: (prefix: string) => Promise<void>;
  onSetAsFirstFrame: (imageId: string) => void;
  onNextStep: (imageId: string) => void;
}

export const FirstFrameResult: React.FC<FirstFrameResultProps> = ({
  results,
  isLoading = false,
  onRegenerate,
  onDownload,
  onDownloadAll,
  onSetAsFirstFrame,
  onNextStep,
}) => {
  const { t } = useLanguage();

  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [selectedImageId, setSelectedImageId] = useState<string | null>(results[0]?.id || null);
  const [showFullImage, setShowFullImage] = useState(false);
  const [filenamePrefix, setFilenamePrefix] = useState('ai_first_frame');
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  if (isLoading) return null;

  const selectedImage = results.find((r) => r.id === selectedImageId) || results[0] || null;

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

  return (
    <div className="w-full space-y-6">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-sm font-medium text-emerald-400/85">
          {t.ff_result_generated_prefix} {results.length} {t.ff_result_generated_suffix}
        </p>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
        <div className="p-8 flex justify-center bg-black/30">
          <div className="relative">
            {selectedImage ? (
              <div className="relative">
                <img
                  src={selectedImage.imageUrl}
                  alt={t.ff_first_frame_alt}
                  className="max-h-96 max-w-sm object-contain rounded-lg border-2 border-orange-500/30 cursor-pointer hover:border-orange-500 transition"
                  onClick={() => setShowFullImage(true)}
                />
                <div className="absolute top-4 right-4 px-2 py-1 bg-blue-600/80 text-white text-xs rounded font-medium">
                  {t.ff_vertical_badge}
                </div>
              </div>
            ) : (
              <div className="w-sm h-96 bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center">
                <p className="text-zinc-500">{t.ff_no_result}</p>
              </div>
            )}
          </div>
        </div>

        {results.length > 1 && (
          <div className="px-8 py-6 border-t border-zinc-700 bg-zinc-800/30">
            <p className="text-zinc-300 text-sm font-medium mb-4">{t.ff_preview_variants}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => setSelectedImageId(result.id)}
                  className={`relative rounded-lg overflow-hidden border-2 transition ${selectedImageId === result.id ? 'border-orange-500' : 'border-zinc-600 hover:border-orange-500/50'}`}
                >
                  <img src={result.imageUrl} alt="thumbnail" className="w-full aspect-square object-cover" />
                  {selectedImageId === result.id && <div className="absolute inset-0 bg-orange-500/20" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedImage && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-400 text-xs mb-1">{t.ff_file_size}</p>
              <p className="text-white font-semibold">{selectedImage.size ? (selectedImage.size / 1024).toFixed(1) : '-'} KB</p>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-400 text-xs mb-1">{t.ff_image_format}</p>
              <p className="text-white font-semibold">JPG</p>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-400 text-xs mb-1">{t.ff_framing}</p>
              <p className="font-semibold text-emerald-400/85">{t.ff_optimized}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => handleDownload(selectedImage.id)}
              disabled={downloadingIds.has(selectedImage.id)}
              className="px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/70 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              {downloadingIds.has(selectedImage.id) ? t.ff_downloading : t.ff_download_image}
            </button>
            <button
              onClick={() => onSetAsFirstFrame(selectedImage.id)}
              className="px-4 py-3 rounded-xl border border-orange-500/40 bg-orange-500/10 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20 flex items-center justify-center gap-2"
            >
              {t.ff_set_as_workbench_first_frame}
            </button>
          </div>

          <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4 space-y-3">
            <label className="block text-xs text-zinc-400 font-medium">{t.ff_post_process_download_prefix}</label>
            <input
              value={filenamePrefix}
              onChange={(e) => setFilenamePrefix(e.target.value.replace(/\s+/g, '_'))}
              className="w-full px-3 py-2 rounded-lg bg-black/20 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="ai_first_frame"
            />
            <button
              onClick={handleDownloadAll}
              disabled={isDownloadingAll}
              className="w-full px-4 py-2.5 rounded-xl border border-orange-500/40 bg-orange-500/10 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-60"
            >
              {isDownloadingAll ? t.ff_downloading_all : `${t.ff_download_all} (${results.length})`}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={onRegenerate}
              className="px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/70 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {t.ff_regenerate}
            </button>
            <button
              onClick={() => onNextStep(selectedImage.id)}
              className="px-4 py-3 rounded-xl border border-orange-500/40 bg-orange-500/10 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20 flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              {t.ff_use_in_workbench_and_generate_video}
            </button>
          </div>
        </div>
      )}

      {showFullImage && selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative max-h-screen max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage.imageUrl} alt="preview" className="w-full h-full object-contain" />
            <button
              onClick={() => setShowFullImage(false)}
              className="absolute top-4 right-4 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 transition"
            >
              x
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
