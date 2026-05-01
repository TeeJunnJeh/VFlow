import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronsDown, Download, Sparkles, Loader2, Minus, Plus, X, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { AspectRatioPicker, ErrorDialog, type ErrorInfo, ImageUploader, SMART_REPAIR_RATIOS, ratioDescriptorsForLanguage } from '../../Common';
import ResizableSplitter from '../../../common/ResizableSplitter';
import { downloadBlob, productImagesApi } from '../../../../services/productImagesApi';
import { billingApi } from '../../../../services/billing';
import type { ProductImageResult, SmartRepairModel, SmartRepairParams, SmartRepairSubpage, SmartRepairToolCode } from '../../../../types/productImages';
import { notifyImageHistoryUpdated, readImageHistoryByFeature, refreshImageHistory, subscribeImageHistory, type ImageHistoryItem } from '../../../../utils/imageHistory';
import { extractLoadingThemeFromSources, getDefaultLoadingTheme, type LoadingTheme } from '../../../../utils/loadingTheme';
import { useRequireAuth } from '../../../../utils/useRequireAuth';
import { formatCreditAmount, roundCreditTenths } from '../../../../utils/credits';

type RepairTaskStatus = 'processing' | 'succeeded' | 'failed';

interface RepairTaskSettingsSnapshot {
  prompt: string;
  aspectRatio: SmartRepairParams['aspectRatio'];
  strength: SmartRepairParams['strength'];
  outputCount: SmartRepairParams['outputCount'];
  subpage: SmartRepairSubpage;
  toolCode: SmartRepairToolCode;
  model?: SmartRepairModel;
}

interface RepairTask {
  localId: string;
  requestId: string;
  historyRecordId: string;
  status: RepairTaskStatus;
  outputs: ProductImageResult[];
  error: string;
  settings: RepairTaskSettingsSnapshot;
  submittedAt: number;
}

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 120; // 1.5s × 120 ≈ 3 minutes ceiling

const SMART_REPAIR_COMBINED_MIN_WIDTH = 560;
const SMART_REPAIR_COMBINED_MAX_WIDTH = 1080;
const SMART_REPAIR_RIGHT_MIN_WIDTH = 280;
// combined column = old (left + middle), right column stays the result panel.
const SMART_REPAIR_PANEL_RATIOS = { combined: 1.45, right: 0.55 } as const;
const SMART_REPAIR_TOOLS_COLLAPSED_KEY = 'vflow.smart_repair.tools_collapsed';
const SMART_REPAIR_PROMPT_SOFT_MAX = 1000;
const SMART_REPAIR_OUTPUT_COUNT_MIN = 1;
const SMART_REPAIR_OUTPUT_COUNT_MAX = 4;

interface SmartRepairModelOption {
  value: SmartRepairModel;
  labelZh: string;
  labelEn: string;
}

const SMART_REPAIR_MODEL_OPTIONS: SmartRepairModelOption[] = [
  { value: 'flux-2-pro', labelZh: 'Flux 2 Pro · 通用推荐', labelEn: 'Flux 2 Pro · Recommended' },
  { value: 'flux-2-max', labelZh: 'Flux 2 Max · 最高质量', labelEn: 'Flux 2 Max · Best quality' },
  { value: 'flux-2-flex', labelZh: 'Flux 2 Flex · 快速', labelEn: 'Flux 2 Flex · Fast' },
  { value: 'flux-2-dev', labelZh: 'Flux 2 Dev · 开发版', labelEn: 'Flux 2 Dev · Beta' },
];

const generateLocalId = () => `sr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  suggestionsZh: string[];
  suggestionsEn: string[];
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
      suggestionsZh: ['换成真人模特', '保持服装版型', '保留面料纹理', '保留颜色与图案', '商业拍摄质感'],
      suggestionsEn: ['Real human model', 'Keep garment fit', 'Preserve fabric texture', 'Preserve colors and patterns', 'Commercial photography'],
    },
    {
      code: 'anime_ip',
      titleZh: '卡通插画',
      titleEn: 'Anime IP',
      descZh: '转换为二次元插画风格角色。',
      descEn: 'Transform into anime-style illustration fashion character.',
      promptZh: '将人物与服装转换为二次元插画风格，保持服装结构和识别特征，线条干净、色彩统一、角色风格明确。',
      promptEn: 'Convert the person and garment into anime illustration style, preserving outfit structure, brand elements and key design features. Use clean linework, stylized anime coloring and proportions appropriate for the character design.',
      suggestionsZh: ['二次元插画风', '保持服装结构', '线条干净', '色彩鲜明', '角色风格化'],
      suggestionsEn: ['Anime illustration style', 'Keep outfit structure', 'Clean linework', 'Vibrant colors', 'Stylized character'],
    },
    {
      code: 'fashion_3d_showcase',
      titleZh: '3D服装',
      titleEn: '3D Garment Showcase',
      descZh: '将平面服装图转为立体展示效果。',
      descEn: 'Transform flat garment photo into 3D volumetric showcase.',
      promptZh: '将平面的服装图片立体化，增强褶皱体积感、材质反射和立体轮廓，保持真实摄影观感，不要生成纯3D建模渲染风。',
      promptEn: 'Transform the flat garment image into a 3D-volumetric display by enhancing folds, fabric volume, material reflections, and dimensional contours, making it appear more lifelike and dynamic.',
      suggestionsZh: ['立体展示效果', '增强褶皱体积', '突出材质反射', '保持真实摄影感', '避免建模渲染'],
      suggestionsEn: ['3D volumetric look', 'Enhance fold volume', 'Boost material reflection', 'Photographic realism', 'Avoid CG render style'],
    },
    {
      code: 'flat_lay_with_accessories',
      titleZh: '服装平铺',
      titleEn: 'Flat Lay With Accessories',
      descZh: '自动搭配配饰生成美观平铺图。',
      descEn: 'Generate styled flat lay with matching complementary accessories.',
      promptZh: '将服装重排为整洁的平铺构图，并自动补充匹配配饰，保持品牌调性、光线一致和电商级画面干净度。',
      promptEn: 'Recompose the garment into a clean, styled flat lay with complementary accessories selected to match the brand and style. Maintain consistent lighting and premium e-commerce composition.',
      suggestionsZh: ['整洁平铺构图', '搭配匹配配饰', '保持品牌调性', '光线统一', '电商级干净'],
      suggestionsEn: ['Clean flat lay', 'Match accessories', 'Keep brand tone', 'Consistent lighting', 'E-commerce clean'],
    },
    {
      code: 'body_reshape',
      titleZh: '改身材',
      titleEn: 'Body Reshape',
      descZh: '按用户要求调节模特高矮胖瘦，保持穿着自然。',
      descEn: 'Adjust model height and body size as requested while keeping wearability natural.',
      promptZh: '根据用户要求精确调整模特体型（高/矮、偏瘦/标准/偏胖等），可按指令改变肩宽、腰围、腿长等比例；重点是实现用户指定体型，而不是自动改成“更合适”的体型。保持人体结构合理，服装版型、贴合关系与细节不丢失。',
      promptEn: 'Precisely adjust the model body based on user-defined target shape (taller/shorter, slimmer/standard/plus-size), including controllable proportions such as shoulder width, waist size, and leg length. Follow the requested body type explicitly instead of auto-optimizing to a generic fit. Keep anatomy plausible and preserve garment fit, silhouette, and details.',
      suggestionsZh: ['更高一些', '更瘦一些', '加宽肩', '收腰', '加长腿', '保持服装贴合'],
      suggestionsEn: ['Make taller', 'Make slimmer', 'Wider shoulders', 'Smaller waist', 'Longer legs', 'Keep garment fit'],
    },
    {
      code: 'accessory_try_on',
      titleZh: '搭配上身',
      titleEn: 'Accessory Try-On',
      descZh: '基于服装/配饰图生成合适模特并完成上身穿戴。',
      descEn: 'Generate a suitable model and dress them with provided clothing and accessories.',
      promptZh: '输入通常是服装与配饰图片（如平铺图）。请先生成与服装风格匹配的合适模特，再让该模特完整穿戴对应服装与配饰；确保穿戴位置正确，光影、遮挡、材质和尺度一致，输出真实商业穿搭效果。',
      promptEn: 'The input is typically clothing and accessory images (such as flat-lay references). First generate a suitable model that matches the outfit style, then dress the model with the provided clothing and accessories as a complete look. Ensure correct placement, realistic occlusion, consistent lighting/materials/scale, and produce a commercial-quality try-on result.',
      suggestionsZh: ['生成合适模特', '完整穿戴', '位置准确', '光影一致', '商业穿搭效果'],
      suggestionsEn: ['Generate matching model', 'Complete outfit fit', 'Correct placement', 'Consistent lighting', 'Commercial try-on'],
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
      suggestionsZh: ['修复划痕', '修复凹陷', '修复破损', '保留品牌标识', '保持产品形态'],
      suggestionsEn: ['Fix scratches', 'Fix dents', 'Fix damage', 'Keep branding', 'Keep shape'],
    },
    {
      code: 'background_replace',
      titleZh: '背景替换',
      titleEn: 'Background Replace',
      descZh: '在不改主体的前提下替换背景。',
      descEn: 'Replace background while preserving the subject.',
      promptZh: '保留商品主体不变，替换为干净专业的电商背景，保证边缘自然、光线方向与阴影关系一致。',
      promptEn: 'Keep the product untouched and replace the background with a cleaner, more professional e-commerce background. Maintain clean product edges, natural seamless boundary, and consistent lighting and shadow on the product.',
      suggestionsZh: ['干净电商背景', '保持主体不变', '边缘自然', '光线一致', '阴影自然'],
      suggestionsEn: ['Clean e-commerce backdrop', 'Keep subject', 'Natural edges', 'Consistent lighting', 'Natural shadow'],
    },
    {
      code: 'stain_remove',
      titleZh: '去污去杂',
      titleEn: 'Stain Removal',
      descZh: '去除污点、水印和多余元素。',
      descEn: 'Remove stains, marks, and unwanted artifacts.',
      promptZh: '清理产品上的污点、水印、指纹、灰尘等杂质，保留原有纹理、高光反射和产品形体，不改变材质观感。',
      promptEn: 'Clean visible stains, watermarks, fingerprints, dust, water spots, and unwanted artifacts from the product. Preserve all original material textures, highlights, reflections, brand markings, and product geometry perfectly.',
      suggestionsZh: ['去除污点', '去除水印', '去除指纹', '保留材质纹理', '保留高光反射'],
      suggestionsEn: ['Remove stains', 'Remove watermarks', 'Remove fingerprints', 'Keep texture', 'Keep highlights'],
    },
    {
      code: 'detail_enhance',
      titleZh: '细节增强',
      titleEn: 'Detail Enhance',
      descZh: '提升产品细节清晰度和质感。',
      descEn: 'Boost product detail sharpness and texture quality.',
      promptZh: '增强产品细部纹理、缝线、印花等细节的清晰度和质感，提升材质表现力，但避免过度锐化和噪点，输出高质感电商图。',
      promptEn: 'Enhance the sharpness and texture details of seams, prints, material surfaces and micro details while avoiding over-sharpening, producing premium e-commerce visuals.',
      suggestionsZh: ['提升清晰度', '增强缝线纹理', '突出材质', '避免过度锐化', '高质感电商图'],
      suggestionsEn: ['Sharpen details', 'Enhance stitching', 'Highlight material', 'Avoid over-sharpening', 'Premium e-commerce'],
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
      suggestionsZh: ['修复褪色', '提升清晰度', '修复折痕', '修复污点', '保持人物特征'],
      suggestionsEn: ['Restore color', 'Sharpen', 'Fix creases', 'Remove spots', 'Keep features'],
    },
    {
      code: 'logo_cleanup',
      titleZh: 'Logo清理',
      titleEn: 'Logo Cleanup',
      descZh: '去除冲突标识并保留画面完整性。',
      descEn: 'Remove conflicting logos while preserving integrity.',
      promptZh: '清理图片中的冲突Logo、水印和杂乱文字，并根据周边内容自然补全，保持画面构图、光影和质感连续。',
      promptEn: 'Remove conflicting logos, watermarks, and unwanted text while seamlessly filling removed areas based on surrounding image context. Maintain overall image composition, lighting continuity and visual flow.',
      suggestionsZh: ['去除 Logo', '去除水印', '自然补全', '保持构图', '光影连续'],
      suggestionsEn: ['Remove logo', 'Remove watermark', 'Natural inpaint', 'Keep composition', 'Continuous lighting'],
    },
    {
      code: 'text_replace',
      titleZh: '文案替换',
      titleEn: 'Text Replace',
      descZh: '替换图中文字并保持设计风格。',
      descEn: 'Replace text while keeping visual design style.',
      promptZh: '替换图片中的文案内容，保持字体风格、字重、排版节奏和整体设计语言一致。',
      promptEn: 'Replace the text content in the image while keeping the original typography style, font family, layout rhythm, spacing and overall design language intact.',
      suggestionsZh: ['替换文案', '保持字体', '保持字号', '保持排版', '保持设计风格'],
      suggestionsEn: ['Replace text', 'Keep font', 'Keep font size', 'Keep layout', 'Keep design style'],
    },
    {
      code: 'custom_retouch',
      titleZh: '通用修图',
      titleEn: 'Custom Retouch',
      descZh: '自定义复杂修图任务。',
      descEn: 'Handle custom and complex retouch tasks.',
      promptZh: '根据我给出的修图要求完成目标，保持主体一致、画面自然和商业可用质量。',
      promptEn: 'Complete the custom retouch task according to my specific request while preserving subject consistency and maintaining natural, professional image quality throughout.',
      suggestionsZh: ['精细修整', '保持主体一致', '画面自然', '商业可用质量', '保留细节'],
      suggestionsEn: ['Detailed retouch', 'Keep subject', 'Natural look', 'Commercial quality', 'Preserve details'],
    },
  ],
};

export const SmartRepairView: React.FC<SmartRepairViewProps> = ({ onBack, projectId, embedded = false }) => {
  const { language, t } = useLanguage();
  const { requireAuth } = useRequireAuth();
  const isZh = language === 'zh';

  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string>('');
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string>('');
  const [error, setError] = useState<ErrorInfo | null>(null);

  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<SmartRepairParams['aspectRatio']>('1:1');
  const [strength, setStrength] = useState<SmartRepairParams['strength']>('medium');
  const [outputCount, setOutputCount] = useState<SmartRepairParams['outputCount']>(1);
  const [selectedModel, setSelectedModel] = useState<SmartRepairModel>('flux-2-pro');
  const [activeSubpage, setActiveSubpage] = useState<SmartRepairSubpage>('fashion_model');
  const [activeToolCode, setActiveToolCode] = useState<SmartRepairToolCode | null>(null);
  const [historyItems, setHistoryItems] = useState<SmartRepairHistoryEntry[]>([]);
  // loadingTheme/backgroundSrc kept for potential reuse but no longer drives a full-page overlay
  const [, setLoadingTheme] = useState<LoadingTheme>(getDefaultLoadingTheme());
  const [, setLoadingBackgroundSrc] = useState<string>('');
  const [smartRepairModelRate, setSmartRepairModelRate] = useState<number>(0);
  const [repairTasks, setRepairTasks] = useState<RepairTask[]>([]);
  const pollAbortRef = useRef<Set<string>>(new Set());
  const pollStartedRef = useRef<Set<string>>(new Set());
  const isSubmittingRef = useRef<boolean>(false);

  // Two-column layout state: combined edit column + right preview/history column
  const containerRef = useRef<HTMLDivElement | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [combinedWidth, setCombinedWidth] = useState<number>(720);
  const [rightPanel, setRightPanel] = useState<'preview' | 'history'>('preview');
  const [isToolsCollapsed, setIsToolsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SMART_REPAIR_TOOLS_COLLAPSED_KEY) === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SMART_REPAIR_TOOLS_COLLAPSED_KEY, isToolsCollapsed ? '1' : '0');
  }, [isToolsCollapsed]);

  const computeDefaultPanelWidths = useCallback((containerWidth: number) => {
    const splitterWidth = 6;
    const totalRatio = SMART_REPAIR_PANEL_RATIOS.combined + SMART_REPAIR_PANEL_RATIOS.right;
    const usable = Math.max(
      containerWidth - splitterWidth,
      SMART_REPAIR_COMBINED_MIN_WIDTH + SMART_REPAIR_RIGHT_MIN_WIDTH,
    );
    const combinedRaw = usable * (SMART_REPAIR_PANEL_RATIOS.combined / totalRatio);
    const combined = Math.min(
      SMART_REPAIR_COMBINED_MAX_WIDTH,
      Math.max(SMART_REPAIR_COMBINED_MIN_WIDTH, combinedRaw),
    );
    return { combined };
  }, []);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) {
        const { combined } = computeDefaultPanelWidths(w);
        setCombinedWidth(combined);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [computeDefaultPanelWidths, activeToolCode]);

  useEffect(() => {
    if (repairTasks.length > 0) setRightPanel('preview');
  }, [repairTasks.length]);

  const appendPromptSuggestion = useCallback(
    (phrase: string) => {
      if (!phrase) return;
      setPrompt((prev) => {
        const trimmed = prev.trim();
        if (!trimmed) return phrase;
        if (trimmed.includes(phrase)) return prev;
        const sep = isZh ? '、' : ', ';
        const needsSpace = !/[\s,.;:、，。；：]$/.test(trimmed);
        return `${trimmed}${needsSpace ? sep : ' '}${phrase}`;
      });
      // refocus textarea so user sees the cursor at the end
      window.setTimeout(() => {
        const el = promptTextareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 0);
    },
    [isZh],
  );

  const subpageOptions: Array<{ key: SmartRepairSubpage; label: string }> = [
    { key: 'fashion_model', label: t.sr_subpage_fashion_model_name },
    { key: 'product_object', label: t.sr_subpage_product_object_name },
    { key: 'other', label: t.sr_subpage_other_name },
  ];

  const currentTools = TOOL_MATRIX[activeSubpage];
  const activeTool = activeToolCode ? currentTools.find((tool) => tool.code === activeToolCode) : undefined;

  const editablePromptTokens = useMemo(
    () => (
      isZh
        ? ['{{主体}}', '{{目标效果}}', '{{背景/场景}}', '{{风格/质感}}', '{{必须保留元素}}']
        : ['{{Subject}}', '{{Target effect}}', '{{Background/scene}}', '{{Style/texture}}', '{{Must keep details}}']
    ),
    [isZh]
  );

  const buildPromptTemplate = useCallback((tool: SmartRepairToolDef) => {
    if (isZh) {
      return [
        tool.promptZh,
        '',
        '【可编辑字段（建议按需替换）】',
        `- 主体：${editablePromptTokens[0]}`,
        `- 目标效果：${editablePromptTokens[1]}`,
        `- 背景/场景：${editablePromptTokens[2]}`,
        `- 风格/质感：${editablePromptTokens[3]}`,
        `- 必须保留元素：${editablePromptTokens[4]}`,
        '',
        '【输出要求】保持主体一致、边缘自然、光影统一、无明显修图痕迹。',
      ].join('\n');
    }

    return [
      tool.promptEn,
      '',
      '[Editable fields - update based on your needs]',
      `- Subject: ${editablePromptTokens[0]}`,
      `- Target effect: ${editablePromptTokens[1]}`,
      `- Background/scene: ${editablePromptTokens[2]}`,
      `- Style/texture: ${editablePromptTokens[3]}`,
      `- Must keep details: ${editablePromptTokens[4]}`,
      '',
      '[Output requirements] Keep subject identity, realistic edges, consistent lighting, and no obvious retouch artifacts.',
    ].join('\n');
  }, [editablePromptTokens, isZh]);

  const getSamplePath = (code: SmartRepairToolCode, type: 'before' | 'after') =>
    `/smart-repair-examples/${code}_${type}.jpg`;

  const refreshHistory = useCallback(async () => {
    await refreshImageHistory();
    const nextItems = readImageHistoryByFeature('smart_repair')
      .map((item) => mapImageHistoryToSmartRepairEntry(item))
      .filter(Boolean) as SmartRepairHistoryEntry[];
    setHistoryItems(nextItems);
  }, []);

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const startPolling = useCallback(
    async (requestId: string) => {
      if (!requestId || pollStartedRef.current.has(requestId)) return;
      pollStartedRef.current.add(requestId);

      try {
        for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
          if (pollAbortRef.current.has(requestId)) return;
          try {
            const result = await productImagesApi.getSmartRepairResult(requestId);
            if (result.status === 'succeeded') {
              const url = result.imageUrl || result.outputs[0] || '';
              const product: ProductImageResult = {
                id: `smart-repair-${requestId}`,
                imageUrl: url,
                downloadUrl: url,
                format: 'jpg',
              };
              setRepairTasks((prev) =>
                prev.map((t) =>
                  t.requestId === requestId
                    ? { ...t, status: 'succeeded', outputs: [product], error: '' }
                    : t,
                ),
              );
              notifyImageHistoryUpdated();
              void refreshHistory();
              return;
            }
            if (result.status === 'failed') {
              setRepairTasks((prev) =>
                prev.map((t) =>
                  t.requestId === requestId
                    ? { ...t, status: 'failed', outputs: [], error: result.error || (isZh ? '生成失败' : 'Generation failed') }
                    : t,
                ),
              );
              notifyImageHistoryUpdated();
              void refreshHistory();
              return;
            }
            // status: 'created' | 'processing' → keep waiting
          } catch (err) {
            // network or transient error: keep retrying until POLL_MAX_ATTEMPTS exhausted
            console.warn('[smart-repair] poll error', err);
          }
          await sleep(POLL_INTERVAL_MS);
        }
        // hit the cap → mark failed
        setRepairTasks((prev) =>
          prev.map((t) =>
            t.requestId === requestId && t.status === 'processing'
              ? { ...t, status: 'failed', error: isZh ? '生成超时，请稍后重试' : 'Generation timed out, please retry' }
              : t,
          ),
        );
      } finally {
        pollStartedRef.current.delete(requestId);
      }
    },
    [isZh, refreshHistory],
  );

  const cancelTaskCard = (localId: string) => {
    setRepairTasks((prev) => {
      const target = prev.find((t) => t.localId === localId);
      if (target) pollAbortRef.current.add(target.requestId);
      return prev.filter((t) => t.localId !== localId);
    });
  };

  const dismissCard = (localId: string) => {
    setRepairTasks((prev) => prev.filter((t) => t.localId !== localId));
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
    if (currentTools.length === 0) return;
    const stillExists = activeToolCode && currentTools.some((tool) => tool.code === activeToolCode);
    if (stillExists) return;
    setActiveToolCode(currentTools[0].code);
    setPrompt(buildPromptTemplate(currentTools[0]));
  }, [activeToolCode, buildPromptTemplate, currentTools]);

  useEffect(() => {
    void refreshHistory();
    return subscribeImageHistory(() => {
      void refreshHistory();
    });
  }, [refreshHistory]);

  // Mount-time hydration: pull any PROCESSING smart_repair tasks from the
  // backend and resume polling. This keeps user-perceived state consistent
  // across F5 and tab switches inside ProductImagesView.
  useEffect(() => {
    let alive = true;
    void productImagesApi.listSmartRepairPending()
      .then((items) => {
        if (!alive || items.length === 0) return;
        const hydrated: RepairTask[] = items.map((item) => ({
          localId: generateLocalId(),
          requestId: item.requestId,
          historyRecordId: item.historyRecordId,
          status: 'processing',
          outputs: [],
          error: '',
          settings: {
            prompt: item.settings.prompt || '',
            aspectRatio: (item.settings.aspectRatio as SmartRepairParams['aspectRatio']) || '1:1',
            strength: (item.settings.strength as SmartRepairParams['strength']) || 'medium',
            outputCount: (item.settings.outputCount as SmartRepairParams['outputCount']) || 1,
            subpage: (item.settings.subpage as SmartRepairSubpage) || 'product_object',
            toolCode: (item.settings.toolCode as SmartRepairToolCode) || 'custom_retouch',
            model: (item.settings.model as SmartRepairModel) || undefined,
          },
          submittedAt: item.submittedAt,
        }));
        setRepairTasks((prev) => {
          // De-dup by requestId in case the user already has cards for the same job
          const existingIds = new Set(prev.map((t) => t.requestId));
          return [...hydrated.filter((t) => !existingIds.has(t.requestId)), ...prev];
        });
        hydrated.forEach((card) => {
          void startPolling(card.requestId);
        });
      })
      .catch(() => {
        // Hydration failure is silent — user can still kick off new tasks.
      });
    return () => {
      alive = false;
    };
  }, [startPolling]);

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
    () => Math.max(0, roundCreditTenths((Number.isFinite(smartRepairModelRate) ? smartRepairModelRate : 0) * Math.max(1, Number(outputCount || 1)))),
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
    if (!requireAuth()) return;
    if (isSubmittingRef.current) return;
    if (!activeSubpage || !activeToolCode) {
      setError({
        code: 'NO_FUNCTION',
        message: t.sr_no_function_msg,
        severity: 'warning',
      });
      return;
    }

    if (!sourceImage) {
      setError({
        code: 'NO_SOURCE_IMAGE',
        message: t.sr_no_source_msg,
        severity: 'warning',
      });
      return;
    }

    if (!prompt.trim()) {
      setError({
        code: 'NO_PROMPT',
        message: t.sr_no_prompt_msg,
        severity: 'warning',
      });
      return;
    }

    const settingsSnapshot: RepairTaskSettingsSnapshot = {
      prompt,
      aspectRatio,
      strength,
      outputCount,
      subpage: activeSubpage,
      toolCode: activeToolCode,
      model: selectedModel,
    };

    try {
      isSubmittingRef.current = true;
      setError(null);
      const submission = await productImagesApi.submitSmartRepair(
        sourceImage,
        {
          prompt,
          aspectRatio,
          strength,
          outputCount,
          subpage: activeSubpage,
          toolCode: activeToolCode,
          model: selectedModel,
        },
        {
          projectId,
          referenceImage: referenceImage || undefined,
        },
      );

      const submittedAt = Date.now();
      const newCards: RepairTask[] = submission.requests.map((req) => ({
        localId: generateLocalId(),
        requestId: req.requestId,
        historyRecordId: submission.historyRecordId,
        status: 'processing',
        outputs: [],
        error: '',
        settings: settingsSnapshot,
        submittedAt,
      }));

      setRepairTasks((prev) => [...newCards, ...prev]);
      newCards.forEach((card) => {
        void startPolling(card.requestId);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t.ff_unknown_error;
      setError({
        code: 'SMART_REPAIR_FAILED',
        message,
        severity: 'error',
        suggestion: t.sr_retry_suggestion,
      });
    } finally {
      isSubmittingRef.current = false;
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

    // surface the historical result as a synthetic succeeded card so the user
    // can compare it with newly-running tasks in the same panel.
    const synthetic: RepairTask = {
      localId: generateLocalId(),
      requestId: `history:${item.id}`,
      historyRecordId: item.id,
      status: 'succeeded',
      outputs: item.outputImages,
      error: '',
      settings: {
        prompt: item.settings?.prompt || '',
        aspectRatio: item.settings?.aspectRatio || '1:1',
        strength: item.settings?.strength || 'medium',
        outputCount: item.settings?.outputCount || 1,
        subpage: item.settings?.subpage || activeSubpage,
        toolCode: item.settings?.toolCode || activeToolCode || 'custom_retouch',
      },
      submittedAt: Date.parse(item.createdAt) || Date.now(),
    };
    setRepairTasks((prev) => [synthetic, ...prev]);
  };

  const retryFailedCard = (task: RepairTask) => {
    // Apply settings back to the form and remove the failed card; user can hit submit again
    setPrompt(task.settings.prompt);
    setAspectRatio(task.settings.aspectRatio);
    setStrength(task.settings.strength);
    setOutputCount(task.settings.outputCount);
    setActiveSubpage(task.settings.subpage);
    setActiveToolCode(task.settings.toolCode);
    if (task.settings.model) setSelectedModel(task.settings.model);
    dismissCard(task.localId);
  };

  const handleDownload = async (result: ProductImageResult, index: number) => {
    try {
      const blob = await productImagesApi.downloadImageByUrl(result.imageUrl);
      downloadBlob(blob, `smart_repair_${index + 1}.png`);
    } catch {
      setError({
        code: 'DOWNLOAD_FAILED',
        message: t.ff_error_download_failed,
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
                title={t.ff_back}
              >
                <ChevronLeft className="w-6 h-6 text-zinc-400" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                {t.sr_title}
              </h1>
              <p className="text-zinc-400 text-sm">
                {t.sr_subtitle}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 md:p-6 shadow-2xl">
          {/* form area is always visible; submitting starts a new task card without locking the page */}
          <div className="space-y-4">
              <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {subpageOptions.map((item) => {
                    const selected = activeSubpage === item.key;
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
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition border ${
                          selected
                            ? 'border-orange-500/50 bg-orange-500/10 text-orange-200'
                            : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tools showcase: FirstFrame-style horizontal scroll row */}
              <div className="shrink-0">
                <div className="mb-1 flex items-center gap-2">
                  <div className="text-sm font-bold text-zinc-200">{isZh ? '工具示例' : 'Tool Examples'}</div>
                  <button
                    type="button"
                    onClick={() => setIsToolsCollapsed((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-500 transition hover:text-zinc-300"
                    aria-label={isToolsCollapsed ? (isZh ? '展开' : 'Expand') : (isZh ? '折叠' : 'Collapse')}
                  >
                    <span>{isToolsCollapsed ? (isZh ? '展开' : 'Expand') : (isZh ? '折叠' : 'Collapse')}</span>
                    <ChevronsDown
                      className={`w-4 h-4 transition-transform duration-200 ${isToolsCollapsed ? 'rotate-0' : 'rotate-180'}`}
                    />
                  </button>
                </div>
                <div
                  className={[
                    'grid overflow-hidden transition-[grid-template-rows,opacity] duration-300',
                    'ease-[cubic-bezier(0.22,1,0.36,1)]',
                    isToolsCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
                  ].join(' ')}
                  aria-hidden={isToolsCollapsed}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="flex gap-3 overflow-x-auto pt-2 pb-2 custom-scroll">
                      {currentTools.map((tool) => {
                        const selected = !!activeToolCode && tool.code === activeToolCode;
                        return (
                          <button
                            key={tool.code}
                            type="button"
                            onClick={() => {
                              setActiveToolCode(tool.code);
                              setPrompt(buildPromptTemplate(tool));
                            }}
                            className={`group relative aspect-[4/3] w-[247px] shrink-0 overflow-hidden rounded-2xl border bg-black/20 text-left transition duration-300 hover:-translate-y-1 ${
                              selected
                                ? 'border-orange-400/70 ring-2 ring-orange-400/70'
                                : 'border-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="relative h-full w-full">
                              <div className="absolute inset-0 grid grid-cols-2">
                                <div className="relative h-full w-full overflow-hidden bg-black/40">
                                  <img
                                    src={getSamplePath(tool.code, 'before')}
                                    alt={isZh ? `${tool.titleZh} 处理前` : `${tool.titleEn} before`}
                                    className="h-full w-full object-cover opacity-85 transition duration-300 group-hover:scale-[1.04] group-hover:brightness-110"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src =
                                        'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2275%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%2275%22/%3E%3C/svg%3E';
                                    }}
                                  />
                                </div>
                                <div className="relative h-full w-full overflow-hidden bg-black/40">
                                  <img
                                    src={getSamplePath(tool.code, 'after')}
                                    alt={isZh ? `${tool.titleZh} 处理后` : `${tool.titleEn} after`}
                                    className="h-full w-full object-cover opacity-95 transition duration-300 group-hover:scale-[1.04] group-hover:brightness-110"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src =
                                        'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2275%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%2275%22/%3E%3C/svg%3E';
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                              <div className="absolute inset-x-4 bottom-3 pr-12">
                                <div className="text-sm font-extrabold text-white/95">
                                  {isZh ? tool.titleZh : tool.titleEn}
                                </div>
                                <div className="mt-0.5 text-[11px] text-white/70 line-clamp-1">
                                  {isZh ? tool.descZh : tool.descEn}
                                </div>
                              </div>
                              <span className="absolute right-3 bottom-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-transparent text-white transition duration-300 group-hover:scale-110">
                                <ArrowRight className="h-3.5 w-3.5 !text-white" style={{ color: '#fff' }} />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {!activeToolCode && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-zinc-400">
                  {t.sr_tip_select_function}
                </div>
              )}

              {activeToolCode && (
                <div
                  ref={containerRef}
                  className="relative flex items-stretch overflow-hidden min-h-[600px]"
                >
                  {/* Combined column: uploads (left sub-area) + prompt (right sub-area) + bottom gen-settings */}
                  <section
                    className="mr-3 flex h-full min-h-0 shrink-0 flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-[width] duration-100"
                    style={{ width: `${combinedWidth}px`, minWidth: `${SMART_REPAIR_COMBINED_MIN_WIDTH}px` }}
                  >
                    <div className="mb-4 shrink-0">
                      <h2 className="text-lg font-semibold text-white">{isZh ? '编辑需求' : 'Edit Requirements'}</h2>
                    </div>

                    {/* Top split: upload sub-area | prompt sub-area */}
                    <div className="flex min-h-0 flex-1 gap-4">
                      <div className="w-[220px] shrink-0 overflow-y-auto pr-1 space-y-4">
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="mb-2 text-sm font-semibold text-zinc-200">
                            {isZh ? '原图（必传）' : 'Source Image (Required)'}
                          </div>
                          {!sourceImage ? (
                            <ImageUploader
                              maxFiles={1}
                              size="compact"
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
                              <img src={sourcePreviewUrl} alt="source" className="w-full rounded-lg border border-white/10 object-cover" style={{ maxHeight: '170px' }} />
                              <button
                                onClick={() => setSourceImage(null)}
                                className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline"
                              >
                                {t.sr_change_image}
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="mb-2 text-sm font-semibold text-zinc-200">{t.sr_reference_optional}</div>
                          <ImageUploader
                            maxFiles={1}
                            size="compact"
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
                              <img src={referencePreviewUrl} alt="reference" className="w-full rounded-lg border border-white/10 object-cover" style={{ maxHeight: '170px' }} />
                              <button
                                onClick={() => setReferenceImage(null)}
                                className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline"
                              >
                                {t.sr_remove_reference}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="mb-2 flex shrink-0 items-baseline justify-between gap-3">
                          <div className="flex items-baseline gap-2">
                            <h3 className="text-sm font-semibold text-zinc-100">{isZh ? '你想怎么改？' : 'What do you want to change?'}</h3>
                            {activeTool && (
                              <span className="text-[11px] text-zinc-500">
                                {isZh ? '当前：' : 'Tool: '}
                                {isZh ? activeTool.titleZh : activeTool.titleEn}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-zinc-500">
                            {isZh ? '直接用自然语言描述你想要的修改效果' : 'Describe the desired result in natural language'}
                          </span>
                        </div>

                        {activeTool && (
                          <div className="mb-2 flex shrink-0 flex-wrap gap-2">
                            {(isZh ? activeTool.suggestionsZh : activeTool.suggestionsEn).map((phrase) => {
                              const inserted = prompt.includes(phrase);
                              return (
                                <button
                                  key={phrase}
                                  type="button"
                                  onClick={() => appendPromptSuggestion(phrase)}
                                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                    inserted
                                      ? 'border-orange-500/50 bg-orange-500/15 text-orange-200'
                                      : 'border-white/10 bg-black/20 text-zinc-300 hover:border-orange-400/40 hover:text-orange-200'
                                  }`}
                                >
                                  {phrase}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className="relative flex-1 min-h-[360px]">
                          <textarea
                            ref={promptTextareaRef}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="h-full w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 pb-7 text-sm text-zinc-100 outline-none focus:border-orange-400/50"
                            placeholder={t.sr_prompt_placeholder}
                          />
                          <div className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-zinc-500">
                            <span className={prompt.length > SMART_REPAIR_PROMPT_SOFT_MAX ? 'text-orange-300' : ''}>
                              {prompt.length}
                            </span>
                            /{SMART_REPAIR_PROMPT_SOFT_MAX}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom: gen settings + actions, spans full combined column */}
                    <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                        <div className="text-sm font-semibold text-zinc-200 shrink-0">
                          {isZh ? '生成设置' : 'Generation Settings'}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500 shrink-0">{isZh ? '模型' : 'Model'}</span>
                          <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value as SmartRepairModel)}
                            className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-zinc-200 focus:border-orange-400/50"
                          >
                            {SMART_REPAIR_MODEL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {isZh ? opt.labelZh : opt.labelEn}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500 shrink-0">{t.sr_aspect}</span>
                          <AspectRatioPicker
                            value={String(aspectRatio || '1:1')}
                            onChange={(next) => setAspectRatio(next as SmartRepairParams['aspectRatio'])}
                            primary={SMART_REPAIR_RATIOS.primary}
                            more={SMART_REPAIR_RATIOS.more}
                            labels={{
                              more: isZh ? '更多比例' : 'More ratios',
                              vertical: t.pi_gallery_ratio_group_vertical,
                              landscape: t.pi_gallery_ratio_group_landscape,
                            }}
                            descriptors={ratioDescriptorsForLanguage(language)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500 shrink-0">{t.sr_strength}</span>
                          <select
                            value={strength}
                            onChange={(e) => setStrength(e.target.value as SmartRepairParams['strength'])}
                            className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-zinc-200 focus:border-orange-400/50"
                          >
                            <option value="light">{t.sr_strength_light}</option>
                            <option value="medium">{t.sr_strength_medium}</option>
                            <option value="strong">{t.sr_strength_strong}</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500 shrink-0">{t.sr_count}</span>
                          <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-white/10 bg-black/20">
                            <button
                              type="button"
                              onClick={() =>
                                setOutputCount(
                                  (Math.max(SMART_REPAIR_OUTPUT_COUNT_MIN, Number(outputCount || 1) - 1) as SmartRepairParams['outputCount']),
                                )
                              }
                              disabled={Number(outputCount || 1) <= SMART_REPAIR_OUTPUT_COUNT_MIN}
                              className="px-2 text-zinc-400 hover:bg-white/5 hover:text-orange-300 transition disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label={isZh ? '减少' : 'Decrease'}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min={SMART_REPAIR_OUTPUT_COUNT_MIN}
                              max={SMART_REPAIR_OUTPUT_COUNT_MAX}
                              step={1}
                              value={outputCount}
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                if (!Number.isFinite(raw)) return;
                                const clamped = Math.min(
                                  SMART_REPAIR_OUTPUT_COUNT_MAX,
                                  Math.max(SMART_REPAIR_OUTPUT_COUNT_MIN, Math.round(raw)),
                                );
                                setOutputCount(clamped as SmartRepairParams['outputCount']);
                              }}
                              className="w-10 bg-transparent text-center text-sm text-zinc-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setOutputCount(
                                  (Math.min(SMART_REPAIR_OUTPUT_COUNT_MAX, Number(outputCount || 1) + 1) as SmartRepairParams['outputCount']),
                                )
                              }
                              disabled={Number(outputCount || 1) >= SMART_REPAIR_OUTPUT_COUNT_MAX}
                              className="px-2 text-zinc-400 hover:bg-white/5 hover:text-orange-300 transition disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label={isZh ? '增加' : 'Increase'}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <button
                          onClick={() => {
                            setSourceImage(null);
                            setReferenceImage(null);
                            if (activeTool) {
                              setPrompt(buildPromptTemplate(activeTool));
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {t.sr_clear_input}
                        </button>
                        <button
                          onClick={handleGenerate}
                          className="flex-1 px-4 py-2 text-sm font-semibold bg-orange-500 text-black rounded-lg hover:bg-orange-400 transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!sourceImage}
                        >
                          <Sparkles className="w-4 h-4" />
                          {isZh ? '立即生成' : 'Generate Now'}
                          {estimatedCost > 0 ? (
                            <span className="ml-1 text-[10px] font-semibold text-black/75 whitespace-nowrap">
                              {`-${formatCreditAmount(estimatedCost)} ${t.v_points}`}
                            </span>
                          ) : null}
                        </button>
                      </div>
                    </div>
                  </section>

                  <ResizableSplitter
                    position={combinedWidth}
                    minSize={SMART_REPAIR_COMBINED_MIN_WIDTH}
                    onResize={(next) => setCombinedWidth(Math.min(SMART_REPAIR_COMBINED_MAX_WIDTH, next))}
                    hitAreaSize={8}
                    lineThickness={2}
                  />

                  {/* Right column: preview / history tabs */}
                  <section
                    className="ml-3 flex h-full min-h-0 flex-1 flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5"
                    style={{ minWidth: `${SMART_REPAIR_RIGHT_MIN_WIDTH}px` }}
                  >
                    <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-white">{isZh ? '结果' : 'Results'}</h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRightPanel('preview')}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            rightPanel === 'preview'
                              ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                              : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                          }`}
                        >
                          {isZh ? '预览' : 'Preview'}
                          {repairTasks.length > 0 ? ` (${repairTasks.length})` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRightPanel('history')}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            rightPanel === 'history'
                              ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                              : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                          }`}
                        >
                          {isZh ? '历史' : 'History'}
                        </button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                      {rightPanel === 'preview' ? (
                        repairTasks.length === 0 ? (
                          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-500">
                            {isZh ? '暂无任务，提交后任务会出现在这里' : 'No active tasks. Submit one to see it here.'}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {repairTasks.map((task) => (
                              <div
                                key={task.localId}
                                className="rounded-xl border border-white/10 bg-black/20 overflow-hidden hover:border-orange-400/30 transition"
                              >
                                {task.status === 'processing' && (
                                  <div className="aspect-video flex items-center justify-center bg-black/40">
                                    <div className="flex flex-col items-center gap-2 text-zinc-300">
                                      <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                                      <div className="text-sm">{isZh ? '处理中…' : 'Processing…'}</div>
                                      <div className="text-[11px] text-zinc-500">
                                        {new Date(task.submittedAt).toLocaleTimeString()}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {task.status === 'succeeded' && task.outputs[0] && (
                                  <img
                                    src={task.outputs[0].imageUrl}
                                    alt={`smart-repair-${task.localId}`}
                                    className="w-full aspect-video object-cover"
                                  />
                                )}
                                {task.status === 'failed' && (
                                  <div className="aspect-video flex items-center justify-center bg-red-900/20 px-4">
                                    <div className="text-center">
                                      <div className="text-sm text-red-300 font-semibold mb-1">
                                        {isZh ? '生成失败' : 'Generation failed'}
                                      </div>
                                      <div className="text-xs text-red-200/70 line-clamp-3">{task.error || (isZh ? '未知错误' : 'Unknown error')}</div>
                                    </div>
                                  </div>
                                )}

                                <div className="p-3">
                                  <div className="mb-2 line-clamp-2 text-[11px] text-zinc-500">
                                    {task.settings.prompt}
                                  </div>
                                  {task.status === 'processing' && (
                                    <button
                                      onClick={() => cancelTaskCard(task.localId)}
                                      className="w-full px-3 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition inline-flex items-center justify-center gap-2"
                                    >
                                      <X className="w-4 h-4" />
                                      {isZh ? '隐藏卡片（任务后台继续）' : 'Hide card (task keeps running)'}
                                    </button>
                                  )}
                                  {task.status === 'succeeded' && task.outputs[0] && (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleDownload(task.outputs[0], 0)}
                                        className="flex-1 px-3 py-2 text-sm bg-orange-500 text-black font-semibold rounded-lg hover:bg-orange-400 transition inline-flex items-center justify-center gap-2"
                                      >
                                        <Download className="w-4 h-4" />
                                        {t.sr_download}
                                      </button>
                                      <button
                                        onClick={() => dismissCard(task.localId)}
                                        className="px-3 py-2 text-sm bg-white/10 text-zinc-300 rounded-lg hover:bg-white/20 transition"
                                        title={isZh ? '从任务卡列表隐藏（历史中保留）' : 'Hide from task list (still in history)'}
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                  {task.status === 'failed' && (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => retryFailedCard(task)}
                                        className="flex-1 px-3 py-2 text-sm bg-orange-500 text-black font-semibold rounded-lg hover:bg-orange-400 transition inline-flex items-center justify-center gap-2"
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                        {isZh ? '重试' : 'Retry'}
                                      </button>
                                      <button
                                        onClick={() => dismissCard(task.localId)}
                                        className="px-3 py-2 text-sm bg-white/10 text-zinc-300 rounded-lg hover:bg-white/20 transition"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : (
                        historyItems.length === 0 ? (
                          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
                            <p className="text-sm text-zinc-500">{t.sr_empty_history}</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                                    <div className="text-xs bg-zinc-800/50 text-zinc-300 px-2 py-1 rounded">{item.outputImages.length} {t.sr_images_unit}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => restoreHistoryItem(item)}
                                      className="flex-1 px-3 py-2 text-xs bg-white/10 text-zinc-200 rounded-lg hover:bg-orange-500/20 hover:text-orange-200 transition"
                                    >
                                      {t.sr_view}
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
                        )
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>

          {error && (
            <ErrorDialog
              isOpen={!!error}
              error={error}
              onClose={() => setError(null)}
              onRetry={() => setError(null)}
              showRetry={true}
            />
          )}
        </div>
      </div>
    </div>
  );
};
