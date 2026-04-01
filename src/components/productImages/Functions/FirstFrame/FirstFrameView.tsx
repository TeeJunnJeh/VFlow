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
  const [uploaderResetKey, setUploaderResetKey] = useState(0);

  const isGenerating = phase === 'generating';
  const hasImages = images.length > 0;
  const hasResults = results.length > 0;

  const handleImagesSelected = useCallback((files: File[]) => {
    setImages(files);
    setError(null);
    setProgress(0);
    setResults([]);
    setPhase(files.length > 0 ? 'form' : 'upload');
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

  const handleResetLayout = useCallback(() => {
    setImages([]);
    setResults([]);
    setProgress(0);
    setError(null);
    setPhase('upload');
    setUploaderResetKey((prev) => prev + 1);
  }, []);

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

  const contentWrapClassName = embedded ? 'w-full' : 'max-w-[1600px] mx-auto';

  return (
    <div className={shellClassName}>
      <div className={`${contentWrapClassName} pb-10`}>
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

        {phase !== 'error' && (
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(280px,1fr)_minmax(380px,1.2fr)_minmax(320px,1fr)]">
            <section className="self-start rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-5">
                  <h2 className="text-lg font-semibold text-white">
                    {tr('素材上传', 'Upload Materials')}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {tr('上传 1 张商品图，用于首帧图生成', 'Upload one product image for first-frame generation')}
                  </p>
                </div>
                <ImageUploader
                  key={uploaderResetKey}
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
            </section>

            <section className="self-start rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-5">
                  <h2 className="text-lg font-semibold text-white">
                    {tr('生成配置', 'Generation Settings')}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {tr('保留原有功能选项，只调整为连续配置视图', 'Keep the existing options and configure them in a single view')}
                  </p>
                </div>

                <FirstFrameForm
                  images={images}
                  isSubmitting={isGenerating}
                  onSubmit={handleGenerateFormSubmit}
                  onReset={handleResetLayout}
                />
            </section>

            <section className="self-start rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {tr('结果预览', 'Result Preview')}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {tr('在这里查看生成结果并进行下载或应用', 'Preview results here and continue with download or apply')}
                    </p>
                  </div>
                  {hasResults && !isGenerating && (
                    <button
                      onClick={() => setPhase('form')}
                      className="px-3 py-2 text-xs bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
                    >
                      {tr('编辑参数', 'Edit Parameters')}
                    </button>
                  )}
                </div>

                {isGenerating ? (
                  <div className="flex min-h-[420px] items-center justify-center">
                    <LoadingProgress
                      progress={progress}
                      estimatedTime={45}
                      currentStep={tr('生成首帧图中', 'Generating first-frame images')}
                      totalSteps={3}
                      onCancel={handleCancelGeneration}
                    />
                  </div>
                ) : hasResults ? (
                  <FirstFrameResult
                    results={results}
                    onRegenerate={handleRegenerate}
                    onDownload={handleDownload}
                    onDownloadAll={handleDownloadAll}
                    onSetAsFirstFrame={handleSetAsFirstFrame}
                    onNextStep={handleNextStep}
                  />
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                    <div>
                      <p className="text-sm font-medium text-zinc-300">
                        {tr('完成配置后点击生成', 'Generate after finishing the settings')}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {tr('生成结果将在这里展示', 'Generated images will appear here')}
                      </p>
                    </div>
                  </div>
                )}
            </section>
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
  );
};
