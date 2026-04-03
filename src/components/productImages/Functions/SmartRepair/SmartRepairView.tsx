import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Download, Sparkles, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { ErrorDialog, type ErrorInfo, ImageUploader, LoadingProgress } from '../../Common';
import { downloadBlob, productImagesApi } from '../../../../services/productImagesApi';
import type { ProductImageResult, SmartRepairParams, SmartRepairSubpage, SmartRepairToolCode } from '../../../../types/productImages';

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

const TOOL_MATRIX: Record<SmartRepairSubpage, SmartRepairToolDef[]> = {
  fashion_model: [
    {
      code: 'mannequin_to_model',
      titleZh: '人台换模特',
      titleEn: 'Mannequin To Model',
      descZh: '将假人台服装转换为真人穿着效果。',
      descEn: 'Replace dress form with realistic model wearing the garment.',
      promptZh: '将假人台或树立杆自然替换为真人模特穿持，保持服装放粘、是型、紫貝不变，转程中保留相关细节，应将大意调整体感。',
      promptEn: 'Replace the dress form or mannequin with a realistic human model naturally wearing the garment. Preserve all fit, proportions, colors and details during transfer, adjusting overall tone to match human photography.',
    },
    {
      code: 'anime_ip',
      titleZh: '卡通插画',
      titleEn: 'Anime IP',
      descZh: '转换为二次元插画风格fashion角色。',
      descEn: 'Transform into anime-style illustration fashion character.',
      promptZh: '将人物与服装体系化为二次元插画管理，保持service服装的特别convention字体与新云体。规端正可世侬签、裙昨一眼动画鸁機。',
      promptEn: 'Convert the person and garment into anime illustration style, preserving outfit structure, brand elements and key design features. Use clean linework, stylized anime coloring and proportions appropriate for the character design.',
    },
    {
      code: 'fashion_3d_showcase',
      titleZh: '3D服装',
      titleEn: '3D Garment Showcase',
      descZh: '将平面服装图转为立体展示效果。',
      descEn: 'Transform flat garment photo into 3D volumetric showcase.',
      promptZh: '将平面的服装图片立体化，增强褶皱体积感、材质反射和立体轮廓，让服装展示更生动逼真。',
      promptEn: 'Transform the flat garment image into a 3D-volumetric display by enhancing folds, fabric volume, material reflections, and dimensional contours, making it appear more lifelike and dynamic.',
    },
    {
      code: 'flat_lay_with_accessories',
      titleZh: '服装平铺',
      titleEn: 'Flat Lay With Accessories',
      descZh: '自动搭配配饰生成美观平铺图。',
      descEn: 'Generate styled flat lay with matching complementary accessories.',
      promptZh: '将服装重新排版为平铺预览成汇与的体験，自动随便配会搭。保持照明体作为一份特汇美观美观朝下枚姓。',
      promptEn: 'Recompose the garment into a clean, styled flat lay with complementary accessories selected to match the brand and style. Maintain consistent lighting and premium e-commerce composition.',
    },
    {
      code: 'body_reshape',
      titleZh: '改身材',
      titleEn: 'Body Reshape',
      descZh: '自然调整模特体型，保持服装贴合。',
      descEn: 'Naturally adjust model body type while preserving garment fit.',
      promptZh: '自然微调模特体型比例（如腰部、腿部线条），保持肢体结构合理，确保服装贴合关系和细节完整不变。',
      promptEn: 'Naturally refine model body proportions (waist, legs) while maintaining anatomical plausibility and ensuring the garment fitting, seams, and details remain perfectly intact.',
    },
    {
      code: 'accessory_try_on',
      titleZh: '搭配上身',
      titleEn: 'Accessory Try-On',
      descZh: '把配饰自然添加到模特身上。',
      descEn: 'Add accessories naturally onto the model.',
      promptZh: '将配饰自然叠加到模特对应部位，确保光影、遮挡和材质一致。',
      promptEn: 'Place accessories naturally on the model with consistent lighting, occlusion, and material realism.',
    },
  ],
  product_object: [
    {
      code: 'product_defect_fix',
      titleZh: '瑕疵修复',
      titleEn: 'Defect Fix',
      descZh: '修复划痕、凹陷、破损等产品缺陷。',
      descEn: 'Repair scratches, dents, and damaged areas.',
      promptZh: '修复产品表面的划痕、凹陷、破收、卧骏、破收等缺陷，恢复完整质感，保持品牌标志、字段等关键结构告务。',
      promptEn: 'Repair all visible defects including scratches, dents, scuffs, breaks and damage areas on the product surface. Restore pristine appearance while preserving exact shape, logo, branding and all structural details.',
    },
    {
      code: 'background_replace',
      titleZh: '背景替换',
      titleEn: 'Background Replace',
      descZh: '在不改主体的前提下替换背景。',
      descEn: 'Replace background while preserving the subject.',
      promptZh: '保留商品主体不动，替换为更干净、专业的电商背景，保持产品边缘干净自然、扶摇上的照明和阴影继续一致。',
      promptEn: 'Keep the product untouched and replace the background with a cleaner, more professional e-commerce background. Maintain clean product edges, natural seamless boundary, and consistent lighting and shadow on the product.',
    },
    {
      code: 'stain_remove',
      titleZh: '去污去杂',
      titleEn: 'Stain Removal',
      descZh: '去除污点、水印和多余元素。',
      descEn: 'Remove stains, marks, and unwanted artifacts.',
      promptZh: '清理产品表面或上殷的污笔、水板问题、四指澳、尘埔、水搬、砉疣等欠会。保留原有输线纹理、高光、反光、标多、产品形体。',
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
      promptZh: '修复老旧图片的褪色、失别、折痕、产欠多等厡化汁陷，提升清晰度、对比度上下怖人，但保持原始内容真实性。',
      promptEn: 'Restore aged photographs by removing fading, blur, creases, spots and degradation artifacts. Improve overall clarity, contrast and color vibrancy while maintaining historical accuracy and original content integrity.',
    },
    {
      code: 'logo_cleanup',
      titleZh: 'Logo清理',
      titleEn: 'Logo Cleanup',
      descZh: '去除冲突标识并保留画面完整性。',
      descEn: 'Remove conflicting logos while preserving integrity.',
      promptZh: '清理图中的冲突Logo、水印、艺残文字、杂乱美粗，基于周边上下文窮准填充。保持画面汇版、照明上左线道2。',
      promptEn: 'Remove conflicting logos, watermarks, and unwanted text while seamlessly filling removed areas based on surrounding image context. Maintain overall image composition, lighting continuity and visual flow.',
    },
    {
      code: 'text_replace',
      titleZh: '文案替换',
      titleEn: 'Text Replace',
      descZh: '替换图中文字并保持设计风格。',
      descEn: 'Replace text while keeping visual design style.',
      promptZh: '替换图片中的牛文案内容，保持字体风格、琵字拰、缝隔章节和整体设计汉语不变。',
      promptEn: 'Replace the text content in the image while keeping the original typography style, font family, layout rhythm, spacing and overall design language intact.',
    },
    {
      code: 'custom_retouch',
      titleZh: '通用修图',
      titleEn: 'Custom Retouch',
      descZh: '自定义复杂修图任务。',
      descEn: 'Handle custom and complex retouch tasks.',
      promptZh: '根据我给出的修图要求完成目标，不畀信人物不腙一致、的绎美谊自然。',
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

  const subpageOptions: Array<{ key: SmartRepairSubpage; zh: string; en: string }> = [
    { key: 'fashion_model', zh: '服装/模特', en: 'Fashion/Model' },
    { key: 'product_object', zh: '商品/物品', en: 'Product/Object' },
    { key: 'other', zh: '其他', en: 'Other' },
  ];

  const currentTools = activeSubpage ? TOOL_MATRIX[activeSubpage] : [];
  const activeTool = activeToolCode ? currentTools.find((tool) => tool.code === activeToolCode) : undefined;

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
                {tr('智能修复', 'Smart Repair')}
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
                {tr('先进入业务子模块，再选择具体功能。', 'Enter a business submodule first, then pick a specific function.')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {subpageOptions.map((item) => (
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
                    className="rounded-2xl border border-white/10 bg-black/20 p-5 text-left hover:border-orange-400/60 hover:bg-orange-500/5 transition"
                  >
                    <div className="text-base font-semibold text-zinc-100">{isZh ? item.zh : item.en}</div>
                    <div className="text-xs text-zinc-500 mt-2">
                      {item.key === 'fashion_model' && tr('人像与服装相关智能编辑能力', 'Model and fashion editing capabilities')}
                      {item.key === 'product_object' && tr('商品主图与细节图修复增强能力', 'Product image repair and enhancement capabilities')}
                      {item.key === 'other' && tr('通用图像修复与风格化能力', 'General image retouch and stylization capabilities')}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === 'setup' && activeSubpage && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
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
                    className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 mb-3"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {tr('返回子模块选择', 'Back to submodule selection')}
                  </button>
                  <div className="text-sm font-semibold text-zinc-200 mb-2">
                    {tr('步骤 2: 选择功能', 'Step 2: Select Function')} · {isZh ? subpageOptions.find((s) => s.key === activeSubpage)?.zh : subpageOptions.find((s) => s.key === activeSubpage)?.en}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-zinc-200 mb-2">{tr('功能列表', 'Function List')}</div>
                  <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
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
                          className={`rounded-xl border p-3 text-left transition ${selected ? 'border-orange-400/70 bg-orange-500/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}
                        >
                          <div className={`text-sm font-semibold ${selected ? 'text-orange-200' : 'text-zinc-200'}`}>
                            {isZh ? tool.titleZh : tool.titleEn}
                          </div>
                          <div className="text-xs text-zinc-400 mt-1">
                            {isZh ? tool.descZh : tool.descEn}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!activeToolCode && (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
                    {tr('请选择一个功能后再进入上传和参数设置。', 'Please choose a function before uploading and configuring parameters.')}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {activeToolCode && (
                  <>
                    <div>
                      <div className="text-sm font-semibold text-zinc-200 mb-2">{tr('步骤 3: 上传原图', 'Step 3: Upload Source Image')}</div>
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
                        <img src={sourcePreviewUrl} alt="source" className="w-full rounded-xl border border-white/10 object-cover max-h-72" />
                      )}
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-zinc-200 mb-2">{tr('参考图（可选）', 'Reference Image (Optional)')}</div>
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
                        <img src={referencePreviewUrl} alt="reference" className="mt-3 w-full rounded-xl border border-white/10 object-cover max-h-48" />
                      )}
                    </div>
                  </>
                )}

                <div>
                  <div className="text-sm font-semibold text-zinc-200 mb-2">{tr('步骤 4: 修复说明', 'Step 4: Repair Instruction')}</div>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={6}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                    placeholder={tr('例如：去除杯身水印，保留材质高光和边缘细节', 'Example: Remove the watermark on the cup body while preserving texture highlights and edge details.')}
                    disabled={!activeToolCode}
                  />
                  <div className="mt-2 text-xs text-zinc-500">
                    {tr('当前功能：', 'Current function: ')}
                    <span className="text-zinc-300">{activeTool ? (isZh ? activeTool.titleZh : activeTool.titleEn) : tr('未选择', 'Not selected')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">{tr('强度', 'Strength')}</div>
                    <select
                      value={strength}
                      onChange={(e) => setStrength(e.target.value as SmartRepairParams['strength'])}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200"
                      disabled={!activeToolCode}
                    >
                      <option value="light">{tr('轻度', 'Light')}</option>
                      <option value="medium">{tr('中度', 'Medium')}</option>
                      <option value="strong">{tr('强力', 'Strong')}</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-400 mb-1">{tr('比例', 'Aspect')}</div>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as SmartRepairParams['aspectRatio'])}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200"
                      disabled={!activeToolCode}
                    >
                      <option value="1:1">1:1</option>
                      <option value="4:5">4:5</option>
                      <option value="9:16">9:16</option>
                      <option value="16:9">16:9</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-400 mb-1">{tr('张数', 'Count')}</div>
                    <select
                      value={outputCount}
                      onChange={(e) => setOutputCount(Number(e.target.value) as SmartRepairParams['outputCount'])}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200"
                      disabled={!activeToolCode}
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={4}>4</option>
                    </select>
                  </div>
                </div>

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
                    disabled={!activeToolCode}
                  >
                    {tr('清空输入', 'Clear Input')}
                  </button>
                  <button
                    onClick={handleGenerate}
                    className="px-4 py-2 text-sm font-semibold bg-orange-500 text-black rounded-lg hover:bg-orange-400 transition inline-flex items-center gap-2"
                    disabled={!activeToolCode || !sourceImage}
                  >
                    <Sparkles className="w-4 h-4" />
                    {tr('步骤 5: 开始修复', 'Step 5: Start Repair')}
                  </button>
                </div>
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
                onCancel={() => setPhase('setup')}
              />
            </div>
          )}

          {phase === 'result' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">{tr('步骤 3: 查看结果', 'Step 3: View Results')}</h2>
                <button
                  onClick={() => setPhase('setup')}
                  className="px-4 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
                >
                  {tr('调整参数', 'Adjust Params')}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((item, idx) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <img src={item.imageUrl} alt={`smart-repair-${idx}`} className="w-full rounded-lg object-cover" />
                    <button
                      onClick={() => handleDownload(item, idx)}
                      className="mt-3 w-full px-3 py-2 text-sm bg-zinc-800 text-zinc-200 rounded-lg hover:bg-zinc-700 transition inline-flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      {tr('下载', 'Download')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
