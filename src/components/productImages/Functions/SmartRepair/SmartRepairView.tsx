import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Download, Sparkles, ArrowLeft, Home } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { ErrorDialog, type ErrorInfo, ImageUploader, LoadingProgress } from '../../Common';
import { downloadBlob, productImagesApi } from '../../../../services/productImagesApi';
import { billingApi } from '../../../../services/billing';
import type { ProductImageResult, SmartRepairParams, SmartRepairSubpage, SmartRepairToolCode } from '../../../../types/productImages';
import { notifyImageHistoryUpdated, readImageHistoryByFeature, refreshImageHistory, subscribeImageHistory, type ImageHistoryItem } from '../../../../utils/imageHistory';
import { extractLoadingThemeFromSources, getDefaultLoadingTheme, type LoadingTheme } from '../../../../utils/loadingTheme';

type Phase = 'setup' | 'generating' | 'result' | 'error';

interface SmartRepairViewProps {
  onBack?: () => void;
  projectId?: string;
  embedded?: boolean;
}

interface SmartRepairToolDef {
  code: SmartRepairToolCode;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  promptZh: string;
  promptEn: string;
}

interface SmartRepairHistoryEntry {
  id: string;
  createdAt: string;
  outputImages: ProductImageResult[];
  settings?: Partial<SmartRepairParams> & {
    prompt?: string;
    subpage?: SmartRepairSubpage;
    toolCode?: SmartRepairToolCode;
  };
}

const mapImageHistoryToSmartRepairEntry = (item: ImageHistoryItem): SmartRepairHistoryEntry | null => {
  const outputImages = (Array.isArray(item.metadata?.outputImages)
    ? item.metadata.outputImages
        .map((image: any, index: number) => {
          const imageUrl = String(image?.imageUrl || image?.downloadUrl || item.images[index] || '').trim();
          if (!imageUrl) return null;
          return {
            id: String(image?.id || `smart-repair-history-${item.id}-${index}`),
            imageUrl,
            downloadUrl: String(image?.downloadUrl || imageUrl),
            format: String(image?.format || 'jpg'),
            category: image?.category,
            metadata: image?.metadata && typeof image.metadata === 'object' ? image.metadata : undefined,
            size: typeof image?.size === 'number' ? image.size : undefined,
          } as ProductImageResult;
        })
        .filter(Boolean)
    : item.images
        .map((imageUrl, index) => ({
          id: `smart-repair-history-${item.id}-${index}`,
          imageUrl,
          downloadUrl: imageUrl,
          format: 'jpg',
        } as ProductImageResult))
  ) as ProductImageResult[];

  if (outputImages.length === 0) return null;

  return {
    id: item.id,
    createdAt: item.createdAt,
    outputImages,
    settings: item.settings as SmartRepairHistoryEntry['settings'] | undefined,
  };
};

const TOOL_MATRIX: Record<SmartRepairSubpage, SmartRepairToolDef[]> = {
  fashion_model: [
    {
      code: 'mannequin_to_model',
      titleZh: '人台换模特',
      titleEn: 'Mannequin To Model',
      descZh: '将假人台服装转换为真人穿着效果。',
      descEn: 'Replace dress form with realistic model wearing the garment.',
      promptZh: '将假人台服装自然迁移到真实模特身上，保留版型、面料纹理、颜色与细节，生成真实商业拍摄质感。',
      promptEn: 'Replace the dress form or mannequin with a realistic human model naturally wearing the garment. Preserve all fit, proportions, colors and details during transfer, adjusting overall tone to match human photography.',
    },
    {
      code: 'anime_ip',
      titleZh: '卡通插画',
      titleEn: 'Anime IP',
      descZh: '转换为二次元插画风格角色。',
      descEn: 'Transform into anime-style illustration fashion character.',
      promptZh: '将人物与服装转换为二次元插画风格，保持服装结构和识别特征，线条干净、色彩统一、角色风格明确。',
      promptEn: 'Convert the person and garment into anime illustration style, preserving outfit structure, brand elements and key design features. Use clean linework, stylized anime coloring and proportions appropriate for the character design.',
    },
    {
      code: 'fashion_3d_showcase',
      titleZh: '3D服装',
      titleEn: '3D Garment Showcase',
      descZh: '将平面服装图转为立体展示效果。',
      descEn: 'Transform flat garment photo into 3D volumetric showcase.',
      promptZh: '将平面的服装图片立体化，增强褶皱体积感、材质反射和立体轮廓，保持真实摄影观感，不要生成纯3D建模渲染风。',
      promptEn: 'Transform the flat garment image into a 3D-volumetric display by enhancing folds, fabric volume, material reflections, and dimensional contours, making it appear more lifelike and dynamic.',
    },
    {
      code: 'flat_lay_with_accessories',
      titleZh: '服装平铺',
      titleEn: 'Flat Lay With Accessories',
      descZh: '自动搭配配饰生成美观平铺图。',
      descEn: 'Generate styled flat lay with matching complementary accessories.',
      promptZh: '将服装重排为整洁的平铺构图，并自动补充匹配配饰，保持品牌调性、光线一致和电商级画面干净度。',
      promptEn: 'Recompose the garment into a clean, styled flat lay with complementary accessories selected to match the brand and style. Maintain consistent lighting and premium e-commerce composition.',
    },
    {
      code: 'body_reshape',
      titleZh: '改身材',
      titleEn: 'Body Reshape',
      descZh: '按用户要求调节模特高矮胖瘦，保持穿着自然。',
      descEn: 'Adjust model height and body size as requested while keeping wearability natural.',
      promptZh: '根据用户要求精确调整模特体型（高/矮、偏瘦/标准/偏胖等），可按指令改变肩宽、腰围、腿长等比例；重点是实现用户指定体型，而不是自动改成“更合适”的体型。保持人体结构合理，服装版型、贴合关系与细节不丢失。',
      promptEn: 'Precisely adjust the model body based on user-defined target shape (taller/shorter, slimmer/standard/plus-size), including controllable proportions such as shoulder width, waist size, and leg length. Follow the requested body type explicitly instead of auto-optimizing to a generic fit. Keep anatomy plausible and preserve garment fit, silhouette, and details.',
    },
    {
      code: 'accessory_try_on',
      titleZh: '搭配上身',
      titleEn: 'Accessory Try-On',
      descZh: '基于服装/配饰图生成合适模特并完成上身穿戴。',
      descEn: 'Generate a suitable model and dress them with provided clothing and accessories.',
      promptZh: '输入通常是服装与配饰图片（如平铺图）。请先生成与服装风格匹配的合适模特，再让该模特完整穿戴对应服装与配饰；确保穿戴位置正确，光影、遮挡、材质和尺度一致，输出真实商业穿搭效果。',
      promptEn: 'The input is typically clothing and accessory images (such as flat-lay references). First generate a suitable model that matches the outfit style, then dress the model with the provided clothing and accessories as a complete look. Ensure correct placement, realistic occlusion, consistent lighting/materials/scale, and produce a commercial-quality try-on result.',
    },
  ],
  product_object: [
    {
      code: 'product_defect_fix',
      titleZh: '瑕疵修复',
      titleEn: 'Defect Fix',
      descZh: '修复划痕、凹陷、破损等产品缺陷。',
      descEn: 'Repair scratches, dents, and damaged areas.',
      promptZh: '修复产品表面的划痕、凹陷、破损等缺陷，恢复完整质感，保持品牌标识、文字信息和关键结构不变。',
      promptEn: 'Repair all visible defects including scratches, dents, scuffs, breaks and damage areas on the product surface. Restore pristine appearance while preserving exact shape, logo, branding and all structural details.',
    },
    {
      code: 'background_replace',
      titleZh: '背景替换',
      titleEn: 'Background Replace',
      descZh: '在不改主体的前提下替换背景。',
      descEn: 'Replace background while preserving the subject.',
      promptZh: '保留商品主体不变，替换为干净专业的电商背景，保证边缘自然、光线方向与阴影关系一致。',
      promptEn: 'Keep the product untouched and replace the background with a cleaner, more professional e-commerce background. Maintain clean product edges, natural seamless boundary, and consistent lighting and shadow on the product.',
    },
    {
      code: 'stain_remove',
      titleZh: '去污去杂',
      titleEn: 'Stain Removal',
      descZh: '去除污点、水印和多余元素。',
      descEn: 'Remove stains, marks, and unwanted artifacts.',
      promptZh: '清理产品上的污点、水印、指纹、灰尘等杂质，保留原有纹理、高光反射和产品形体，不改变材质观感。',
      promptEn: 'Clean visible stains, watermarks, fingerprints, dust, water spots, and unwanted artifacts from the product. Preserve all original material textures, highlights, reflections, brand markings, and product geometry perfectly.',
    },
    {
      code: 'detail_enhance',
      titleZh: '细节增强',
      titleEn: 'Detail Enhance',
      descZh: '提升产品细节清晰度和质感。',
      descEn: 'Boost product detail sharpness and texture quality.',
      promptZh: '增强产品细部纹理、缝线、印花等细节的清晰度和质感，提升材质表现力，但避免过度锐化和噪点，输出高质感电商图。',
      promptEn: 'Enhance the sharpness and texture details of seams, prints, material surfaces and micro details while avoiding over-sharpening, producing premium e-commerce visuals.',
    },
  ],
  other: [
    {
      code: 'old_photo_restore',
      titleZh: '老图修复',
      titleEn: 'Old Photo Restore',
      descZh: '修复模糊、褪色、折痕老图。',
      descEn: 'Restore faded, blurry, and creased images.',
      promptZh: '修复老旧图片的褪色、模糊、折痕和污渍，提升清晰度与对比度，同时保持原始内容与人物特征真实性。',
      promptEn: 'Restore aged photographs by removing fading, blur, creases, spots and degradation artifacts. Improve overall clarity, contrast and color vibrancy while maintaining historical accuracy and original content integrity.',
    },
    {
      code: 'logo_cleanup',
      titleZh: 'Logo清理',
      titleEn: 'Logo Cleanup',
      descZh: '去除冲突标识并保留画面完整性。',
      descEn: 'Remove conflicting logos while preserving integrity.',
      promptZh: '清理图片中的冲突Logo、水印和杂乱文字，并根据周边内容自然补全，保持画面构图、光影和质感连续。',
      promptEn: 'Remove conflicting logos, watermarks, and unwanted text while seamlessly filling removed areas based on surrounding image context. Maintain overall image composition, lighting continuity and visual flow.',
    },
    {
      code: 'text_replace',
      titleZh: '文案替换',
      titleEn: 'Text Replace',
      descZh: '替换图中文字并保持设计风格。',
      descEn: 'Replace text while keeping visual design style.',
      promptZh: '替换图片中的文案内容，保持字体风格、字重、排版节奏和整体设计语言一致。',
      promptEn: 'Replace the text content in the image while keeping the original typography style, font family, layout rhythm, spacing and overall design language intact.',
    },
    {
      code: 'custom_retouch',
      titleZh: '通用修图',
      titleEn: 'Custom Retouch',
      descZh: '自定义复杂修图任务。',
      descEn: 'Handle custom and complex retouch tasks.',
      promptZh: '根据我给出的修图要求完成目标，保持主体一致、画面自然和商业可用质量。',
      promptEn: 'Complete the custom retouch task according to my specific request while preserving subject consistency and maintaining natural, professional image quality throughout.',
    },
  ],
};

export const SmartRepairView: React.FC<SmartRepairViewProps> = ({ onBack, projectId, embedded = false }) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);

  const [phase, setPhase] = useState<Phase>('setup');
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string>('');
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string>('');
  const [results, setResults] = useState<ProductImageResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<SmartRepairParams['aspectRatio']>('1:1');
  const [strength, setStrength] = useState<SmartRepairParams['strength']>('medium');
  const [outputCount, setOutputCount] = useState<SmartRepairParams['outputCount']>(1);
  const [activeSubpage, setActiveSubpage] = useState<SmartRepairSubpage | null>(null);
  const [activeToolCode, setActiveToolCode] = useState<SmartRepairToolCode | null>(null);
  const [historyItems, setHistoryItems] = useState<SmartRepairHistoryEntry[]>([]);
  const [loadingTheme, setLoadingTheme] = useState<LoadingTheme>(getDefaultLoadingTheme());
  const [loadingBackgroundSrc, setLoadingBackgroundSrc] = useState<string>('');
  const [smartRepairModelRate, setSmartRepairModelRate] = useState<number>(0);

  const subpageOptions: Array<{ key: SmartRepairSubpage; zh: string; en: string }> = [
    { key: 'fashion_model', zh: '服装/模特', en: 'Fashion/Model' },
    { key: 'product_object', zh: '商品/物品', en: 'Product/Object' },
    { key: 'other', zh: '其他', en: 'Other' },
  ];

  const currentTools = activeSubpage ? TOOL_MATRIX[activeSubpage] : [];
  const activeTool = activeToolCode ? currentTools.find((tool) => tool.code === activeToolCode) : undefined;

  const getSamplePath = (code: SmartRepairToolCode, type: 'before' | 'after') =>
    `/smart-repair-examples/${code}_${type}.jpg`;

  const refreshHistory = useCallback(async () => {
    await refreshImageHistory();
    const nextItems = readImageHistoryByFeature('smart_repair')
      .map((item) => mapImageHistoryToSmartRepairEntry(item))
      .filter(Boolean) as SmartRepairHistoryEntry[];
    setHistoryItems(nextItems);
  }, []);

  const resetToStart = () => {
    setPhase('setup');
    setResults([]);
    setProgress(0);
    setError(null);
    setSourceImage(null);
    setReferenceImage(null);
    setPrompt('');
    setActiveSubpage(null);
    setActiveToolCode(null);
  };

  useEffect(() => {
    if (!sourceImage) {
      setSourcePreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(sourceImage);
    setSourcePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceImage]);

  useEffect(() => {
    if (!referenceImage) {
      setReferencePreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(referenceImage);
    setReferencePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [referenceImage]);

  const shellClassName = useMemo(
    () => (embedded ? 'h-full' : 'min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 p-6'),
    [embedded]
  );

  const contentWrapClassName = embedded ? 'w-full' : 'max-w-5xl mx-auto';

  useEffect(() => {
    if (!activeTool) return;
    setPrompt((prev) => {
      if (prev.trim().length > 0) return prev;
      return isZh ? activeTool.promptZh : activeTool.promptEn;
    });
  }, [activeTool, isZh]);

  useEffect(() => {
    void refreshHistory();
    return subscribeImageHistory(() => {
      void refreshHistory();
    });
  }, [refreshHistory]);

  useEffect(() => {
    let alive = true;
    void billingApi.getOverview()
      .then((res) => {
        if (!alive) return;
        const rate = Number(res?.data?.pricing?.image?.models?.['flux-2-pro']?.rate || 0);
        setSmartRepairModelRate(Number.isFinite(rate) && rate > 0 ? rate : 0);
      })
      .catch(() => {
        if (alive) setSmartRepairModelRate(0);
      });
    return () => {
      alive = false;
    };
  }, []);

  const estimatedCost = useMemo(
    () => Math.max(0, Math.round((Number.isFinite(smartRepairModelRate) ? smartRepairModelRate : 0) * Math.max(1, Number(outputCount || 1)))),
    [outputCount, smartRepairModelRate]
  );

  useEffect(() => {
    let alive = true;
    const sources = [sourcePreviewUrl, referencePreviewUrl].map((value) => String(value || '').trim()).filter(Boolean);
    if (sources.length === 0) {
      setLoadingTheme(getDefaultLoadingTheme());
      setLoadingBackgroundSrc('');
      return;
    }

    setLoadingBackgroundSrc(sources[0] || '');
    void extractLoadingThemeFromSources(sources).then((theme) => {
      if (alive) setLoadingTheme(theme);
    });

    return () => {
      alive = false;
    };
  }, [referencePreviewUrl, sourcePreviewUrl]);

  const handleGenerate = async () => {
    if (!activeSubpage || !activeToolCode) {
      setError({
        code: 'NO_FUNCTION',
        message: tr('请先选择功能', 'Please select a function first'),
        severity: 'warning',
      });
      return;
    }

    if (!sourceImage) {
      setError({
        code: 'NO_SOURCE_IMAGE',
        message: tr('请先上传待修复图片', 'Please upload a source image first'),
        severity: 'warning',
      });
      return;
    }

    if (!prompt.trim()) {
      setError({
        code: 'NO_PROMPT',
        message: tr('请填写修复说明', 'Please provide repair instructions'),
        severity: 'warning',
      });
      return;
    }

    try {
      setError(null);
      setPhase('generating');
      setProgress(10);

      const response = await productImagesApi.generateSmartRepair(
        sourceImage,
        {
          prompt,
          aspectRatio,
          strength,
          outputCount,
          subpage: activeSubpage,
          toolCode: activeToolCode,
        },
        projectId,
        referenceImage || undefined
      );

      setProgress(100);
      if (response.status === 'completed' && response.outputImages && response.outputImages.length > 0) {
        await refreshHistory();
        notifyImageHistoryUpdated();
        setResults(response.outputImages);
        setPhase('result');
        return;
      }

      setError({
        code: 'SMART_REPAIR_EMPTY',
        message: tr('修复完成但未返回图片，请重试', 'Repair finished but no image was returned. Please retry.'),
        severity: 'error',
      });
      setPhase('error');
    } catch (err) {
      const message = err instanceof Error ? err.message : tr('未知错误', 'Unknown error');
      setError({
        code: 'SMART_REPAIR_FAILED',
        message,
        severity: 'error',
        suggestion: tr('请检查网络后重试，或简化修复指令', 'Please retry and simplify repair instructions if needed.'),
      });
      setPhase('error');
    }
  };

  const restoreHistoryItem = (item: SmartRepairHistoryEntry) => {
    if (item.settings?.prompt) setPrompt(item.settings.prompt);
    if (item.settings?.aspectRatio) setAspectRatio(item.settings.aspectRatio);
    if (item.settings?.strength) setStrength(item.settings.strength);
    if (item.settings?.outputCount) setOutputCount(item.settings.outputCount);
    if (item.settings?.subpage) setActiveSubpage(item.settings.subpage);
    if (item.settings?.toolCode) setActiveToolCode(item.settings.toolCode);
    setError(null);
    setProgress(100);
    setResults(item.outputImages);
    setPhase('result');
  };

  const handleDownload = async (result: ProductImageResult, index: number) => {
    try {
      const blob = await productImagesApi.downloadImageByUrl(result.imageUrl);
      downloadBlob(blob, `smart_repair_${index + 1}.png`);
    } catch {
      setError({
        code: 'DOWNLOAD_FAILED',
        message: tr('下载失败，请重试', 'Download failed. Please retry.'),
        severity: 'error',
      });
    }
  };

  return (
    <div className={shellClassName}>
      <div className={contentWrapClassName}>
        {!embedded && (
          <div className="flex items-center gap-4 mb-8">
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
                {tr('AI智能修复', 'AI Smart Repair')}
              </h1>
              <p className="text-zinc-400 text-sm">
                {tr('基于三类能力中心进行可扩展的智能修图', 'Extensible smart-retouch workspace with three capability groups')}
              </p>
            </div>
          </div>
        )}

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 md:p-8 shadow-2xl">
          {phase === 'setup' && !activeSubpage && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">
                {tr('步骤 1: 选择子模块', 'Step 1: Select Submodule')}
              </h2>
              <p className="text-sm text-zinc-400 mb-6">
                {tr('选择相应的子模块，查看可用功能并开始编辑。', 'Choose a submodule to view available functions and start editing.')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {subpageOptions.map((item) => {
                  const toolsInModule = TOOL_MATRIX[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setActiveSubpage(item.key);
                        setActiveToolCode(null);
                        setSourceImage(null);
                        setReferenceImage(null);
                        setPrompt('');
                      }}
                      className="rounded-2xl border border-white/10 bg-black/20 p-5 text-left hover:border-orange-400/60 hover:bg-orange-500/5 transition group"
                    >
                      <div className="text-base font-semibold text-zinc-100">{isZh ? item.zh : item.en}</div>
                      <div className="text-xs text-zinc-500 mt-2">
                        {item.key === 'fashion_model' && tr('人像与服装相关智能编辑能力', 'Model and fashion editing capabilities')}
                        {item.key === 'product_object' && tr('商品主图与细节图修复增强能力', 'Product image repair and enhancement capabilities')}
                        {item.key === 'other' && tr('通用图像修复与风格化能力', 'General image retouch and stylization capabilities')}
                      </div>
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <div className="text-xs text-zinc-400 mb-2">
                          {tr('包含功能：', 'Available Functions:')} ({toolsInModule.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {toolsInModule.map((tool) => (
                            <span
                              key={tool.code}
                              className="inline-block px-2 py-1 rounded-md bg-white/5 text-xs text-zinc-300 group-hover:bg-orange-500/10 group-hover:text-orange-200 transition"
                            >
                              {isZh ? tool.titleZh : tool.titleEn}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {phase === 'setup' && activeSubpage && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubpage(null);
                      setActiveToolCode(null);
                      setSourceImage(null);
                      setReferenceImage(null);
                      setPrompt('');
                    }}
                    className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 mb-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {tr('返回子模块选择', 'Back to submodule selection')}
                  </button>
                  <h2 className="text-lg font-semibold text-white">
                    {isZh ? subpageOptions.find((s) => s.key === activeSubpage)?.zh : subpageOptions.find((s) => s.key === activeSubpage)?.en}
                  </h2>
                </div>
              </div>

              {/* Tool Selector Tabs */}
              <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                <div className="text-xs text-zinc-400 mb-3">{tr('步骤 1: 选择功能', 'Step 1: Select Function')}</div>
                <div className="flex gap-2 flex-wrap">
                  {currentTools.map((tool) => {
                    const selected = !!activeToolCode && tool.code === activeToolCode;
                    return (
                      <button
                        key={tool.code}
                        type="button"
                        onClick={() => {
                          setActiveToolCode(tool.code);
                          setPrompt(isZh ? tool.promptZh : tool.promptEn);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                          selected
                            ? 'bg-orange-500/20 text-orange-200 border border-orange-400/60'
                            : 'bg-black/20 text-zinc-300 border border-white/10 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        {isZh ? tool.titleZh : tool.titleEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Function Cards Gallery - Show all tools with before/after examples */}
              <div>
                <div className="text-sm font-semibold text-zinc-200 mb-4">{tr('步骤 2: 功能示例', 'Step 2: Function Showcase')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentTools.map((tool) => {
                    const selected = !!activeToolCode && tool.code === activeToolCode;
                    return (
                      <button
                        key={tool.code}
                        onClick={() => {
                          setActiveToolCode(tool.code);
                          setPrompt(isZh ? tool.promptZh : tool.promptEn);
                        }}
                        className={`rounded-xl border-2 transition overflow-hidden hover:shadow-lg group ${
                          selected
                            ? 'border-orange-400/70 bg-orange-500/10 shadow-lg shadow-orange-500/20'
                            : 'border-white/10 bg-black/40 hover:border-white/20 hover:bg-black/30'
                        }`}
                        type="button"
                      >
                        {/* Before/After Comparison */}
                        <div className="grid grid-cols-2 gap-0">
                          <div className="aspect-square overflow-hidden bg-black/50 relative">
                            <img
                              src={getSamplePath(tool.code, 'before')}
                              alt={isZh ? `${tool.titleZh} 处理前` : `${tool.titleEn} before`}
                              className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition duration-300"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E';
                              }}
                            />
                            <div className="absolute top-1 left-1 bg-black/60 px-2 py-0.5 rounded text-xs text-zinc-300">
                              {tr('前', 'Before')}
                            </div>
                          </div>
                          <div className="aspect-square overflow-hidden bg-black/50 relative">
                            <img
                              src={getSamplePath(tool.code, 'after')}
                              alt={isZh ? `${tool.titleZh} 处理后` : `${tool.titleEn} after`}
                              className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition duration-300"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E';
                              }}
                            />
                            <div className="absolute top-1 right-1 bg-orange-500/80 px-2 py-0.5 rounded text-xs text-white font-semibold">
                              {tr('后', 'After')}
                            </div>
                          </div>
                        </div>
                        {/* Tool Info */}
                        <div className="p-4 text-left">
                          <h4 className="font-semibold text-base text-white truncate group-hover:text-orange-300 transition">
                            {isZh ? tool.titleZh : tool.titleEn}
                          </h4>
                          <p className="text-sm text-zinc-400 mt-1 line-clamp-2">
                            {isZh ? tool.descZh : tool.descEn}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tool Details & Setup */}
              <div className="space-y-4">
                {/* Main Content - Only show when tool is selected */}
                {!activeToolCode && (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                    <div className="text-sm text-zinc-500 mb-2">{tr('💡 提示', '💡 Tip')}</div>
                    <p className="text-sm text-zinc-400">
                      {tr('请从上方功能列表中选择一个功能开始。', 'Please select a function from the list above to begin.')}
                    </p>
                  </div>
                )}

                {activeToolCode && (
                  <>
                    {/* Tool Info Card */}
                    <div className="rounded-xl border border-white/10 bg-black/40 p-5">
                      <h3 className="text-lg font-bold text-orange-300 mb-2">
                        {activeTool ? (isZh ? activeTool.titleZh : activeTool.titleEn) : '-'}
                      </h3>
                      <p className="text-sm text-zinc-300">
                        {activeTool ? (isZh ? activeTool.descZh : activeTool.descEn) : '-'}
                      </p>
                    </div>

                  {/* Upload Section - Two Column */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-semibold text-zinc-200 mb-3">{tr('步骤 3: 上传原图', 'Step 3: Upload Source')}</div>
                      {!sourceImage ? (
                        <ImageUploader
                          maxFiles={1}
                          onFilesSelected={(files) => setSourceImage(files[0] || null)}
                          onError={(err) =>
                            setError({
                              code: 'UPLOAD_ERROR',
                              message: err,
                              severity: 'warning',
                            })
                          }
                        />
                      ) : (
                        <div>
                          <img src={sourcePreviewUrl} alt="source" className="w-full rounded-lg border border-white/10 object-cover" style={{maxHeight: '400px'}} />
                          <button
                            onClick={() => setSourceImage(null)}
                            className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline"
                          >
                            {tr('更换图片', 'Change')}
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-zinc-200 mb-3">{tr('参考图 (可选)', 'Reference (Optional)')}</div>
                      <ImageUploader
                        maxFiles={1}
                        onFilesSelected={(files) => setReferenceImage(files[0] || null)}
                        onError={(err) =>
                          setError({
                            code: 'REFERENCE_UPLOAD_ERROR',
                            message: err,
                            severity: 'warning',
                          })
                        }
                      />
                      {referencePreviewUrl && (
                        <div className="mt-2">
                          <img src={referencePreviewUrl} alt="reference" className="w-full rounded-lg border border-white/10 object-cover" style={{maxHeight: '300px'}} />
                          <button
                            onClick={() => setReferenceImage(null)}
                            className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline"
                          >
                            {tr('移除参考图', 'Remove')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Repair Instructions */}
                  <div>
                    <div className="text-sm font-semibold text-zinc-200 mb-3">{tr('步骤 4: 修复说明', 'Step 4: Repair Instructions')}</div>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={5}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-orange-400/50"
                      placeholder={tr('例如：去除杯身水印，保留材质高光和边缘细节', 'E.g. Remove watermark while preserving highlights')}
                    />
                  </div>

                  {/* Parameters - Three Column */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-zinc-400 mb-2 font-medium">{tr('强度', 'Strength')}</div>
                      <select
                        value={strength}
                        onChange={(e) => setStrength(e.target.value as SmartRepairParams['strength'])}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-400/50"
                      >
                        <option value="light">{tr('轻度', 'Light')}</option>
                        <option value="medium">{tr('中度', 'Medium')}</option>
                        <option value="strong">{tr('强力', 'Strong')}</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-400 mb-2 font-medium">{tr('比例', 'Aspect')}</div>
                      <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as SmartRepairParams['aspectRatio'])}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-400/50"
                      >
                        <option value="1:1">1:1</option>
                        <option value="4:5">4:5</option>
                        <option value="9:16">9:16</option>
                        <option value="16:9">16:9</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-400 mb-2 font-medium">{tr('张数', 'Count')}</div>
                      <select
                        value={outputCount}
                        onChange={(e) => setOutputCount(Number(e.target.value) as SmartRepairParams['outputCount'])}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-400/50"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={4}>4</option>
                      </select>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setSourceImage(null);
                        setReferenceImage(null);
                        if (activeTool) {
                          setPrompt(isZh ? activeTool.promptZh : activeTool.promptEn);
                        }
                      }}
                      className="px-4 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
                    >
                      {tr('清空输入', 'Clear')}
                    </button>
                    <button
                      onClick={handleGenerate}
                      className="flex-1 px-4 py-2 text-sm font-semibold bg-orange-500 text-black rounded-lg hover:bg-orange-400 transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!sourceImage}
                    >
                      <Sparkles className="w-4 h-4" />
                      {tr('步骤 5: 开始修复', 'Step 5: Start Repair')}
                      {estimatedCost > 0 ? (
                        <span className="ml-1 text-[10px] font-semibold text-black/75 whitespace-nowrap">
                          {`-${estimatedCost} ${tr('V点', 'V-points')}`}
                        </span>
                      ) : null}
                    </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {phase === 'generating' && (
            <div className="flex justify-center">
              <LoadingProgress
                progress={progress}
                estimatedTime={35}
                currentStep={tr('智能修复生成中', 'Generating smart-repair images')}
                totalSteps={3}
                title={tr('正在进行智能修复...', 'Performing smart repair...')}
                theme={loadingTheme}
                backgroundImageSrc={loadingBackgroundSrc}
                onCancel={() => setPhase('setup')}
              />
            </div>
          )}

          {phase === 'result' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">{tr('生成结果', 'Generation Results')}</h2>
                  <p className="text-sm text-zinc-400 mt-1">{results.length} {tr('张图片已生成', 'images generated')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPhase('setup')}
                    className="px-4 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
                  >
                    {tr('调整参数', 'Adjust Params')}
                  </button>
                  <button
                    onClick={resetToStart}
                    className="px-4 py-2 text-sm bg-white/10 text-zinc-200 rounded-lg hover:bg-white/20 transition inline-flex items-center gap-2"
                  >
                    <Home className="w-4 h-4" />
                    {tr('回到开头', 'Back To Start')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((item, idx) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden hover:border-orange-400/30 transition">
                    <img src={item.imageUrl} alt={`smart-repair-${idx}`} className="w-full aspect-video object-cover" />
                    <div className="p-3">
                      <button
                        onClick={() => handleDownload(item, idx)}
                        className="w-full px-3 py-2 text-sm bg-orange-500 text-black font-semibold rounded-lg hover:bg-orange-400 transition inline-flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        {tr('下载', 'Download')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-10 border-t border-white/10 pt-8">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">{tr('最近生成', 'Recent Generations')}</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {tr('已保存的修复结果 • ', 'Saved results • ')}
                  <span className="text-zinc-300">{historyItems.length}</span>
                </p>
              </div>
            </div>

            {historyItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
                <p className="text-sm text-zinc-500">
                  {tr('暂无历史记录，生成成功后会出现在这里。', 'No history yet. Successful generations will appear here.')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {historyItems.slice(0, 12).map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden hover:border-orange-400/30 transition">
                    <div className="aspect-video overflow-hidden bg-black/50">
                      <img
                        src={item.outputImages[0].imageUrl}
                        alt={`smart-repair-history-thumbnail`}
                        className="w-full h-full object-cover hover:scale-105 transition duration-300"
                      />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-xs text-zinc-400">{new Date(item.createdAt).toLocaleDateString()}</div>
                        <div className="text-xs bg-zinc-800/50 text-zinc-300 px-2 py-1 rounded">{item.outputImages.length} {tr('张', 'images')}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => restoreHistoryItem(item)}
                          className="flex-1 px-3 py-2 text-xs bg-white/10 text-zinc-200 rounded-lg hover:bg-orange-500/20 hover:text-orange-200 transition"
                        >
                          {tr('查看', 'View')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(item.outputImages[0], 0)}
                          className="px-3 py-2 text-xs bg-orange-500/20 text-orange-200 rounded-lg hover:bg-orange-500/30 transition inline-flex items-center"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {phase === 'error' && error && (
            <ErrorDialog
              isOpen={true}
              error={error}
              onClose={() => setPhase('setup')}
              onRetry={() => {
                setError(null);
                setPhase('setup');
              }}
              showRetry={true}
            />
          )}

          {error && phase !== 'error' && (
            <ErrorDialog
              isOpen={!!error}
              error={error}
              onClose={() => setError(null)}
              onRetry={() => {
                setError(null);
                setPhase('setup');
              }}
              showRetry={true}
            />
          )}
        </div>
      </div>
    </div>
  );
};
