import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { ImageUploader } from '../../Common/ImageUploader';
import { FirstFrameForm } from './FirstFrameForm';
import { FirstFrameResult } from './FirstFrameResult';
import { LoadingProgress } from '../../Common/LoadingProgress';
import { ErrorDialog, type ErrorInfo } from '../../Common/ErrorDialog';
import { downloadBlob, productImagesApi } from '../../../../services/productImagesApi';
import type { FirstFrameParams, ProductImageResult } from '../../../../types/productImages';

type Phase = 'upload' | 'form' | 'generating' | 'result' | 'error';

interface FirstFrameViewProps {
  onBack?: () => void;
  projectId?: string;
  embedded?: boolean;
  onApplyToWorkbench?: () => void;
}

const FIRST_FRAME_TRANSFER_KEY = 'vflow_apply_first_frame';

export const FirstFrameView: React.FC<FirstFrameViewProps> = ({
  onBack,
  projectId,
  embedded = false,
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

  const isGenerating = phase === 'generating';

  const handleImagesSelected = useCallback((files: File[]) => {
    setImages(files);
    if (files.length > 0) {
      setError(null);
      setPhase('form');
    }
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

    try {
      setPhase('generating');
      setProgress(5);
      setError(null);

      const response = await productImagesApi.generateFirstFrame(images, params, projectId);
      setProgress(100);

      if (response.status === 'completed' && response.outputImages && response.outputImages.length > 0) {
        setResults(response.outputImages);
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
    setPhase(images.length > 0 ? 'form' : 'upload');
    setProgress(0);
  };

  const handleRegenerate = () => {
    setResults([]);
    setPhase('form');
    setProgress(0);
    setError(null);
  };

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

  const shellClassName = useMemo(
    () => (embedded
      ? 'h-full'
      : 'min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 p-6'),
    [embedded]
  );

  const contentWrapClassName = embedded ? 'w-full' : 'max-w-5xl mx-auto';

  return (
    <div className={shellClassName}>
      <div className={contentWrapClassName}>
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
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 md:p-8 shadow-2xl">
          {phase === 'upload' && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-6">
                {tr('步骤 1: 上传商品图', 'Step 1: Upload Product Image')}
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
              </div>
            </div>
          )}

          {phase === 'form' && images.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-6">
                {tr('步骤 2: 配置参数', 'Step 2: Configure Parameters')}
              </h2>
              <FirstFrameForm
                images={images}
                isSubmitting={isGenerating}
                onSubmit={handleGenerateFormSubmit}
                onReset={() => setPhase('upload')}
              />
            </div>
          )}

          {phase === 'generating' && (
            <div className="flex justify-center">
              <LoadingProgress
                progress={progress}
                estimatedTime={45}
                currentStep={tr('生成首帧图中', 'Generating first-frame images')}
                totalSteps={3}
                onCancel={handleCancelGeneration}
              />
            </div>
          )}

          {phase === 'result' && results.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">
                  {tr('步骤 3: 结果与后处理', 'Step 3: Results & Post-Processing')}
                </h2>
                <button
                  onClick={() => setPhase('form')}
                  className="px-4 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
                >
                  {tr('编辑参数', 'Edit Parameters')}
                </button>
              </div>
              <FirstFrameResult
                results={results}
                onRegenerate={handleRegenerate}
                onDownload={handleDownload}
                onDownloadAll={handleDownloadAll}
                onSetAsFirstFrame={handleSetAsFirstFrame}
                onNextStep={handleNextStep}
              />
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
        </div>
      </div>
    </div>
  );
};
