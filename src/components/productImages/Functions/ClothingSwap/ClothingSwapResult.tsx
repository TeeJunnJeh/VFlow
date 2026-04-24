import React, { useEffect, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ProductImageResult } from '../../../../types/productImages';

interface ClothingSwapResultProps {
  results: ProductImageResult[];
  selectionKey?: string;
  onRegenerate: () => void;
  onDownload: (imageId: string, filename?: string) => Promise<void>;
  onDownloadAll: (prefix: string) => Promise<void>;
}

export const ClothingSwapResult: React.FC<ClothingSwapResultProps> = ({
  results,
  selectionKey,
  onRegenerate,
  onDownload,
  onDownloadAll,
}) => {
  const { t } = useLanguage();
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(results[0]?.id || null);

  useEffect(() => {
    setSelectedId(results[0]?.id || null);
  }, [selectionKey, results]);

  if (results.length === 0) return null;

  const handleDownload = async (imageId: string, index: number) => {
    setDownloadingIds((prev) => new Set(prev).add(imageId));
    try {
      const filename = `ai_clothing_swap_${index + 1}_${imageId.slice(0, 8)}.png`;
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
      await onDownloadAll('ai_clothing_swap');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const gridCols = results.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t.ff_regenerate || 'Regenerate'}
        </button>
        {results.length > 1 && (
          <button
            type="button"
            onClick={() => void handleDownloadAll()}
            disabled={isDownloadingAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/10 border border-orange-500/40 text-orange-300 hover:bg-orange-500/20 transition disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            {t.ff_download_all || 'Download all'}
          </button>
        )}
      </div>

      <div className={`grid ${gridCols} gap-3 overflow-y-auto pr-1`}>
        {results.map((item, index) => {
          const isDownloading = downloadingIds.has(item.id);
          const isSelected = selectedId === item.id;
          return (
            <div
              key={item.id}
              className={`relative rounded-2xl overflow-hidden border transition ${
                isSelected ? 'border-orange-500/60' : 'border-white/10 hover:border-white/20'
              } bg-black/30`}
              onClick={() => setSelectedId(item.id)}
            >
              <img
                src={item.imageUrl}
                alt={`clothing-swap-${index}`}
                className="w-full h-auto object-contain bg-zinc-950"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDownload(item.id, index);
                }}
                disabled={isDownloading}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-black/70 border border-white/20 text-white hover:bg-black/90 transition disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                {isDownloading ? (t.cs_btn_generating || '...') : t.cs_btn_download}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
