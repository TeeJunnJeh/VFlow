/**
 * AI首帧图生成 - 主视图容器
 */

import React, { useState, useCallback } from 'react';
import { ChevronLeft } from 'lucide-react';
import { ImageUploader } from '../../Common/ImageUploader';
import { FirstFrameForm } from './FirstFrameForm';
import { FirstFrameResult } from './FirstFrameResult';
import { LoadingProgress } from '../../Common/LoadingProgress';
import { ErrorDialog, type ErrorInfo } from '../../Common/ErrorDialog';
import {
  productImagesApi,
  pollTaskStatus,
  downloadBlob,
} from '../../../services/productImagesApi';
import type { FirstFrameParams, GenerationStatus, ProductImageResult } from '../../../types/productImages';

type Phase = 'upload' | 'form' | 'generating' | 'result' | 'error';

interface FirstFrameViewProps {
  onBack?: () => void;
  projectId?: string;
}

export const FirstFrameView: React.FC<FirstFrameViewProps> = ({
  onBack,
  projectId,
}) => {
  // 状态管理
  const [phase, setPhase] = useState<Phase>('upload');
  const [images, setImages] = useState<File[]>([]);
  const [results, setResults] = useState<ProductImageResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  /**
   * 处理图片上传
   */
  const handleImagesSelected = useCallback(
    (files: File[]) => {
      setImages(files);
      if (files.length > 0) {
        setPhase('form');
      }
    },
    []
  );

  /**
   * 处理生成
   */
  const handleGenerateFormSubmit = async (params: FirstFrameParams) => {
    if (images.length === 0) {
      setError({
        code: 'NO_IMAGES',
        message: '请先上传商品图片',
        severity: 'warning',
      });
      return;
    }

    try {
      setPhase('generating');
      setProgress(0);
      setError(null);

      // 调用API生成
      const response = await productImagesApi.generateFirstFrame(
        images,
        params,
        projectId
      );

      setTaskId(response.taskId);

      // 轮询进度
      const finalStatus = await pollTaskStatus(
        response.taskId,
        120, // 最多120次
        1000, // 每秒轮询一次
        (status) => {
          // 更新进度
          setProgress(status.progress || 0);
        }
      );

      if (finalStatus.status === 'completed' && finalStatus.outputImages) {
        setResults(finalStatus.outputImages);
        setPhase('result');
      } else if (finalStatus.status === 'failed') {
        setError({
          code: 'GENERATION_FAILED',
          message: '生成失败，请检查输入并重试',
          severity: 'error',
          suggestion: '确保上传的是清晰、正面展示的商品图片',
        });
        setPhase('error');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      setError({
        code: 'GENERATION_ERROR',
        message: errorMessage,
        severity: 'error',
        suggestion: '请检查网络连接并稍后重试',
      });
      setPhase('error');
    }
  };

  /**
   * 处理取消生成
   */
  const handleCancelGeneration = async () => {
    if (taskId) {
      try {
        await productImagesApi.cancelGeneration(taskId);
      } catch (err) {
        console.error('Failed to cancel generation:', err);
      }
    }
    setPhase('form');
    setProgress(0);
    setTaskId(null);
  };

  /**
   * 处理重新生成
   */
  const handleRegenerate = () => {
    setResults([]);
    setPhase('form');
    setProgress(0);
    setError(null);
  };

  /**
   * 处理下载
   */
  const handleDownload = async (imageId: string) => {
    try {
      if (!taskId) return;
      const blob = await productImagesApi.downloadImage(taskId, imageId);
      const filename = `firstframe_${imageId.slice(0, 8)}.jpg`;
      downloadBlob(blob, filename);
    } catch (err) {
      setError({
        code: 'DOWNLOAD_FAILED',
        message: '下载失败，请重试',
        severity: 'error',
      });
    }
  };

  /**
   * 设为首帧
   */
  const handleSetAsFirstFrame = (imageId: string) => {
    const image = results.find((r) => r.id === imageId);
    if (image) {
      // 存储到localStorage或通过context传递给Generate页面
      localStorage.setItem(
        'firstFrameImage',
        JSON.stringify({
          imageUrl: image.imageUrl,
          imageId: image.id,
          taskId,
          timestamp: new Date().toISOString(),
        })
      );
      // 如果有回调，通知父组件
      console.log('设为首帧:', imageId);
    }
  };

  /**
   * 进入视频生成
   */
  const handleNextStep = () => {
    // 可以跳转到Generate页面或触发事件
    console.log('进入视频生成流程');
    // 示例: navigate('/workbench?view=generate');
  };

  /**
   * 处理错误重试
   */
  const handleErrorRetry = () => {
    setError(null);
    if (phase === 'error') {
      setPhase('form');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center gap-4 mb-8">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-zinc-800 rounded-lg transition"
              title="返回"
            >
              <ChevronLeft className="w-6 h-6 text-zinc-400" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              👆 AI首帧图生成
            </h1>
            <p className="text-zinc-400 text-sm">
              为视频生成提供专业的起始视觉素材
            </p>
          </div>
        </div>

        {/* 内容区 */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 shadow-2xl">
          {/* 阶段1: 上传图片 */}
          {phase === 'upload' && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-6">
                步骤 1: 上传商品图
              </h2>
              <div className="max-w-2xl mx-auto">
                <ImageUploader
                  maxFiles={1}
                  onFilesSelected={handleImagesSelected}
                  onError={(err) =>
                    setError({
                      code: 'UPLOAD_ERROR',
                      message: err,
                      severity: 'warning',
                    })
                  }
                />
                {error && (
                  <ErrorDialog
                    isOpen={!!error}
                    error={error}
                    onClose={() => setError(null)}
                    onRetry={handleErrorRetry}
                    showRetry={false}
                  />
                )}
              </div>
            </div>
          )}

          {/* 阶段2: 参数表单 */}
          {phase === 'form' && images.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-6">
                步骤 2: 配置参数
              </h2>
              <div className="grid grid-cols-12 gap-8">
                {/* 左侧参数表单 (60%) */}
                <div className="col-span-12 lg:col-span-7">
                  <FirstFrameForm
                    images={images}
                    onSubmit={handleGenerateFormSubmit}
                    onReset={() => setPhase('upload')}
                  />
                </div>

                {/* 右侧提示区 (40%) */}
                <div className="col-span-12 lg:col-span-5 space-y-4">
                  <div className="h-fit sticky top-8">
                    <div className="bg-gradient-to-br from-orange-500/10 to-purple-500/10 border border-orange-500/20 rounded-xl p-6">
                      <h3 className="text-white font-semibold mb-4">
                        💡 功能介绍
                      </h3>
                      <ul className="space-y-3 text-sm text-zinc-300">
                        <li className="flex gap-3">
                          <span className="text-orange-400">→</span>
                          <span>
                            生成人物手持商品的首帧图，用作视频开头
                          </span>
                        </li>
                        <li className="flex gap-3">
                          <span className="text-orange-400">→</span>
                          <span>
                            竖屏友好构图，提高移动端观看体验
                          </span>
                        </li>
                        <li className="flex gap-3">
                          <span className="text-orange-400">→</span>
                          <span>
                            支持多种人物类型和出镜方式选择
                          </span>
                        </li>
                        <li className="flex gap-3">
                          <span className="text-orange-400">→</span>
                          <span>
                            生成 1-4 张，选择最佳效果
                          </span>
                        </li>
                      </ul>

                      {/* 示例图区 */}
                      <div className="mt-6 pt-6 border-t border-orange-500/20">
                        <p className="text-xs text-zinc-400 mb-3">📸 效果示例:</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="aspect-[9/16] bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-500 text-xs">
                            示例图
                          </div>
                          <div className="aspect-[9/16] bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-500 text-xs">
                            示例图
                          </div>
                        </div>
                      </div>

                      {/* 时间估计 */}
                      <div className="mt-6 pt-6 border-t border-orange-500/20">
                        <p className="text-xs text-zinc-400">
                          ⏱ <span className="text-orange-400 font-semibold">预计耗时:</span> 30-60 秒
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 阶段3: 生成中 */}
          {phase === 'generating' && (
            <div className="flex justify-center">
              <LoadingProgress
                progress={progress}
                estimatedTime={50}
                currentStep="生成首帧图..."
                totalSteps={4}
                onCancel={handleCancelGeneration}
              />
            </div>
          )}

          {/* 阶段4: 结果展示 */}
          {phase === 'result' && results.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">
                  步骤 3: 预览结果
                </h2>
                <button
                  onClick={() => setPhase('form')}
                  className="px-4 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
                >
                  < 编辑参数
                </button>
              </div>
              <FirstFrameResult
                results={results}
                onRegenerate={handleRegenerate}
                onDownload={handleDownload}
                onSetAsFirstFrame={handleSetAsFirstFrame}
                onNextStep={handleNextStep}
              />
            </div>
          )}

          {/* 阶段5: 错误 */}
          {phase === 'error' && error && (
            <div>
              <ErrorDialog
                isOpen={true}
                error={error}
                onClose={() => setPhase('form')}
                onRetry={handleErrorRetry}
                showRetry={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
