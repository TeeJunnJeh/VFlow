import React from 'react';
import { ChevronDown, Eye, Image as ImageIcon, LayoutGrid, Minus, Plus, RotateCw, Sparkles, Upload, Wand2, X } from 'lucide-react';
import { DropdownSelect } from '../../../common/DropdownSelect';
import type { ViewType } from '../../../workbench/types';
import type { LoadingTheme } from '../../../../utils/loadingTheme';

export type ImagesGalleryViewProps = {
  panelClassName: (view: ViewType) => string;
  t: any;
  tr: (zh: string, en: string) => string;

  galleryFileInputRef: React.RefObject<HTMLInputElement | null>;
  galleryImages: File[];
  galleryPreviewUrls: string[];
  galleryRestoredImagePaths: string[];
  isGalleryDragActive: boolean;
  setIsGalleryDragActive: React.Dispatch<React.SetStateAction<boolean>>;
  setGalleryRestoredImagePaths: React.Dispatch<React.SetStateAction<string[]>>;
  appendGalleryFiles: (picked: File[]) => void;
  setGalleryImages: React.Dispatch<React.SetStateAction<File[]>>;

  handleGalleryAiAnalyze: () => void;
  isGalleryAnalyzing: boolean;

  galleryProductName: string;
  setGalleryProductName: (v: string) => void;
  galleryCategory: string;
  setGalleryCategory: (v: string) => void;
  gallerySellingPoints: string[];
  setGallerySellingPoints: React.Dispatch<React.SetStateAction<string[]>>;

  hotStyleLoading: boolean;
  hotStyleItems: Array<{ name: string; tones: string[]; description: string }>;
  hotStyleSelectedIndex: number | null;
  setHotStyleSelectedIndex: React.Dispatch<React.SetStateAction<number | null>>;
  hotStyleError: string | null;
  handleHotStyleAnalyze: () => void;

  isGalleryModelInfoOpen: boolean;
  setIsGalleryModelInfoOpen: React.Dispatch<React.SetStateAction<boolean>>;
  galleryModelImagePreviewUrl: string | null;
  galleryModelImagePath: string;
  galleryModelFileInputRef: React.RefObject<HTMLInputElement | null>;
  setGalleryModelImageFile: (file: File | null) => void;
  setGalleryModelImagePath: (path: string) => void;
  galleryModelInfo: string;
  setGalleryModelInfo: (info: string) => void;
  handleGalleryModelFileSelection: (picked: File[]) => void;

  galleryTargetScene: 'detail' | 'xiaohongshu' | 'douyin' | 'poster' | 'ads';
  setGalleryTargetScene: React.Dispatch<React.SetStateAction<'detail' | 'xiaohongshu' | 'douyin' | 'poster' | 'ads'>>;
  galleryStyle: 'ecom_clean' | 'lifestyle' | 'premium' | 'festival';
  setGalleryStyle: React.Dispatch<React.SetStateAction<'ecom_clean' | 'lifestyle' | 'premium' | 'festival'>>;
  galleryCopyLanguage: string;
  setGalleryCopyLanguage: (v: string) => void;
  GALLERY_COPY_LANGUAGE_OPTIONS: Array<{ value: string; labelKey: string }>;

  galleryScenePresetId: string;
  GALLERY_SCENE_PRESETS: Array<{ id: string; name: string }>;
  clearGallerySceneConfig: () => void;
  applyGalleryScenePreset: (id: string) => void;

  gallerySceneTheme: string;
  setGallerySceneTheme: (v: string) => void;
  gallerySceneMood: string;
  setGallerySceneMood: (v: string) => void;
  gallerySceneDescription: string;
  setGallerySceneDescription: (v: string) => void;
  gallerySceneProps: string;
  setGallerySceneProps: (v: string) => void;
  gallerySceneLighting: string;
  setGallerySceneLighting: (v: string) => void;

  galleryTypeSelections: Record<string, { enabled: boolean; count: number }>;
  setGalleryTypeSelections: React.Dispatch<React.SetStateAction<Record<string, { enabled: boolean; count: number }>>>;

  galleryAspectRatio: string;
  setGalleryAspectRatio: (v: string) => void;
  galleryResolution: '1k' | '2k' | '4k';
  setGalleryResolution: React.Dispatch<React.SetStateAction<'1k' | '2k' | '4k'>>;

  handleGalleryGenerate: () => void;
  isGalleryGenerating: boolean;

  galleryRightPanel: 'preview' | 'history';
  setGalleryRightPanel: React.Dispatch<React.SetStateAction<'preview' | 'history'>>;
  setIsGalleryHistoryManaging: (v: boolean) => void;
  setGalleryHistorySelectedKeys: React.Dispatch<React.SetStateAction<string[]>>;
  openGalleryBoardEditor: () => void;

  galleryPreviewItems: Array<{
    localId: string;
    requestId: string;
    status: 'created' | 'processing' | 'succeeded' | 'failed';
    imageUrl?: string;
    error?: string;
    outputType?: string;
    createdAt?: string;
    layout?: any;
  }>;
  openGalleryImagePreview: (url: string, source?: any) => void;
  galleryHistoryItems: Array<{
    id: string;
    createdAt: string;
    images: string[];
    settings?: any;
    metadata?: any;
  }>;

  galleryLoadingTheme: LoadingTheme;
  galleryLoadingBackgroundSrc: string;

  preventDragDefaults: (e: React.DragEvent) => void;
};

const getGalleryPreviewAspectClass = (ratio: string) => {
  const cleaned = String(ratio || '').trim();
  const map: Record<string, string> = {
    '21:9': 'aspect-[21/9]',
    '16:9': 'aspect-[16/9]',
    '4:3': 'aspect-[4/3]',
    '3:2': 'aspect-[3/2]',
    '1:1': 'aspect-square',
    '9:16': 'aspect-[9/16]',
    '3:4': 'aspect-[3/4]',
    '2:3': 'aspect-[2/3]',
    '5:4': 'aspect-[5/4]',
    '4:5': 'aspect-[4/5]',
    default: 'aspect-square',
  };
  return map[cleaned] || 'aspect-square';
};

const hexToRgba = (hex: string, alpha: number) => {
  const cleaned = String(hex || '').trim().replace('#', '');
  const normalized = cleaned.length === 3 ? cleaned.split('').map((char) => char + char).join('') : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(255,255,255,${alpha})`;
  }
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const hashGallerySeed = (value: string) => {
  let hash = 0;
  const raw = String(value || '');
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const GalleryLoadingCard: React.FC<{
  theme: LoadingTheme;
  seed: string;
  label: string;
  backgroundImageSrc?: string;
}> = ({ theme, seed, label, backgroundImageSrc }) => {
  const hash = hashGallerySeed(seed);
  const durationBase = 5.4 + (hash % 5) * 0.7;

  const blobs = [
    {
      size: `${98 + (hash % 8)}%`,
      top: '-16%',
      left: `${-12 + (hash % 5)}%`,
      duration: `${durationBase}s`,
      delay: `-${(hash % 4) * 0.6}s`,
      gradient: `radial-gradient(circle, ${hexToRgba(theme.primary, 0.92)} 0%, transparent 78%)`,
    },
    {
      size: `${88 + ((hash >> 2) % 8)}%`,
      bottom: '-6%',
      right: `${-7 + ((hash >> 4) % 5)}%`,
      duration: `${durationBase + 1.25}s`,
      delay: `-${((hash >> 1) % 5) * 0.45}s`,
      direction: 'reverse' as const,
      gradient: `radial-gradient(circle, ${hexToRgba(theme.secondary, 0.9)} 0%, transparent 78%)`,
    },
    {
      size: `${106 + ((hash >> 6) % 8)}%`,
      top: `${18 + ((hash >> 7) % 6)}%`,
      right: '-15%',
      duration: `${durationBase + 2.1}s`,
      delay: `-${((hash >> 2) % 4) * 0.55}s`,
      gradient: `radial-gradient(circle, ${hexToRgba(theme.accent, 0.9)} 0%, transparent 78%)`,
    },
    {
      size: `${82 + ((hash >> 8) % 6)}%`,
      bottom: '13%',
      left: `${4 + ((hash >> 10) % 6)}%`,
      duration: `${durationBase + 0.6}s`,
      delay: `-${((hash >> 4) % 4) * 0.35}s`,
      gradient: `radial-gradient(circle, ${hexToRgba(theme.quaternary || theme.accent, 0.9)} 0%, transparent 78%)`,
    },
  ];

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${hexToRgba(theme.primary, 0.08)} 0%, ${hexToRgba(theme.surface, 0.98)} 18%, rgba(255,255,255,0.98) 100%)`,
      }}
    >
      {backgroundImageSrc ? (
        <div
          className="absolute inset-[-10%] opacity-[0.09] blur-[1200px]"
          style={{
            backgroundImage: `url("${backgroundImageSrc}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'saturate(0.7) contrast(0.26) brightness(1.14)',
          }}
        />
      ) : null}

      <style>{`
        @keyframes gallery-card-blob-shift {
          0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          33% { transform: translate3d(15%, 20%, 0) rotate(120deg) scale(1.2); }
          66% { transform: translate3d(-15%, 15%, 0) rotate(240deg) scale(0.85); }
          100% { transform: translate3d(0, 0, 0) rotate(360deg) scale(1); }
        }
      `}</style>

      <div className={`absolute inset-0 blur-[45px] [transform:scale(1.3)] ${theme.mode === 'mono' ? 'saturate-[0.96]' : 'saturate-[1.02]'}`}>
        {blobs.map((blob, index) => (
          <div
            key={`${seed}-${index}`}
            className="absolute rounded-full"
            style={{
              width: blob.size,
              height: blob.size,
              top: (blob as any).top,
              left: (blob as any).left,
              right: (blob as any).right,
              bottom: (blob as any).bottom,
              background: (blob as any).gradient,
              animationName: 'gallery-card-blob-shift',
              animationDuration: (blob as any).duration,
              animationDelay: (blob as any).delay,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationDirection: (blob as any).direction || 'normal',
            }}
          />
        ))}
      </div>

      <div className="absolute inset-x-5 bottom-5">
        <div className="rounded-2xl border border-black/5 bg-white/45 px-4 py-3 backdrop-blur-md shadow-[0_10px_30px_rgba(255,255,255,0.18)]">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full animate-pulse"
              style={{
                backgroundColor: theme.accent,
                boxShadow: `0 0 18px ${hexToRgba(theme.accent, 0.5)}`,
              }}
            />
            <div className="text-xs font-bold text-zinc-900/85">{label}</div>
          </div>
          <div className="mt-1 text-[11px] text-zinc-700/60">Rendering preview...</div>
        </div>
      </div>
    </div>
  );
};

const ImagesGalleryView: React.FC<ImagesGalleryViewProps> = (props) => {
  const {
    panelClassName,
    t,
    tr,

    galleryFileInputRef,
    galleryImages,
    galleryPreviewUrls,
    galleryRestoredImagePaths,
    isGalleryDragActive,
    setIsGalleryDragActive,
    setGalleryRestoredImagePaths,
    appendGalleryFiles,
    setGalleryImages,

    handleGalleryAiAnalyze,
    isGalleryAnalyzing,

    galleryProductName,
    setGalleryProductName,
    galleryCategory,
    setGalleryCategory,
    gallerySellingPoints,
    setGallerySellingPoints,

    hotStyleLoading,
    hotStyleItems,
    hotStyleSelectedIndex,
    setHotStyleSelectedIndex,
    hotStyleError,
    handleHotStyleAnalyze,

    isGalleryModelInfoOpen,
    setIsGalleryModelInfoOpen,
    galleryModelImagePreviewUrl,
    galleryModelImagePath,
    galleryModelFileInputRef,
    setGalleryModelImageFile,
    setGalleryModelImagePath,
    galleryModelInfo,
    setGalleryModelInfo,
    handleGalleryModelFileSelection,

    galleryTargetScene,
    setGalleryTargetScene,
    galleryStyle,
    setGalleryStyle,
    galleryCopyLanguage,
    setGalleryCopyLanguage,
    GALLERY_COPY_LANGUAGE_OPTIONS,

    galleryScenePresetId,
    GALLERY_SCENE_PRESETS,
    clearGallerySceneConfig,
    applyGalleryScenePreset,

    gallerySceneTheme,
    setGallerySceneTheme,
    gallerySceneMood,
    setGallerySceneMood,
    gallerySceneDescription,
    setGallerySceneDescription,
    gallerySceneProps,
    setGallerySceneProps,
    gallerySceneLighting,
    setGallerySceneLighting,

    galleryTypeSelections,
    setGalleryTypeSelections,

    galleryAspectRatio,
    setGalleryAspectRatio,
    galleryResolution,
    setGalleryResolution,

    handleGalleryGenerate,
    isGalleryGenerating,

    galleryRightPanel,
    setGalleryRightPanel,
    setIsGalleryHistoryManaging,
    setGalleryHistorySelectedKeys,
    openGalleryBoardEditor,

    galleryPreviewItems,
    openGalleryImagePreview,
    galleryHistoryItems,

    galleryLoadingTheme,
    galleryLoadingBackgroundSrc,

    preventDragDefaults,
  } = props;

  const galleryPreviewAspectClass = React.useMemo(() => getGalleryPreviewAspectClass(galleryAspectRatio), [galleryAspectRatio]);

  return (
    <div className={`${panelClassName('product_images_gallery')} h-full min-h-0 flex flex-col px-10 py-6`}>
      <div className="flex-1 min-h-0 flex gap-6 overflow-hidden">
        <div className="w-[24%] min-w-[320px] max-w-[420px] flex flex-col gap-4 min-h-0 overflow-y-auto custom-scroll pr-2">
          <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-zinc-200">
                {t.wb_product_images_gallery_upload_title || 'Upload Product Images'}
              </div>
              <button
                type="button"
                onClick={handleGalleryAiAnalyze}
                disabled={isGalleryAnalyzing}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 disabled:opacity-60 disabled:hover:bg-zinc-900/70 transition"
              >
                {isGalleryAnalyzing ? tr('填写中...', 'Filling...') : tr('AI帮我填', 'AI Fill')}
              </button>
            </div>

            <div className="mt-4">
              <input
                ref={galleryFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  appendGalleryFiles(Array.from(e.target.files || []));
                  e.target.value = '';
                }}
              />
              <div
                className="transition-colors"
                onDragEnter={(e) => {
                  preventDragDefaults(e);
                  setIsGalleryDragActive(true);
                }}
                onDragOver={(e) => {
                  preventDragDefaults(e);
                  setIsGalleryDragActive(true);
                }}
                onDragLeave={(e) => {
                  preventDragDefaults(e);
                  setIsGalleryDragActive(false);
                }}
                onDrop={(e) => {
                  preventDragDefaults(e);
                  setIsGalleryDragActive(false);
                  appendGalleryFiles(Array.from(e.dataTransfer.files || []));
                }}
              >
                {galleryImages.length === 0 && galleryRestoredImagePaths.length > 0 ? (
                  <>
                    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300 flex items-center justify-between gap-2">
                      <span>
                        {tr(
                          `已从历史记录恢复 ${galleryRestoredImagePaths.length} 张原始商品图`,
                          `${galleryRestoredImagePaths.length} image(s) restored from history`
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setGalleryRestoredImagePaths([])}
                        className="text-emerald-400 hover:text-emerald-200 shrink-0"
                        title={tr('清除', 'Clear')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {galleryRestoredImagePaths.map((p: string, idx: number) => (
                        <div key={p} className="relative rounded-xl overflow-hidden border border-emerald-500/20 bg-black/30 aspect-square">
                          <img src={p} className="w-full h-full object-cover" alt={`restored-${idx}`} />
                          <button
                            type="button"
                            onClick={() => setGalleryRestoredImagePaths((prev: string[]) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                            title={tr('移除', 'Remove')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {galleryRestoredImagePaths.length < 3 && (
                        <button
                          type="button"
                          onClick={() => galleryFileInputRef.current?.click()}
                          className="group relative rounded-xl border border-dashed border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition flex items-center justify-center aspect-square"
                          title={tr('上传新图片替换', 'Upload new images to replace')}
                        >
                          <Plus className="w-6 h-6 transition-opacity duration-150 group-hover:opacity-0" />
                          <Upload className="absolute w-6 h-6 opacity-0 transition-opacity duration-150 group-hover:opacity-80" />
                        </button>
                      )}
                    </div>
                  </>
                ) : galleryImages.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => galleryFileInputRef.current?.click()}
                    className={`group mt-3 w-full rounded-2xl border border-dashed px-4 py-10 text-center transition ${isGalleryDragActive
                        ? 'border-orange-500/70 bg-orange-500/10 text-orange-100'
                        : 'border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                      }`}
                  >
                    <div className="relative w-10 h-10 mx-auto mb-2">
                      <ImageIcon className="w-10 h-10 opacity-50 transition-opacity duration-150 group-hover:opacity-0" />
                      <Upload className="absolute inset-0 w-10 h-10 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
                    </div>
                    <div className="text-sm font-semibold">{t.pi_gallery_upload_title}</div>
                    <div className="text-[11px] mt-1">
                      {tr('支持拖拽或点击上传，最多 3 张图片', 'Drag and drop or click to upload, up to 3 images')}
                    </div>
                  </button>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {galleryPreviewUrls.map((url: string, idx: number) => (
                      <div key={url} className="relative rounded-xl overflow-hidden border border-white/10 bg-black/30 aspect-square">
                        <img src={url} className="w-full h-full object-cover" alt={`product-${idx}`} />
                        <button
                          type="button"
                          onClick={() => setGalleryImages((prev: File[]) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                          title="移除"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {galleryImages.length < 3 && (
                      <button
                        type="button"
                        onClick={() => galleryFileInputRef.current?.click()}
                        className="group relative rounded-xl border border-dashed border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition flex items-center justify-center aspect-square"
                        title="添加图片"
                      >
                        <Plus className="w-6 h-6 transition-opacity duration-150 group-hover:opacity-0" />
                        <Upload className="absolute w-6 h-6 opacity-0 transition-opacity duration-150 group-hover:opacity-80" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-zinc-200">{tr('商品信息', 'Product Info')}</div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_product}</div>
                <input
                  value={galleryProductName}
                  onChange={(e) => setGalleryProductName(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  placeholder={t.pi_gallery_placeholder_product_name}
                />
              </div>

              <div className="space-y-2">
                <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_category}</div>
                <input
                  value={galleryCategory}
                  onChange={(e) => setGalleryCategory(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                  placeholder={t.pi_gallery_placeholder_category}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pi_gallery_selling_points_label}</div>
                  <button
                    type="button"
                    onClick={() => setGallerySellingPoints((prev: string[]) => (prev.length >= 5 ? prev : [...prev, '']))}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-60"
                    disabled={gallerySellingPoints.length >= 5}
                  >
                    {t.ui_add}
                  </button>
                </div>
                {gallerySellingPoints.length === 0 ? (
                  <div className="text-xs text-zinc-600">{t.ui_not_filled}</div>
                ) : (
                  <div className="space-y-2">
                    {gallerySellingPoints.map((val: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={val}
                          onChange={(e) => setGallerySellingPoints((prev: string[]) => prev.map((p, i) => (i === idx ? e.target.value : p)))}
                          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                          placeholder={`卖点 ${idx + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => setGallerySellingPoints((prev: string[]) => prev.filter((_, i) => i !== idx))}
                          className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center"
                          title="移除"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
            <div className="text-sm font-bold text-zinc-200">{tr('爆款风格分析', 'Hot Style Analysis')}</div>

            {hotStyleLoading ? (
              <div className="mt-4 h-28 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-zinc-400/70 animate-pulse [animation-delay:300ms]" />
                </div>
                <div className="text-xs">{tr('爆款风格生成中...', 'Analyzing styles...')}</div>
              </div>
            ) : hotStyleItems.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={handleHotStyleAnalyze}
                  disabled={!(galleryImages.length > 0 && gallerySellingPoints.some((p: string) => String(p || '').trim()))}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />{tr('爆款风格分析', 'Analyze Hot Styles')}
                </button>
                {!(galleryImages.length > 0 && gallerySellingPoints.some((p: string) => String(p || '').trim())) && (
                  <div className="mt-2 text-[11px] text-zinc-500">{tr('需上传图片并填写核心卖点', 'Upload images and fill selling points first')}</div>
                )}
                {hotStyleError ? <div className="mt-2 text-[11px] text-red-400">{hotStyleError}</div> : null}
              </>
            ) : (
              <>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('风格建议', 'Style Ideas')}</div>
                  <button
                    type="button"
                    onClick={handleHotStyleAnalyze}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <RotateCw className="w-4 h-4" />{tr('换一批风格', 'Regenerate')}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {hotStyleItems.map((s: any, idx: number) => {
                    const isSelected = hotStyleSelectedIndex === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setHotStyleSelectedIndex((prev: number | null) => (prev === idx ? null : idx))}
                        className={`relative text-left rounded-xl border bg-black/20 p-3 transition ${isSelected
                            ? 'border-orange-500'
                            : 'border-white/10 hover:border-white/20'
                          }`}
                        title={isSelected ? tr('已选择，再次点击取消', 'Selected. Click again to unselect') : tr('点击选择', 'Click to select')}
                      >
                        <div className="flex items-center gap-1 mb-2">
                          {s.tones.slice(0, 4).map((c: string, i: number) => (
                            <span key={i} className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <div className="text-sm font-bold text-zinc-200">{s.name}</div>
                        <div className="mt-1 text-xs text-zinc-400">{s.description}</div>
                        <div
                          className={`absolute top-2 right-2 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] font-bold ${isSelected
                              ? 'bg-orange-500 border-orange-500 text-black'
                              : 'bg-black/40 border-white/20 text-transparent'
                            }`}
                        >
                          ✓
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-zinc-200">{tr('模特信息', 'Model Info')}</div>
              <button
                type="button"
                onClick={() => setIsGalleryModelInfoOpen((prev: boolean) => !prev)}
                className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center"
                aria-label={isGalleryModelInfoOpen ? tr('收起', 'Collapse') : tr('展开', 'Expand')}
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${isGalleryModelInfoOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {isGalleryModelInfoOpen ? (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('模特照片', 'Model Photo')}</div>
                  <div className="flex items-start gap-3">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-black/20 shrink-0">
                      {galleryModelImagePreviewUrl || galleryModelImagePath ? (
                        <img
                          src={galleryModelImagePreviewUrl || galleryModelImagePath}
                          className="w-full h-full object-cover"
                          alt={tr('模特照片', 'Model Photo')}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => galleryModelFileInputRef.current?.click()}
                          className="w-full h-full text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition flex items-center justify-center"
                        >
                          <Upload className="w-5 h-5" />
                        </button>
                      )}
                      {galleryModelImagePreviewUrl || galleryModelImagePath ? (
                        <button
                          type="button"
                          onClick={() => {
                            setGalleryModelImageFile(null);
                            setGalleryModelImagePath('');
                          }}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                          aria-label={tr('移除', 'Remove')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>

                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => galleryModelFileInputRef.current?.click()}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800"
                      >
                        {tr('上传模特照片', 'Upload Model Photo')}
                      </button>
                      <div className="mt-2 text-[11px] text-zinc-500">
                        {tr('可选：用于生成含模特出镜的场景/封面/海报图。', 'Optional: used for scene/cover/poster images with the model.')}
                      </div>
                    </div>
                  </div>
                  <input
                    ref={galleryModelFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleGalleryModelFileSelection(Array.from(e.target.files || []))}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('模特信息', 'Model Details')}</div>
                  <textarea
                    value={galleryModelInfo}
                    onChange={(e) => setGalleryModelInfo(e.target.value)}
                    rows={4}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    placeholder={tr('例如：女性，20-30岁，干净自然妆容，黑色长发，休闲运动风穿搭。', 'E.g. Female, 20-30, natural makeup, long black hair, casual sporty outfit.')}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="w-[24%] min-w-[320px] max-w-[460px] flex flex-col gap-4 min-h-0 overflow-y-auto custom-scroll pr-2">
          <div className="rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col flex-1">
            <div className="text-sm font-bold text-zinc-200 shrink-0">{t.hist_img_settings_title}</div>

            <div className="mt-4 p-4 rounded-xl border border-white/10 bg-black/20 space-y-6 flex-1">
              <div>
                <div className="text-xs font-bold text-zinc-200">{t.pi_gallery_settings_section_basics}</div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_scene}</div>
                    <DropdownSelect
                      value={galleryTargetScene}
                      options={[
                        { value: 'detail', label: t.pi_gallery_target_scene_detail },
                        { value: 'xiaohongshu', label: t.pi_gallery_target_scene_xiaohongshu },
                        { value: 'douyin', label: t.pi_gallery_target_scene_douyin },
                        { value: 'poster', label: t.pi_gallery_target_scene_poster },
                        { value: 'ads', label: t.pi_gallery_target_scene_ads },
                      ]}
                      onChange={(v) => setGalleryTargetScene(v as any)}
                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                      iconClassName="w-4 h-4 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_style}</div>
                    <DropdownSelect
                      value={galleryStyle}
                      options={[
                        { value: 'ecom_clean', label: t.pi_gallery_style_ecom_clean },
                        { value: 'lifestyle', label: t.pi_gallery_style_lifestyle },
                        { value: 'premium', label: t.pi_gallery_style_premium },
                        { value: 'festival', label: t.pi_gallery_style_festival },
                      ]}
                      onChange={(v) => setGalleryStyle(v as any)}
                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                      iconClassName="w-4 h-4 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pi_gallery_copy_language_label}</div>
                    <DropdownSelect
                      value={galleryCopyLanguage}
                      options={GALLERY_COPY_LANGUAGE_OPTIONS.map((opt: any) => ({ value: opt.value, label: t[opt.labelKey] }))}
                      onChange={(v) => setGalleryCopyLanguage(String(v || 'en'))}
                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                      iconClassName="w-4 h-4 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-zinc-200">{tr('场景设定', 'Scene Settings')}</div>
                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('场景预设', 'Scene Preset')}</div>
                    <DropdownSelect
                      value={galleryScenePresetId || 'custom'}
                      options={[
                        { value: 'custom', label: tr('自定义', 'Custom') },
                        ...GALLERY_SCENE_PRESETS.map((item: any) => ({ value: item.id, label: item.name })),
                      ]}
                      onChange={(value) => {
                        const next = String(value || 'custom');
                        if (next === 'custom') {
                          clearGallerySceneConfig();
                          return;
                        }
                        applyGalleryScenePreset(next);
                      }}
                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                      iconClassName="w-4 h-4 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('场景主题', 'Scene Theme')}</div>
                      <input
                        type="text"
                        value={gallerySceneTheme}
                        onChange={(e) => setGallerySceneTheme(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                        placeholder={tr('例如：现代厨房台面', 'e.g. modern kitchen counter')}
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('氛围', 'Mood')}</div>
                      <input
                        type="text"
                        value={gallerySceneMood}
                        onChange={(e) => setGallerySceneMood(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                        placeholder={tr('例如：清新生活感', 'e.g. fresh lifestyle')}
                      />
                    </label>
                  </div>

                  <label className="space-y-1">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('场景描述', 'Scene Description')}</div>
                    <textarea
                      value={gallerySceneDescription}
                      onChange={(e) => setGallerySceneDescription(e.target.value)}
                      rows={2}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                      placeholder={tr('描述环境、背景和构图关系', 'Describe environment, background and composition')}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('道具', 'Props')}</div>
                      <input
                        type="text"
                        value={gallerySceneProps}
                        onChange={(e) => setGallerySceneProps(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                        placeholder={tr('例如：玻璃杯、绿植', 'e.g. glass cup, plant')}
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{tr('光线', 'Lighting')}</div>
                      <input
                        type="text"
                        value={gallerySceneLighting}
                        onChange={(e) => setGallerySceneLighting(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-white/20"
                        placeholder={tr('例如：侧前方柔光', 'e.g. soft side-front light')}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-zinc-200">{t.hist_img_setting_types}</div>
                <div className="mt-3 space-y-3">
                  {([
                    ['white_bg', t.pi_gallery_output_white_bg],
                    ['scene', t.pi_gallery_output_scene],
                    ['selling_point', t.pi_gallery_output_selling_point],
                    ['cover', t.pi_gallery_output_cover],
                    ['poster', t.pi_gallery_output_poster],
                  ] as Array<[string, string]>).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <label className="flex items-center gap-2 text-xs text-zinc-200">
                        <input
                          type="checkbox"
                          checked={galleryTypeSelections[key].enabled}
                          onChange={(e) => setGalleryTypeSelections((prev: any) => ({ ...prev, [key]: { ...prev[key], enabled: e.target.checked } }))}
                          className="accent-orange-500"
                        />
                        <span>{label}</span>
                      </label>
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setGalleryTypeSelections((prev: any) => ({ ...prev, [key]: { ...prev[key], count: Math.max(1, prev[key].count - 1) } }))}
                          disabled={!galleryTypeSelections[key].enabled || galleryTypeSelections[key].count <= 1}
                          className="w-8 h-8 rounded-l-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-50 flex items-center justify-center"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="w-10 h-8 flex items-center justify-center border-t border-b border-white/10 bg-black/30 text-xs text-zinc-200">
                          {galleryTypeSelections[key].count}
                        </div>
                        <button
                          type="button"
                          onClick={() => setGalleryTypeSelections((prev: any) => ({ ...prev, [key]: { ...prev[key], count: Math.min(8, prev[key].count + 1) } }))}
                          disabled={!galleryTypeSelections[key].enabled || galleryTypeSelections[key].count >= 8}
                          className="w-8 h-8 rounded-r-lg border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-50 flex items-center justify-center"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-zinc-200">{t.pi_gallery_settings_section_specs}</div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.hist_img_setting_ratio}</div>
                    <DropdownSelect
                      value={galleryAspectRatio}
                      options={[
                        { value: '21:9', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_21_9}` },
                        { value: '16:9', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_16_9}` },
                        { value: '4:3', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_4_3}` },
                        { value: '3:2', label: `${t.pi_gallery_ratio_group_landscape} · ${t.pi_gallery_ratio_3_2}` },
                        { value: '1:1', label: `${t.pi_gallery_ratio_group_square} · ${t.pi_gallery_ratio_1_1}` },
                        { value: 'default', label: `${t.pi_gallery_ratio_group_square} · ${t.pi_gallery_ratio_default}` },
                        { value: '9:16', label: `${t.pi_gallery_ratio_group_vertical} · ${t.pi_gallery_ratio_9_16}` },
                        { value: '3:4', label: `${t.pi_gallery_ratio_group_vertical} · ${t.pi_gallery_ratio_3_4}` },
                        { value: '2:3', label: `${t.pi_gallery_ratio_group_vertical} · ${t.pi_gallery_ratio_2_3}` },
                        { value: '5:4', label: `${t.pi_gallery_ratio_group_flexible} · ${t.pi_gallery_ratio_5_4}` },
                        { value: '4:5', label: `${t.pi_gallery_ratio_group_flexible} · ${t.pi_gallery_ratio_4_5}` },
                      ]}
                      onChange={(v) => setGalleryAspectRatio(String(v))}
                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                      iconClassName="w-4 h-4 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.pi_gallery_resolution_label}</div>
                    <DropdownSelect
                      value={galleryResolution}
                      options={[
                        { value: '1k', label: '1K' },
                        { value: '2k', label: '2K' },
                        { value: '4k', label: '4K' },
                      ]}
                      onChange={(v) => setGalleryResolution(v as any)}
                      buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                      iconClassName="w-4 h-4 text-zinc-500"
                      optionClassName="text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={handleGalleryGenerate}
                disabled={isGalleryGenerating}
                className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400 disabled:opacity-60 disabled:hover:bg-orange-500 transition flex items-center justify-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                {isGalleryGenerating ? tr('生成中...', 'Generating...') : tr('开始生成', 'Generate')}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-zinc-200">
              {galleryRightPanel === 'preview' ? tr('预览区', 'Preview') : tr('历史记录', 'History')}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openGalleryBoardEditor}
                className="px-3 py-2 rounded-xl text-xs font-bold transition border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/15 inline-flex items-center gap-2"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                {tr('画板编辑', 'Board')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGalleryRightPanel('preview');
                  setIsGalleryHistoryManaging(false);
                  setGalleryHistorySelectedKeys([]);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${galleryRightPanel === 'preview'
                    ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                    : 'bg-zinc-900/70 border-white/10 text-zinc-200 hover:bg-zinc-800'
                  }`}
              >
                {tr('预览区', 'Preview')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGalleryRightPanel('history');
                  setIsGalleryHistoryManaging(false);
                  setGalleryHistorySelectedKeys([]);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${galleryRightPanel === 'history'
                    ? 'bg-orange-500/10 border-orange-500 text-orange-300'
                    : 'bg-zinc-900/70 border-white/10 text-zinc-200 hover:bg-zinc-800'
                  }`}
              >
                {tr('历史记录', 'History')}
              </button>
            </div>
          </div>

          {galleryRightPanel === 'preview' ? (
            <div className="flex-1 min-h-0 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 overflow-y-auto custom-scroll">
              {galleryPreviewItems.length === 0 ? (
                <div className="h-full flex items-center justify-center p-6">
                  <div className="w-full max-w-[560px] aspect-square rounded-2xl border border-white/10 bg-black/20 flex flex-col items-center justify-center text-zinc-500 gap-3">
                    <ImageIcon className="w-10 h-10 opacity-60" />
                    <div className="text-sm font-semibold text-zinc-400">
                      {tr('等待生成...', 'Waiting for generation...')}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 grid grid-cols-2 gap-3">
                  {galleryPreviewItems.map((item: any) => {
                    const outputType = String(item.outputType || '').trim();
                    const outputTypeLabel =
                      outputType === 'white_bg'
                        ? t.pi_gallery_output_white_bg
                        : outputType === 'scene'
                          ? t.pi_gallery_output_scene
                          : outputType === 'selling_point'
                            ? t.pi_gallery_output_selling_point
                            : outputType === 'cover'
                              ? t.pi_gallery_output_cover
                              : outputType === 'poster'
                                ? t.pi_gallery_output_poster
                                : '';
                    const rightLabel = String(outputTypeLabel || '').trim() || (outputType ? outputType : item.requestId.slice(0, 8));
                    const statusLabel =
                      item.status === 'succeeded'
                        ? tr('已完成', 'Done')
                        : item.status === 'failed'
                          ? tr('失败', 'Failed')
                          : tr('生成中', 'Generating');
                    const badgeTone =
                      item.status === 'succeeded'
                        ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                        : item.status === 'failed'
                          ? 'bg-red-500/15 text-red-200 border-red-500/30'
                          : 'bg-orange-500/15 text-orange-200 border-orange-500/30';

                    return (
                      <div
                        key={item.localId}
                        className="group rounded-xl border border-white/10 bg-black/20 overflow-hidden shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500/50 hover:shadow-xl"
                      >
                        <div className={`relative w-full ${galleryPreviewAspectClass} border-b border-white/10 bg-black/30`}>
                          {item.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => openGalleryImagePreview(item.imageUrl as string, { kind: 'preview_item', localId: item.localId })}
                              className="absolute inset-0 relative"
                              title={tr('点击预览', 'Click to preview')}
                            >
                              <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.requestId} />
                              <div className="absolute inset-0 opacity-0 transition-opacity duration-200 bg-black/40 flex items-center justify-center group-hover:opacity-100">
                                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold text-white">
                                  <Eye className="w-4 h-4" />
                                  {tr('预览', 'Preview')}
                                </div>
                              </div>
                            </button>
                          ) : item.status !== 'failed' ? (
                            <GalleryLoadingCard
                              theme={galleryLoadingTheme}
                              seed={`${item.localId}-${item.requestId}-${rightLabel}`}
                              label={rightLabel}
                              backgroundImageSrc={galleryLoadingBackgroundSrc}
                            />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-2">
                              <ImageIcon className={`w-8 h-8 ${item.status === 'failed' ? 'opacity-50' : 'opacity-60 animate-pulse'}`} />
                              <div className="text-xs text-zinc-500 px-4 text-center">
                                {item.error || (item.status === 'failed' ? tr('生成失败', 'Failed') : tr('等待生成...', 'Waiting...'))}
                              </div>
                            </div>
                          )}

                          <div className={`absolute top-2 left-2 px-2 py-1 rounded-lg text-[11px] font-bold border ${badgeTone}`}>{statusLabel}</div>
                          <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-[11px] font-bold border border-white/10 bg-black/50 text-zinc-200">
                            {rightLabel}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 overflow-y-auto custom-scroll">
              {galleryHistoryItems.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                  {tr('暂无历史记录', 'No history yet')}
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {galleryHistoryItems
                    .slice()
                    .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
                    .map((item: any) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                        <div className="px-3 py-2 text-[11px] text-zinc-400 border-b border-white/10 bg-black/30 flex items-center justify-between">
                          <span>{item.createdAt}</span>
                          <span className="text-zinc-500">{item.images.length} {tr('张', 'imgs')}</span>
                        </div>
                        <div className="p-3 grid grid-cols-4 gap-2">
                          {item.images.slice(0, 4).map((url: string, idx: number) => {
                            const outputType = (() => {
                              const imageUrl = String(url || '').trim();
                              const metadata = (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata))
                                ? item.metadata
                                : {};

                              const outputTypesByUrl = (metadata as any).outputTypesByUrl;
                              if (outputTypesByUrl && typeof outputTypesByUrl === 'object') {
                                const mapped = String((outputTypesByUrl as any)[imageUrl] || '').trim();
                                if (mapped) return mapped;
                              }

                              const imageTypes = Array.isArray((metadata as any).imageTypes) ? (metadata as any).imageTypes : [];
                              if (idx >= 0 && idx < imageTypes.length) {
                                const mapped = String(imageTypes[idx] || '').trim();
                                if (mapped) return mapped;
                              }

                              const outputImages = Array.isArray((metadata as any).outputImages) ? (metadata as any).outputImages : [];
                              if (outputImages.length > 0) {
                                const matched = outputImages.find((img: any) => {
                                  const rowUrl = String(img?.imageUrl || img?.downloadUrl || img?.url || img?.preview_url || img?.image_url || '').trim();
                                  return rowUrl && rowUrl === imageUrl;
                                });
                                const mapped = String(matched?.outputType || matched?.output_type || matched?.category || matched?.type || '').trim();
                                if (mapped) return mapped;
                              }

                              const maybeResults = (metadata as any).results || (metadata as any).items || (metadata as any).outputs;
                              const results = Array.isArray(maybeResults) ? maybeResults : [];
                              if (results.length > 0) {
                                const matched = results.find((row: any) => {
                                  const rowUrl = String(row?.preview_url || row?.image_url || row?.url || row?.src || '').trim();
                                  return rowUrl && rowUrl === imageUrl;
                                });
                                const mapped = String(matched?.outputType || matched?.output_type || matched?.type || matched?.category || '').trim();
                                if (mapped) return mapped;
                              }

                              const selections = item.settings?.typeSelections;
                              if (selections && typeof selections === 'object') {
                                const enabledKeys = Object.entries(selections)
                                  .filter(([, value]) => Boolean((value as any)?.enabled) && Number((value as any)?.count || 0) > 0)
                                  .map(([key]) => key);
                                if (enabledKeys.length === 1) return enabledKeys[0];
                                if (enabledKeys.length > 1) return tr('多种', 'Multiple');
                              }

                              return '';
                            })();

                            const outputTypeLabel =
                              outputType === 'white_bg'
                                ? t.pi_gallery_output_white_bg
                                : outputType === 'scene'
                                  ? t.pi_gallery_output_scene
                                  : outputType === 'selling_point'
                                    ? t.pi_gallery_output_selling_point
                                    : outputType === 'cover'
                                      ? t.pi_gallery_output_cover
                                      : outputType === 'poster'
                                        ? t.pi_gallery_output_poster
                                        : '';
                            const typeLabel = String(outputTypeLabel || '').trim() || (outputType ? outputType : '');

                            return (
                              <button
                                type="button"
                                key={`${item.id}-${idx}`}
                                onClick={() => openGalleryImagePreview(url, { kind: 'history_item', itemId: item.id, index: idx })}
                                className="relative rounded-lg overflow-hidden border border-white/10 bg-black/30 aspect-square cursor-pointer"
                                title={tr('点击预览', 'Click to preview')}
                              >
                                <img src={url} className="w-full h-full object-cover" alt={`history-${item.id}-${idx}`} />
                                {typeLabel ? (
                                  <div className="absolute top-1 left-1 pointer-events-none rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
                                    {typeLabel}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                          {item.images.length > 4 && (
                            <div className="rounded-lg border border-white/10 bg-black/30 aspect-square flex items-center justify-center text-zinc-500 text-xs font-bold">
                              +{item.images.length - 4}
                            </div>
                          )}
                        </div>
                        {item.settings && (
                          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.targetScene}</span>
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.style}</span>
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.aspectRatio}</span>
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{item.settings.resolution}</span>
                            {String(item.settings.sceneConfig?.sceneTheme || '').trim() ? (
                              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                                {item.settings.sceneConfig?.sceneTheme}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImagesGalleryView;
