/**
 * AI首帧图生成 - 结果展示组件
 */

import React, { useState } from 'react';
import { Download, RotateCcw, ArrowRight } from 'lucide-react';
import type { ProductImageResult } from '../../types/productImages';

interface FirstFrameResultProps {
  results: ProductImageResult[];
  isLoading?: boolean;
  onRegenerate: () => void;
  onDownload: (imageId: string) => Promise<void>;
  onSetAsFirstFrame: (imageId: string) => void;
  onNextStep: () => void;
}

export const FirstFrameResult: React.FC<FirstFrameResultProps> = ({
  results,
  isLoading = false,
  onRegenerate,
  onDownload,
  onSetAsFirstFrame,
  onNextStep,
}) => {
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [selectedImageId, setSelectedImageId] = useState<string | null>(
    results[0]?.id || null
  );
  const [showFullImage, setShowFullImage] = useState(false);

  /**
   * 处理下载
   */
  const handleDownload = async (imageId: string) => {
    setDownloadingIds((prev) => new Set(prev).add(imageId));
    try {
      await onDownload(imageId);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  };

  if (isLoading) {
    return null;
  }

  const selectedImage = results.find((r) => r.id === selectedImageId);

  return (
    <div className="w-full space-y-6">
      {/* 成功提示 */}
      <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
        <p className="text-green-400 text-sm font-medium">
          ✓ 生成完成！共生成 {results.length} 张首帧图
        </p>
      </div>

      {/* 主展示区域 */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
        {/* 大图展示（竖屏友好） */}
        <div className="p-8 flex justify-center bg-black/30">
          <div className="relative">
            {selectedImage ? (
              <div className="relative">
                <img
                  src={selectedImage.imageUrl}
                  alt="首帧图"
                  className="max-h-96 max-w-sm object-contain rounded-lg border-2 border-orange-500/30 cursor-pointer hover:border-orange-500 transition"
                  onClick={() => setShowFullImage(true)}
                />
                {/* 竖屏标识 */}
                <div className="absolute top-4 right-4 px-2 py-1 bg-blue-600/80 text-white text-xs rounded font-medium">
                  📱 竖屏
                </div>
              </div>
            ) : (
              <div className="w-sm h-96 bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center">
                <p className="text-zinc-500">无结果</p>
              </div>
            )}
          </div>
        </div>

        {/* 缩略图列表 */}
        {results.length > 1 && (
          <div className="px-8 py-6 border-t border-zinc-700 bg-zinc-800/30">
            <p className="text-zinc-300 text-sm font-medium mb-4">预览其他变体</p>
            <div className="grid grid-cols-4 gap-4">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => setSelectedImageId(result.id)}
                  className={`
                    relative rounded-lg overflow-hidden border-2 transition
                    ${
                      selectedImageId === result.id
                        ? 'border-orange-500'
                        : 'border-zinc-600 hover:border-orange-500/50'
                    }
                  `}
                >
                  <img
                    src={result.imageUrl}
                    alt="缩略图"
                    className="w-full aspect-square object-cover"
                  />
                  {selectedImageId === result.id && (
                    <div className="absolute inset-0 bg-orange-500/20" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 操作栏 */}
      {selectedImage && (
        <div className="space-y-4">
          {/* 文件信息 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-400 text-xs mb-1">文件大小</p>
              <p className="text-white font-semibold">
                {selectedImage.size
                  ? (selectedImage.size / 1024).toFixed(1)
                  : '-'}{' '}
                KB
              </p>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-400 text-xs mb-1">图片格式</p>
              <p className="text-white font-semibold">JPG</p>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-400 text-xs mb-1">竖屏适配</p>
              <p className="text-green-400 font-semibold">✓ 已优化</p>
            </div>
          </div>

          {/* 快速操作 */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleDownload(selectedImage.id)}
              disabled={downloadingIds.has(selectedImage.id)}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2 font-medium"
            >
              <Download className="w-4 h-4" />
              {downloadingIds.has(selectedImage.id) ? '下载中...' : '下载此图'}
            </button>
            <button
              onClick={() => onSetAsFirstFrame(selectedImage.id)}
              className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2 font-medium"
            >
              💾 设为首帧
            </button>
          </div>

          {/* 继续操作 */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onRegenerate}
              className="px-4 py-3 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition flex items-center justify-center gap-2 font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              重新生成
            </button>
            <button
              onClick={onNextStep}
              className="px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition flex items-center justify-center gap-2 font-medium"
            >
              < ArrowRight className="w-4 h-4" />
              进入视频生成
            </button>
          </div>

          {/* 全部下载 */}
          <button
            className="w-full px-4 py-3 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg hover:bg-green-600/30 transition font-medium text-sm"
          >
            ⬇ 下载全部 ({results.length} 张)
          </button>
        </div>
      )}

      {/* 建议信息 */}
      <div className="p-4 bg-amber-500/10 border border-amber-600/30 rounded-lg">
        <p className="text-amber-400 text-xs leading-relaxed">
          <span className="font-medium">✨ 建议:</span> 首帧图已优化竖屏构图，商品和人物位于视觉中心。
          建议选择最吸引的一张图作为视频首帧，以提高点击率。
        </p>
      </div>

      {/* 全屏预览Modal */}
      {showFullImage && selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowFullImage(false)}
        >
          <div
            className="relative max-h-screen max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage.imageUrl}
              alt="全屏预览"
              className="w-full h-full object-contain"
            />
            <button
              onClick={() => setShowFullImage(false)}
              className="absolute top-4 right-4 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 transition"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
