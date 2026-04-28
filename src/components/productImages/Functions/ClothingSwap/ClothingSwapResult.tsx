import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize2, RotateCcw, Video, X } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ProductImageResult } from '../../../../types/productImages';

interface ClothingSwapResultProps {
  results: ProductImageResult[];
  selectionKey?: string;
  onRegenerate: () => void;
  onDownload: (imageId: string, filename?: string) => Promise<void>;
  onDownloadAll: (prefix: string) => Promise<void>;
  onGenerateVideo?: (imageId: string) => void;
  /** @deprecated 使用 generatingVideoIds */
  isGeneratingVideoForId?: string | null;
  generatingVideoIds?: Set<string>;
  videoMap?: Record<string, string>;
  onDownloadVideo?: (imageId: string) => void;
}

export const ClothingSwapResult: React.FC<ClothingSwapResultProps> = ({
  results,
  selectionKey,
  onRegenerate,
  onDownload,
  onDownloadAll,
  onGenerateVideo,
  isGeneratingVideoForId,
  generatingVideoIds,
  videoMap = {},
  onDownloadVideo,
}) => {
  const { t } = useLanguage();
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(results[0]?.id || null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Close lightbox on Escape, navigate with arrow keys
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') setLightboxIndex((i) => i !== null ? Math.min(i + 1, results.length - 1) : null);
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => i !== null ? Math.max(i - 1, 0) : null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, results.length]);
  useEffect(() => {
    setSelectedId(results[0]?.id || null);
  }, [selectionKey, results]);

  // videoMap is keyed by imageUrl — resolve the selected item's url for lookup
  const selectedItem = results.find((r) => r.id === selectedId) ?? null;
  const selectedVideoUrl = selectedItem ? (videoMap[selectedItem.imageUrl] ?? '') : '';
  const isSelectedGenerating =
    selectedId != null &&
    (generatingVideoIds ? generatingVideoIds.has(selectedId) : isGeneratingVideoForId === selectedId);

  // Auto-play video when it first becomes available for selected image
  useEffect(() => {
    if (!selectedVideoUrl) return;
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [selectedVideoUrl]);

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
  const lightboxItem = lightboxIndex !== null ? results[lightboxIndex] : null;

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
        {onGenerateVideo && selectedId && (
          <button
            type="button"
            onClick={() => onGenerateVideo(selectedId)}
            disabled={isSelectedGenerating || !!selectedVideoUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/10 border border-violet-500/40 text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-60"
          >
            <Video className="w-3.5 h-3.5" />
            {isSelectedGenerating
              ? (t.cs_generating_video || 'Generating video…')
              : selectedVideoUrl
                ? (t.cs_video_ready || 'Video ready')
                : (t.cs_generate_video || 'Generate video')}
          </button>
        )}
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
          const hasVideo = !!videoMap[item.imageUrl];
          const isItemGeneratingVideo =
            generatingVideoIds ? generatingVideoIds.has(item.id) : isGeneratingVideoForId === item.id;
          return (
            <div
              key={item.id}
              className={`relative rounded-2xl overflow-hidden border-4 transition cursor-pointer ${
                isSelected ? 'border-orange-500/60' : 'border-white/10 hover:border-white/20'
              } bg-black/30`}
              onClick={() => setSelectedId(item.id)}
            >
              <img
                src={item.imageUrl}
                alt={`clothing-swap-${index}`}
                className="w-full h-auto object-contain bg-zinc-950"
              />
              {/* 全屏预览按鈕 */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(index); }}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 border border-white/20 text-white hover:bg-black/90 transition"
                title="全屏预览"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              {isItemGeneratingVideo && (
                <span className="absolute top-2 left-2 bg-violet-500/90 rounded-full text-[10px] px-2 py-0.5 text-white font-semibold flex items-center gap-1 animate-pulse">
                  <Video className="w-3 h-3" /> {t.cs_generating_video || '生成中…'}
                </span>
              )}
              {!isItemGeneratingVideo && hasVideo && (
                <span className="absolute top-2 left-2 bg-violet-600/90 rounded-full text-[10px] px-2 py-0.5 text-white font-semibold flex items-center gap-1">
                  <Video className="w-3 h-3" /> {t.cs_video_ready || 'Video'}
                </span>
              )}
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

      {/* Video section — shown when a video is ready for the selected image */}
      {selectedItem && selectedVideoUrl && (
        <div className="mt-4 rounded-2xl border border-violet-500/30 bg-black/30 overflow-hidden">
          <div className="px-4 py-2 border-b border-violet-500/20 bg-violet-500/5 flex items-center justify-between">
            <span className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" />
              {t.cs_video_ready || 'Video ready'}
            </span>
            {onDownloadVideo && (
              <button
                type="button"
                onClick={() => onDownloadVideo(selectedItem.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-500/10 border border-violet-500/30 text-violet-300 hover:bg-violet-500/20 transition"
              >
                <Download className="w-3.5 h-3.5" />
                {t.cs_download_video || 'Download video'}
              </button>
            )}
          </div>
          <video
            ref={videoRef}
            src={selectedVideoUrl}
            className="w-full max-h-[480px] object-contain bg-zinc-950"
            controls
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
      )}

      {/* 灯笱全屏预览弹层 */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90"
          onClick={() => setLightboxIndex(null)}
        >
          {/* 关闭按鈕 */}
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-6 h-6" />
          </button>

          {/* 上一张 */}
          {lightboxIndex! > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i! - 1); }}
              className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
          )}

          {/* 下一张 */}
          {lightboxIndex! < results.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i! + 1); }}
              className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            >
              <ChevronRight className="w-7 h-7" />
            </button>
          )}

          {/* 图片本体 */}
          <img
            src={lightboxItem.imageUrl}
            alt="full-preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* 页码指示 */}
          {results.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {results.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                  className={`w-2 h-2 rounded-full transition ${
                    i === lightboxIndex ? 'bg-white' : 'bg-white/30 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
