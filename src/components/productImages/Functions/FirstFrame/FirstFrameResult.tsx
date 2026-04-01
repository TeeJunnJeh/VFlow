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
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);

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
      <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
        <p className="text-green-400 text-sm font-medium">
          {tr('生成完成，共', 'Generation completed,')} {results.length} {tr('张首帧图', 'image(s) generated')}
        </p>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
        <div className="p-8 flex justify-center bg-black/30">
          <div className="relative">
            {selectedImage ? (
              <div className="relative">
                <img
                  src={selectedImage.imageUrl}
                  alt={tr('首帧图', 'First Frame')}
                  className="max-h-96 max-w-sm object-contain rounded-lg border-2 border-orange-500/30 cursor-pointer hover:border-orange-500 transition"
                  onClick={() => setShowFullImage(true)}
                />
                <div className="absolute top-4 right-4 px-2 py-1 bg-blue-600/80 text-white text-xs rounded font-medium">
                  {tr('竖屏', 'Vertical')}
                </div>
              </div>
            ) : (
              <div className="w-sm h-96 bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center">
                <p className="text-zinc-500">{tr('无结果', 'No result')}</p>
              </div>
            )}
          </div>
        </div>

        {results.length > 1 && (
          <div className="px-8 py-6 border-t border-zinc-700 bg-zinc-800/30">
            <p className="text-zinc-300 text-sm font-medium mb-4">{tr('预览其他变体', 'Preview variants')}</p>
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
              <p className="text-zinc-400 text-xs mb-1">{tr('文件大小', 'File Size')}</p>
              <p className="text-white font-semibold">{selectedImage.size ? (selectedImage.size / 1024).toFixed(1) : '-'} KB</p>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-400 text-xs mb-1">{tr('图片格式', 'Format')}</p>
              <p className="text-white font-semibold">JPG</p>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-400 text-xs mb-1">{tr('构图适配', 'Framing')}</p>
              <p className="text-green-400 font-semibold">{tr('已优化', 'Optimized')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => handleDownload(selectedImage.id)}
              disabled={downloadingIds.has(selectedImage.id)}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2 font-medium"
            >
              <Download className="w-4 h-4" />
              {downloadingIds.has(selectedImage.id) ? tr('下载中...', 'Downloading...') : tr('下载此图', 'Download Image')}
            </button>
            <button
              onClick={() => onSetAsFirstFrame(selectedImage.id)}
              className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2 font-medium"
            >
              {tr('设为工作台首帧', 'Set as Workbench First Frame')}
            </button>
          </div>

          <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4 space-y-3">
            <label className="block text-xs text-zinc-400 font-medium">{tr('后处理: 下载命名前缀', 'Post-process: Download filename prefix')}</label>
            <input
              value={filenamePrefix}
              onChange={(e) => setFilenamePrefix(e.target.value.replace(/\s+/g, '_'))}
              className="w-full px-3 py-2 rounded-lg bg-black/20 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="ai_first_frame"
            />
            <button
              onClick={handleDownloadAll}
              disabled={isDownloadingAll}
              className="w-full px-4 py-2.5 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg hover:bg-green-600/30 disabled:opacity-60 transition font-medium text-sm"
            >
              {isDownloadingAll ? tr('打包下载中...', 'Downloading all...') : `${tr('下载全部', 'Download All')} (${results.length})`}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={onRegenerate}
              className="px-4 py-3 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition flex items-center justify-center gap-2 font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              {tr('重新生成', 'Regenerate')}
            </button>
            <button
              onClick={() => onNextStep(selectedImage.id)}
              className="px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition flex items-center justify-center gap-2 font-medium"
            >
              <ArrowRight className="w-4 h-4" />
              {tr('一键进入工作台生成视频', 'Use in Workbench and Generate Video')}
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
