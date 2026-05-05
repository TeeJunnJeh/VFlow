import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronsDown, Download, Sparkles, Loader2, Library, Minus, Plus, X, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { AspectRatioPicker, ErrorDialog, type ErrorInfo, ImageUploader, SMART_REPAIR_RATIOS, ratioDescriptorsForLanguage } from '../../Common';
import ResizableSplitter from '../../../common/ResizableSplitter';
import { downloadBlob, productImagesApi } from '../../../../services/productImagesApi';
import { billingApi } from '../../../../services/billing';
import { CreativeAssetPickerDialog } from '../../../creativeLab/CreativeAssetPickerDialog';
import type { Asset } from '../../../../services/assets';
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
const SMART_REPAIR_UPLOAD_COL_DEFAULT_WIDTH = 240;
const SMART_REPAIR_UPLOAD_COL_MIN_WIDTH = 180;
const SMART_REPAIR_UPLOAD_COL_MAX_WIDTH = 420;
const SMART_REPAIR_UPLOAD_COL_STORAGE_KEY = 'vflow.smart_repair.upload_col_width';
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

type SmartRepairImageSource =
  | { kind: 'upload'; file: File; previewUrl: string }
  | { kind: 'asset'; assetId: string; path: string; previewUrl: string; name: string };

type SmartRepairPickerTarget = 'source' | 'reference' | 'model';

interface SmartRepairViewProps {
  onBack?: () => void;
  projectId?: string;
  embedded?: boolean;
}

interface SmartRepairPreset {
  labelZh: string;
  labelEn: string;
  promptZh: string;
  promptEn: string;
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
  presets?: SmartRepairPreset[];
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
      presets: [
        {
          labelZh: '工作室模特',
          labelEn: 'Studio Model',
          promptZh:
            '将假人台或人台展示的服装自然迁移到一位真实的工作室模特身上，模特站姿端正、面向镜头、表情自然平和，置于干净的浅灰渐变工作室背景中。完整保留服装的版型、面料质感、颜色与图案细节；柔光摄影棚顶光为主、轻微阴影衬托轮廓；整体呈现专业商业拍摄质感，画面克制、无多余道具。',
          promptEn:
            "Replace the dress form or mannequin with a realistic studio model wearing the exact same garment. The model stands upright, facing camera with a calm natural expression, against a clean light-grey gradient seamless backdrop. Preserve the garment's exact fit, fabric texture, colors and patterns; use soft top-key studio lighting with subtle contour shadows. Deliver a clean, professional commercial product shot with no extra props.",
        },
        {
          labelZh: 'T 台模特',
          labelEn: 'Runway Model',
          promptZh:
            '将假人台展示的服装自然迁移到一位走在 T 台上的真实模特身上，模特处于行进中的动态姿势，腿部前后交替、肩部自然摆动，目光直视前方。背景是柔和虚化的 T 台灯光、远处观众席与品牌 logo 灯阵。光线带轻微暖色聚光、面部立体感强烈。完整保留服装的版型、面料垂感与图案细节；整体呈现高级时装周大秀质感。',
          promptEn:
            "Transfer the garment from the dress form onto a runway model in a confident walking pose — legs in mid-stride, shoulders naturally rotating, eyes locked forward. Background: softly blurred runway lights, distant audience silhouettes and brand-name spotlights. Lighting is warm directional spotlight with strong facial dimension. Preserve the garment's silhouette, fabric drape and pattern details exactly. Deliver a high-fashion runway-show aesthetic.",
        },
        {
          labelZh: '居家模特',
          labelEn: 'Lifestyle (At-home) Model',
          promptZh:
            '将假人台上的服装自然迁移到一位真实模特身上，模特处于温馨居家场景——可以是坐在带亚麻抱枕的浅色沙发上、靠在午后阳光下的飘窗边，或斜倚于木质书架旁。模特表情放松、眼神柔和、姿态轻松自然。光线为大面积自然窗户光、轻微暖色调。保留服装版型、面料纹理、颜色与图案；整体呈现轻松日常的生活方式电商质感。',
          promptEn:
            "Place the garment on a realistic model in a warm home setting — seated on a light sofa with linen cushions, leaning against a sunlit bay window, or relaxing beside a wooden bookshelf. The model's expression is relaxed, gaze soft, posture natural and unforced. Lighting is broad natural window light with a faintly warm tone. Preserve the garment's fit, fabric texture, colors and patterns. Deliver a casual lifestyle e-commerce mood.",
        },
        {
          labelZh: '室外模特',
          labelEn: 'Outdoor Model',
          promptZh:
            '将假人台上的服装自然迁移到一位真实模特身上，模特置身于自然室外场景中——可以是城市街道、林荫公园步道，或海边沙滩；背景适度虚化与主体分离。光线为黄金时段或柔和阴天日光，色调通透自然。模特姿态生动而不夸张，与场景氛围契合。完整保留服装版型、面料纹理、颜色与图案细节；整体呈现真实生活方式商业拍摄质感。',
          promptEn:
            "Transfer the garment to a realistic model placed in a natural outdoor environment — a city street, a tree-lined park path, or a coastal beach — with the background gently blurred to separate the subject. Lighting is golden-hour or soft overcast daylight with clean natural color. The model's pose is dynamic but not exaggerated, matching the scene's mood. Preserve the garment's fit, fabric texture, colors and patterns exactly. Deliver an authentic lifestyle commercial shoot aesthetic.",
        },
      ],
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
      presets: [
        {
          labelZh: '日漫风',
          labelEn: 'Japanese Anime',
          promptZh: '将照片中的人物与服装转换为日本动漫插画风格，保持服装结构和品牌识别特征。线条干净细腻、色彩明亮饱和、阴影分块清晰；眼睛大而有神、表情灵动；整体呈现日式少女漫或少年漫常见的角色设计语言。',
          promptEn: 'Convert the subject and garment into a Japanese anime illustration style. Preserve the outfit structure and brand-recognizable features. Use clean delicate linework, vibrant saturated colors, cel-shaded blocked shadows; large expressive eyes and lively expressions. Deliver the visual language of mainstream shoujo/shounen manga character design.',
        },
        {
          labelZh: '韩漫风',
          labelEn: 'Korean Webtoon',
          promptZh: '将照片中的人物与服装转换为韩国网络漫画插画风格，保持服装结构与图案识别度。线条柔和、色彩淡雅清透、面部精致写实、五官比例向真人靠拢；常见柔光和淡色渐变背景。整体呈现高品质韩漫的精致质感。',
          promptEn: 'Convert the subject and garment into a Korean webtoon illustration style. Preserve the outfit structure and pattern recognizability. Use soft linework, light airy colors, refined semi-realistic facial features approaching real proportions; common soft glow and pastel gradient backgrounds. Deliver the polished aesthetic of premium Korean webtoons.',
        },
        {
          labelZh: '美漫风',
          labelEn: 'American Comic',
          promptZh: '将照片中的人物与服装转换为美式漫画插画风格，保持服装结构。粗黑勾边、色彩高饱和、阴影硬朗有力、肌肉与体态结构夸张；常见网点纹理和动作线。整体呈现 Marvel/DC 类英雄漫画的视觉语言。',
          promptEn: 'Convert the subject and garment into an American comic-book illustration style. Preserve the outfit structure. Use bold black outlines, high-saturation colors, hard-edged dramatic shadows, exaggerated musculature and posture; common halftone textures and motion lines. Deliver the visual language of Marvel/DC hero comics.',
        },
        {
          labelZh: '国风插画',
          labelEn: 'Chinese Ink-style',
          promptZh: '将照片中的人物与服装转换为中国国风工笔插画风格，保持服装结构识别度。线条工整流畅、色彩沉稳典雅、淡雅水墨晕染背景；可融入云纹、花鸟或山水元素。整体呈现传统中式美学的现代插画质感。',
          promptEn: 'Convert the subject and garment into a Chinese gongbi ink-illustration style. Preserve the outfit structure and recognizability. Use clean flowing linework, restrained elegant colors, subtle ink-wash backgrounds; optionally weave in cloud motifs, florals or landscape elements. Deliver a modern interpretation of traditional Chinese aesthetic.',
        },
      ],
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
      presets: [
        {
          labelZh: '写实立体',
          labelEn: 'Realistic Volumetric',
          promptZh: '将平面服装图片立体化展示，强化褶皱体积、面料垂感与立体轮廓。保持真实摄影质感、不要变成纯 3D 建模渲染。可微调光线方向以增强材质层次，整体呈现高级商品图的真实立体观感。',
          promptEn: 'Render the flat garment image into volumetric display. Strengthen fold volumes, fabric drape and dimensional contours while keeping authentic photographic quality — avoid pure CG render look. Subtly adjust lighting direction to enhance material layering. Deliver an authentic premium product-photo dimensional feel.',
        },
        {
          labelZh: '软陶质感',
          labelEn: 'Soft Clay Texture',
          promptZh: '将平面服装图片转换为软陶/橡皮泥材质的立体小品质感，保持服装版型与图案颜色识别度。表面带有柔软的塑形痕迹、磨砂哑光质感、明暗对比柔和可爱；适合趣味营销图。',
          promptEn: 'Transform the flat garment into a soft polymer-clay/playdough volumetric look while keeping silhouette and pattern recognizable. Surface shows gentle sculpting marks, matte powdery texture, soft cute light-shadow contrast. Suited for playful marketing visuals.',
        },
        {
          labelZh: '玻璃质感',
          labelEn: 'Glass / Crystal',
          promptZh: '将平面服装图片转换为通透的玻璃或水晶质感立体展示，保持服装版型轮廓识别。增加折射高光、内部透光与边缘反射，背景为干净深色或浅色渐变以衬托晶莹剔透感。',
          promptEn: 'Transform the flat garment into a translucent glass or crystal volumetric display while keeping the silhouette recognizable. Add refractive highlights, internal light transmission and edge reflections; place against a clean dark or gradient backdrop to emphasize crystalline clarity.',
        },
        {
          labelZh: '织物特写',
          labelEn: 'Fabric Macro',
          promptZh: '将平面服装图片放大为局部织物特写立体效果，重点展示线圈、纹理、缝线、印花的微观细节与立体感。光线为侧逆光以突出纤维与表面微凹凸，呈现高品质面料宣传质感。',
          promptEn: 'Render the garment as a macro fabric close-up with three-dimensional emphasis on yarn loops, texture, stitching and print micro-details. Use side-back lighting to highlight fibers and micro-relief surfaces. Deliver the premium feel of high-end fabric promotional imagery.',
        },
      ],
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
      presets: [
        {
          labelZh: '极简',
          labelEn: 'Minimalist',
          promptZh: '将服装重排为极简平铺构图，背景为纯白或纯浅灰、无多余元素。仅保留服装本体与一两件极简单的中性配饰（如平整的腰带或简洁手表）。光线柔和均匀、阴影克制、强调画面留白。',
          promptEn: 'Recompose the garment into a minimalist flat-lay on a pure white or pure light-grey backdrop with no extraneous elements. Keep only the garment plus one or two extremely simple neutral accessories (a flat belt or plain watch). Soft even lighting, restrained shadows, emphasis on negative space.',
        },
        {
          labelZh: '配饰丰富',
          labelEn: 'Accessory-Rich',
          promptZh: '将服装平铺并自动搭配丰富的匹配配饰——包、鞋、项链、耳饰、丝巾、眼镜等可按风格选择 4-6 件。整体构图饱满有节奏，色调统一、品牌调性一致；电商级摄影光线、画面干净专业。',
          promptEn: 'Flat-lay the garment with rich matching accessories — bag, shoes, necklace, earrings, scarf, sunglasses, choose 4-6 by style. Full but rhythmic composition, unified color palette and brand tone; e-commerce-grade lighting, clean professional finish.',
        },
        {
          labelZh: '季节主题',
          labelEn: 'Seasonal Theme',
          promptZh: '将服装平铺并融入对应季节的氛围元素——春日花瓣、夏日海滩贝壳、秋日落叶、冬日松枝雪粒等，按服装风格选择最合适的一套。整体色调与季节情绪契合，画面既有故事感又保持商业可读性。',
          promptEn: "Flat-lay the garment with season-themed atmospheric elements — spring petals, summer shells, autumn leaves, or winter pine sprigs and snow bits — picked to match the garment style. Color palette matches the seasonal mood; image has story while remaining commercially readable.",
        },
        {
          labelZh: '礼物开箱',
          labelEn: 'Gift Unboxing',
          promptZh: '将服装平铺为礼物开箱构图——半开的礼盒、缎带、卡片、干花、小礼品等元素围绕服装。整体氛围温暖喜庆、节日感强；适合双十一/圣诞/情人节等促销节点电商素材。',
          promptEn: "Flat-lay the garment in a gift-unboxing composition — a half-open gift box, ribbon, card, dried flowers and small gifts surrounding the garment. Warm festive mood with strong holiday vibe; suited for Black Friday / Christmas / Valentine's-Day e-commerce visuals.",
        },
      ],
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
      presets: [
        {
          labelZh: '标准模特',
          labelEn: 'Standard Model',
          promptZh: '将模特体型精确调整为标准模特身材：身高约 175cm 比例、肩宽适中、腰部纤细、腿部修长。保持服装版型贴合度与细节不丢失，整体身材协调健康，适合高品质电商主图。',
          promptEn: 'Precisely adjust the model body to a standard fashion-model proportion: roughly 175 cm tall, moderate shoulder width, slim waist, long legs. Preserve garment fit and details without loss; overall coordinated and healthy build suitable for premium e-commerce main visuals.',
        },
        {
          labelZh: '偏瘦修长',
          labelEn: 'Slim & Tall',
          promptZh: '将模特体型调整为偏瘦修长比例：身材纤细、四肢拉长、肩腰臀比例显瘦，但保持自然不夸张。服装贴合度自然修身，整体呈现轻盈高挑的时装大片感。',
          promptEn: 'Adjust the model body toward a slim & tall proportion: slender frame, elongated limbs, slim shoulder-waist-hip ratio, while staying natural and not exaggerated. Garment fit is naturally slim. Overall delivers a lightweight, leggy editorial fashion feel.',
        },
        {
          labelZh: '健美比例',
          labelEn: 'Athletic Build',
          promptZh: '将模特体型调整为健美/运动比例：肩部稍宽、肌肉线条清晰但不夸张、腰腹紧致、腿部强健。保持服装版型与细节不变，整体呈现自信有力的运动时尚感。',
          promptEn: 'Adjust the model body toward an athletic build: slightly broader shoulders, defined-but-natural muscle lines, taut waist, strong legs. Preserve garment fit and details. Overall delivers a confident, powerful sporty-fashion vibe.',
        },
        {
          labelZh: '大码模特',
          labelEn: 'Plus-Size Model',
          promptZh: '将模特体型调整为大码模特身材：丰满有曲线、肩腰臀比例自然柔和、肢体匀称健康。服装贴合度按真实大码版型呈现，整体氛围自信舒适，适合大码服饰主图。',
          promptEn: 'Adjust the model body toward a plus-size proportion: full curvy figure, soft natural shoulder-waist-hip ratio, well-balanced healthy limbs. Garment fit reflects authentic plus-size patterns. Overall vibe is confident and comfortable, suited for plus-size apparel main visuals.',
        },
      ],
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
      presets: [
        {
          labelZh: '通勤',
          labelEn: 'Commute',
          promptZh: '基于平铺服装与配饰生成合适模特并完成上身穿戴，整体风格为城市通勤/商务休闲：模特处于现代办公楼大堂或街拍场景。光线为日光自然光、姿态干练自信，强调商务实用感。',
          promptEn: 'From the flat-lay clothing and accessories, generate a suitable model and dress them in a complete commute / business-casual look. Place in a modern office lobby or street setting. Daylight natural lighting, sharp confident posture, emphasis on professional practicality.',
        },
        {
          labelZh: '度假',
          labelEn: 'Resort',
          promptZh: '基于平铺服装与配饰生成合适模特并完成上身穿戴，整体风格为海岛度假感：模特处于海边沙滩、棕榈树或池畔场景。阳光强烈明亮、肌肤质感真实、姿态轻松自由，强调假日松弛氛围。',
          promptEn: 'Generate a model dressed in the provided clothing and accessories with a tropical resort vibe: place at a sandy beach, palm trees or poolside. Strong bright sunlight, authentic skin tone, relaxed free posture, emphasizing holiday ease.',
        },
        {
          labelZh: '派对',
          labelEn: 'Party / Evening',
          promptZh: '基于平铺服装与配饰生成合适模特并完成上身穿戴，整体风格为派对/晚宴：模特处于带霓虹或聚光的派对现场或高级餐厅。光线戏剧化、姿态优雅有力，妆容和发型精致，强调夜场社交氛围。',
          promptEn: 'Generate a model in a complete party / evening look using the provided pieces. Place in a neon-lit or spotlight party venue or upscale restaurant. Dramatic lighting, elegant powerful posture, refined makeup and hair, emphasizing nightlife social atmosphere.',
        },
        {
          labelZh: '运动',
          labelEn: 'Sport / Active',
          promptZh: '基于平铺服装与配饰生成合适模特并完成上身穿戴，整体风格为运动场景：模特处于健身房、田径跑道或户外训练场。姿态有动感（拉伸、慢跑、动作启动等），光线明亮干净，强调活力健康。',
          promptEn: 'Generate a model in a complete sportwear look using the provided pieces. Place in a gym, running track or outdoor training ground. Dynamic posture (stretching, jogging, action initiation), bright clean lighting, emphasizing vitality and health.',
        },
      ],
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
      presets: [
        {
          labelZh: '表面划痕',
          labelEn: 'Surface Scratches',
          promptZh: '修复产品表面所有可见的划痕、刮花和细小划伤，恢复光洁如新的表面状态。完整保留产品形态、品牌标识、文字信息、材质纹理与高光反射，仅修复划伤本身，不改变产品其他外观特征。',
          promptEn: 'Repair all visible surface scratches, scuffs and fine cuts, restoring a pristine smooth surface. Preserve the product shape, branding, text, material texture and highlight reflections fully. Fix only the scratches themselves without altering any other visual features.',
        },
        {
          labelZh: '凹陷变形',
          labelEn: 'Dents & Deformation',
          promptZh: '修复产品表面的凹陷、压痕、轻微变形等结构问题，恢复产品原始几何形态。保持品牌标识、文字、材质纹理、颜色与高光反射不变，整体呈现完美出厂状态。',
          promptEn: 'Repair dents, press marks and slight deformation on the product surface, restoring its original geometry. Keep branding, text, material texture, color and highlight reflections unchanged. Deliver a perfect factory-condition look overall.',
        },
        {
          labelZh: '角部破损',
          labelEn: 'Edge / Corner Damage',
          promptZh: '修复产品边角处的破损、碎裂、缺失部分，自然地补全到原始完整形态。保持其他位置的纹理、颜色、品牌信息不变，修复痕迹隐匿无可见接缝，呈现完好如新质感。',
          promptEn: 'Repair damaged, chipped or missing edges and corners by naturally restoring the original complete form. Keep texture, color and branding elsewhere unchanged. Repairs are seamless with no visible joints, delivering a flawless as-new finish.',
        },
        {
          labelZh: '综合多瑕疵',
          labelEn: 'Multiple Defects',
          promptZh: '综合修复产品表面所有可见瑕疵，包括划痕、凹陷、破损、污渍、生锈或氧化等。完整保留产品的形态、品牌标识、文字信息、原始材质特性；不要"美颜"过度，仅恢复出厂全新状态。',
          promptEn: "Comprehensively repair all visible defects — scratches, dents, damage, stains, rust or oxidation. Preserve the product's shape, branding, text and original material characteristics fully. Do not over-beautify; restore strictly to factory-new condition.",
        },
      ],
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
      presets: [
        {
          labelZh: '纯白电商',
          labelEn: 'Pure White',
          promptZh: '保持商品主体不变，将背景替换为标准纯白电商背景（接近 #FFFFFF）。商品边缘自然干净、底部带柔和投影、光线方向与原图一致。整体符合天猫/亚马逊等电商主图规范。',
          promptEn: 'Keep the product unchanged and replace the background with a standard pure-white e-commerce backdrop (near #FFFFFF). Clean natural product edges, soft floor shadow, lighting direction consistent with the original. Compliant with Tmall / Amazon main-image specs.',
        },
        {
          labelZh: '浅灰渐变',
          labelEn: 'Light Grey Gradient',
          promptZh: '保持商品主体不变，将背景替换为浅灰柔和渐变背景（顶部浅、底部稍深）。商品边缘自然、阴影与渐变融合柔和、光线层次丰富，整体呈现高级精品电商主图质感。',
          promptEn: 'Keep the product unchanged and replace the background with a light-grey soft gradient (lighter top, slightly deeper bottom). Natural product edges, shadows blending smoothly with the gradient, rich lighting depth. Deliver a premium boutique-grade main-image feel.',
        },
        {
          labelZh: '自然场景',
          labelEn: 'Natural Scene',
          promptZh: '保持商品主体不变，将背景替换为自然真实使用场景——如木质桌面+绿植、大理石台面+暖光、户外草地+阳光等，按商品类型选择最合适的一种。光线、阴影、视角与商品保持一致。',
          promptEn: 'Keep the product unchanged and replace the background with a natural in-use scene — wooden tabletop with greenery, marble counter with warm light, or outdoor grass with sunlight — picked by product category. Maintain consistent lighting, shadow and perspective with the product.',
        },
        {
          labelZh: '主题氛围',
          labelEn: 'Themed Atmosphere',
          promptZh: '保持商品主体不变，将背景替换为带主题情绪的高级氛围——例如奢华暗夜+金色聚光、梦幻粉色雾气、北欧极简冷调等。商品边缘干净、光线层次丰富，整体呈现品牌广告级视觉。',
          promptEn: 'Keep the product unchanged and replace the background with a moody themed atmosphere — luxurious dark night with gold spotlight, dreamy pink mist, or Nordic minimalist cool tone. Clean product edges, rich lighting depth; delivers a brand-ad-grade visual.',
        },
      ],
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
      presets: [
        {
          labelZh: '污渍',
          labelEn: 'Stains',
          promptZh: '清理产品表面所有污渍，包括食物渍、油渍、咖啡渍、墨水渍等。完整保留产品的形态、品牌标识、文字、材质纹理、高光反射、颜色，仅清除污渍本身，呈现干净如新的状态。',
          promptEn: "Clean all stains from the product surface — food stains, oil, coffee, ink and similar marks. Preserve the product's shape, branding, text, material texture, highlight reflections and color. Remove only the stains themselves, leaving a clean as-new state.",
        },
        {
          labelZh: '水印',
          labelEn: 'Watermarks',
          promptZh: '清理产品图片上的所有水印（包括半透明文字、Logo 水印、版权标识等），按周边内容自然补全被遮盖区域。保留商品所有原始细节、纹理、颜色、品牌识别信息，无可见修复痕迹。',
          promptEn: 'Remove all watermarks from the product image (translucent text, logo watermarks, copyright marks). Naturally inpaint the covered areas based on surrounding context. Preserve all original details, textures, colors and branding; no visible repair artifacts.',
        },
        {
          labelZh: '指纹灰尘',
          labelEn: 'Fingerprints & Dust',
          promptZh: '清理产品表面的指纹、灰尘、毛絮、水珠等微小杂质，恢复光洁干净的表面状态。完整保留材质纹理、高光反射、品牌标识与所有原始细节，仅清除杂质本身，呈现专业棚拍级别质感。',
          promptEn: 'Clean fingerprints, dust, lint and water droplets from the product surface, restoring a smooth pristine state. Preserve material texture, highlight reflections, branding and all original details; remove only the contaminants themselves. Deliver studio-grade cleanliness.',
        },
        {
          labelZh: '综合杂质',
          labelEn: 'Comprehensive Cleanup',
          promptZh: '综合清理产品上的所有污渍、水印、指纹、灰尘、毛絮、刮痕等可见杂质和残留。完整保留产品形态、品牌、文字、纹理、颜色与材质特性，仅清除杂质本身，呈现专业商品拍摄级别的洁净度。',
          promptEn: "Comprehensively clean all visible stains, watermarks, fingerprints, dust, lint, scratches and residues. Preserve the product's shape, branding, text, texture, color and material characteristics. Remove only the contaminants. Deliver professional commercial-photography-grade cleanliness.",
        },
      ],
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
      presets: [
        {
          labelZh: '缝线纹理',
          labelEn: 'Stitching Detail',
          promptZh: '重点增强服装的缝线、车线、走线等结构细节的清晰度与立体感，让缝线锐利、纹路清楚、走线工艺一目了然。保持其他部分自然不变，避免整体过度锐化或噪点；适合服装做工特写图。',
          promptEn: 'Specifically enhance the clarity and dimensionality of stitching, seams and threadwork — crisp stitches, clear grain, visible craftsmanship. Keep other areas naturally unchanged; avoid global over-sharpening or noise. Ideal for garment-craftsmanship close-ups.',
        },
        {
          labelZh: '印花图案',
          labelEn: 'Print Pattern',
          promptZh: '重点增强服装或产品上的印花、图案、Logo、文字的清晰度与色彩饱和度。让图案边缘锐利、色彩鲜活、细节肌理可见，但不破坏底布材质的自然质感。适合品牌识别和图案展示用图。',
          promptEn: 'Specifically enhance the clarity and color saturation of prints, patterns, logos and text on the garment or product. Sharp pattern edges, vibrant colors, visible detail texture, without breaking the natural feel of the base fabric. Ideal for brand-recognition and pattern showcase visuals.',
        },
        {
          labelZh: '材质质感',
          labelEn: 'Material Texture',
          promptZh: '重点增强商品材质的肌理与质感表现——丝绸的光泽、棉麻的纤维、皮革的纹路、金属的反光等。光线层次更丰富、表面细节更丰富，整体呈现高级感、避免过度锐化与噪点。',
          promptEn: 'Specifically enhance the texture and material quality — silk sheen, cotton/linen fibers, leather grain, metal reflections, etc. Richer lighting depth, richer surface detail. Deliver a premium feel while avoiding over-sharpening or noise.',
        },
        {
          labelZh: '整体清晰度',
          labelEn: 'Overall Sharpness',
          promptZh: '综合提升整张图片的清晰度、对比度与色彩通透感，包括缝线、纹理、印花、材质、高光反射等所有细节维度。整体呈现高品质电商主图质感，但避免过度锐化和噪点产生。',
          promptEn: "Comprehensively boost the entire image's sharpness, contrast and color clarity across stitching, texture, prints, materials and highlight reflections. Deliver high-quality e-commerce main-image polish while avoiding over-sharpening or noise.",
        },
      ],
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
      presets: [
        {
          labelZh: '黑白上色',
          labelEn: 'B&W Colorization',
          promptZh: '将黑白老照片自然上色为彩色，参考照片年代和内容选择真实合理的肤色、衣物颜色、场景色调。同时修复模糊、折痕、污点等老化痕迹，保持人物特征和原始构图准确。',
          promptEn: "Naturally colorize a black-and-white old photo with realistic skin tones, clothing colors and scene palette appropriate to its era and content. At the same time, repair blur, creases and spots. Preserve the subjects' features and original composition accurately.",
        },
        {
          labelZh: '褪色还原',
          labelEn: 'Color Restoration',
          promptZh: '还原老照片中褪色、偏黄、偏黑的颜色，恢复到照片拍摄时的自然色调。同时修复模糊、提升清晰度、修复轻微折痕和污点，保持人物表情、姿态和场景细节真实。',
          promptEn: "Restore faded, yellowed or darkened colors in an old photo back to natural tones at the time of capture. Also fix blur, boost clarity and repair light creases and spots. Preserve the subjects' expressions, postures and scene details authentically.",
        },
        {
          labelZh: '折痕修复',
          labelEn: 'Crease Repair',
          promptZh: '重点修复老照片上的折痕、撕裂、磨损边缘、污渍等物理损伤痕迹，自然补全损坏区域。保留照片原有色调与时代感，仅修复损伤本身，整体呈现完好保存的老照片质感。',
          promptEn: 'Specifically repair physical damage on the old photo — creases, tears, worn edges and stains — naturally inpainting damaged regions. Keep the original color tone and era feel; fix only the damage itself. Deliver a well-preserved vintage photo look.',
        },
        {
          labelZh: '综合修复',
          labelEn: 'Comprehensive',
          promptZh: '综合修复老照片：去除褪色与偏色、修复模糊与划痕、清理污点和折痕、恢复对比度与清晰度。同时保持原始构图、人物特征、年代质感不变，整体呈现典藏级修复质感。',
          promptEn: "Comprehensively restore the old photo: remove fading and color cast, repair blur and scratches, clean spots and creases, restore contrast and clarity. Preserve the original composition, subjects' features and period atmosphere. Deliver an archival-grade restoration.",
        },
      ],
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
      presets: [
        {
          labelZh: '单点水印',
          labelEn: 'Single Watermark',
          promptZh: '清理图片上的单个水印或 logo（通常位于角落或图片中心），按周边内容自然补全被遮盖区域。完整保留画面的构图、光影、纹理、色彩与品牌主体信息，无可见修复痕迹。',
          promptEn: 'Remove a single watermark or logo (typically at a corner or center) from the image, naturally inpainting the covered area based on surrounding context. Preserve the composition, lighting, texture, colors and main subject; no visible repair artifacts.',
        },
        {
          labelZh: '大面积 logo',
          labelEn: 'Large Logo',
          promptZh: '清理图片上覆盖大面积或重复排列的 Logo、品牌花纹、图案水印，按周边内容自然补全。处理时注意整体构图节奏与光影连贯性，避免补全区域出现明显的色块或纹理跳跃。',
          promptEn: 'Remove large-area or repeated pattern logos, brand motifs and pattern watermarks from the image, naturally inpainting based on surrounding context. Watch for overall composition rhythm and lighting continuity; avoid color or texture jumps in the inpainted regions.',
        },
        {
          labelZh: '杂乱文字',
          labelEn: 'Cluttered Text',
          promptZh: '清理图片中杂乱的文字、价格标签、广告文案、贴纸文字等，根据周边内容自然补全。保持画面构图、产品/人物主体、光影连贯性不变，整体呈现干净专业的视觉效果。',
          promptEn: 'Remove cluttered text, price tags, ad copy and sticker text from the image, naturally inpainting based on surrounding context. Keep the composition, the product/subject and lighting continuity intact. Deliver a clean professional visual.',
        },
        {
          labelZh: '综合污染',
          labelEn: 'Comprehensive',
          promptZh: '综合清理图片中所有的水印、Logo、文字、贴纸、广告标识、印章等视觉污染，按周边内容自然补全所有清理区域。整体保持构图完整、光影连贯、纹理自然，不留可见修复痕迹。',
          promptEn: 'Comprehensively remove all watermarks, logos, text, stickers, ad marks and stamps from the image, inpainting all removed areas based on surrounding context. Keep the composition complete, lighting continuous and textures natural; no visible repair artifacts.',
        },
      ],
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
      presets: [
        {
          labelZh: '中英互换',
          labelEn: 'CN ↔ EN',
          promptZh: '将图片中所有中文文案替换为对应的英文版本（或英文换为中文），保持完全相同的字体风格、字重、字号、颜色、排版位置和设计语言。仅替换文字内容，画面其他设计元素不变。',
          promptEn: 'Replace all Chinese copy in the image with the corresponding English version (or English to Chinese), keeping the exact same font, weight, size, color, layout position and design language. Only the text content changes; all other design elements remain unchanged.',
        },
        {
          labelZh: '季节促销',
          labelEn: 'Seasonal Promo',
          promptZh: '将原文案替换为季节促销主题文案——春夏新品上市、夏季清凉特惠、秋冬温暖钜惠等，按图片中的产品风格选择最贴切的一套。保持字体风格、版式节奏与原图设计语言完全一致。',
          promptEn: 'Replace the original copy with seasonal-promo copy — spring/summer new arrivals, summer cool deals, autumn/winter warm savings — picked to match the product style in the image. Keep the typography, layout rhythm and design language fully consistent with the original.',
        },
        {
          labelZh: '节日营销',
          labelEn: 'Holiday Marketing',
          promptZh: '将原文案替换为节日营销主题文案——双十一、圣诞、情人节、母亲节等，按图片整体氛围选择最合适的一套。保持原始字体、字号、颜色、排版完全一致；适合节点电商和社交媒体宣发。',
          promptEn: "Replace the original copy with holiday-marketing copy — Black Friday, Christmas, Valentine's Day, Mother's Day — picked to match the image's overall atmosphere. Keep the original font, size, color and layout fully consistent. Suited for occasion-based e-commerce and social campaigns.",
        },
        {
          labelZh: '风格统一',
          labelEn: 'Style Harmonize',
          promptZh: '替换图片中的不协调或风格混杂的文案，统一为单一字体家族、合理字号层级和品牌主色调。保持原有信息内容和排版位置基本不变，整体呈现专业品牌设计的精致质感。',
          promptEn: 'Replace mismatched or stylistically inconsistent copy in the image with a unified font family, sensible size hierarchy and brand color palette. Keep the original information content and layout positions essentially intact. Deliver a polished professional brand-design feel.',
        },
      ],
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
      presets: [
        {
          labelZh: '综合优化',
          labelEn: 'General Polish',
          promptZh: '综合优化图片的曝光、白平衡、对比度、清晰度、色彩饱和度等基础维度。轻微提升整体精致度，保持画面真实感和主体特征不变，避免过度"美颜"或风格化处理，整体呈现自然舒适的专业质感。',
          promptEn: "Comprehensively polish the image's exposure, white balance, contrast, sharpness and color saturation. Lightly boost overall refinement while preserving authenticity and subject features. Avoid over-beautification or heavy stylization; deliver a natural, comfortable professional feel.",
        },
        {
          labelZh: '清洁化',
          labelEn: 'Cleanup-First',
          promptZh: '重点清理图片中的杂乱元素——背景杂物、皮肤瑕疵、产品上的污点、画面中的多余对象等。完整保留主体身份、姿态、原始构图，整体呈现干净专业的视觉效果，不引入新的元素或大幅风格变化。',
          promptEn: "Focus on cleaning up clutter in the image — background distractions, skin blemishes, product spots, extraneous objects. Preserve the subject's identity, posture and original composition. Deliver a clean professional visual; introduce no new elements or major stylistic changes.",
        },
        {
          labelZh: '风格化',
          labelEn: 'Stylized Mood',
          promptZh: '在保持主体身份与原始构图的前提下，给图片增加一种风格化氛围——例如电影级冷调、复古胶片、暖光黄昏、黑金高级感等。色调风格化但仍可识别商品/人物，避免过度滤镜导致细节丢失。',
          promptEn: 'While preserving the subject and original composition, give the image a stylized mood — cinematic cool tone, vintage film, warm dusk, or black-gold premium feel. Stylized palette while keeping product/subject recognizable; avoid heavy filters that lose details.',
        },
        {
          labelZh: '商业品质',
          labelEn: 'Commercial Quality',
          promptZh: '综合提升图片到商业级电商主图标准：精确的曝光与色温、专业的高光阴影层次、干净的边缘与背景、突出的主体焦点。保持主体身份与原始构图不变，整体呈现高品质品牌图的精致质感。',
          promptEn: 'Comprehensively elevate the image to commercial-grade e-commerce main-image standards: accurate exposure and color temperature, professional highlight-shadow depth, clean edges and background, focused main subject. Preserve subject identity and original composition; deliver premium brand-image polish.',
        },
      ],
    },
  ],
};

export const SmartRepairView: React.FC<SmartRepairViewProps> = ({ onBack, projectId, embedded = false }) => {
  const { language, t } = useLanguage();
  const { requireAuth } = useRequireAuth();
  const isZh = language === 'zh';

  const [sourceImageSource, setSourceImageSource] = useState<SmartRepairImageSource | null>(null);
  const [referenceSource, setReferenceSource] = useState<SmartRepairImageSource | null>(null);
  const [modelSource, setModelSource] = useState<SmartRepairImageSource | null>(null);
  const [pickerTarget, setPickerTarget] = useState<SmartRepairPickerTarget | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<SmartRepairParams['aspectRatio']>('1:1');
  const [strength, setStrength] = useState<SmartRepairParams['strength']>('medium');
  const [outputCount, setOutputCount] = useState<SmartRepairParams['outputCount']>(1);
  const [selectedModel, setSelectedModel] = useState<SmartRepairModel>('flux-2-pro');
  const [activeSubpage, setActiveSubpage] = useState<SmartRepairSubpage>('fashion_model');
  const [activeToolCode, setActiveToolCode] = useState<SmartRepairToolCode | null>(null);
  // -1 = no preset active (legacy chip mode / cleared / tool has no presets)
  const [activePresetIndex, setActivePresetIndex] = useState<number>(-1);
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
  const [uploadColWidth, setUploadColWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return SMART_REPAIR_UPLOAD_COL_DEFAULT_WIDTH;
    const raw = window.localStorage.getItem(SMART_REPAIR_UPLOAD_COL_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed)) return SMART_REPAIR_UPLOAD_COL_DEFAULT_WIDTH;
    return Math.min(SMART_REPAIR_UPLOAD_COL_MAX_WIDTH, Math.max(SMART_REPAIR_UPLOAD_COL_MIN_WIDTH, parsed));
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SMART_REPAIR_UPLOAD_COL_STORAGE_KEY, String(uploadColWidth));
  }, [uploadColWidth]);
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

  // When a tool has presets, the first preset's prompt is the default textarea content;
  // otherwise we fall back to the legacy token-based template (still used by the other 13 tools).
  const getInitialToolPrompt = useCallback(
    (tool: SmartRepairToolDef): string => {
      if (tool.presets && tool.presets.length > 0) {
        return isZh ? tool.presets[0].promptZh : tool.presets[0].promptEn;
      }
      return buildPromptTemplate(tool);
    },
    [buildPromptTemplate, isZh],
  );

  const applyPresetPrompt = useCallback(
    (preset: SmartRepairPreset, index: number) => {
      setPrompt(isZh ? preset.promptZh : preset.promptEn);
      setActivePresetIndex(index);
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

  // Three image slots (source / reference / model) all use SmartRepairImageSource.
  // For kind==='upload' we own the blob URL and revoke on replace/clear/unmount;
  // for kind==='asset' the server URL is owned by the asset library.
  const getSetter = useCallback((target: SmartRepairPickerTarget) => {
    if (target === 'source') return setSourceImageSource;
    if (target === 'reference') return setReferenceSource;
    return setModelSource;
  }, []);

  const setSourceFromFile = useCallback(
    (target: SmartRepairPickerTarget, file: File | null) => {
      getSetter(target)((prev) => {
        if (prev?.kind === 'upload') URL.revokeObjectURL(prev.previewUrl);
        if (!file) return null;
        return { kind: 'upload', file, previewUrl: URL.createObjectURL(file) };
      });
    },
    [getSetter],
  );
  const clearImageSource = useCallback(
    (target: SmartRepairPickerTarget) => {
      getSetter(target)((prev) => {
        if (prev?.kind === 'upload') URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    },
    [getSetter],
  );
  // Cleanup any blob URLs when component unmounts.
  useEffect(() => {
    return () => {
      if (sourceImageSource?.kind === 'upload') URL.revokeObjectURL(sourceImageSource.previewUrl);
      if (referenceSource?.kind === 'upload') URL.revokeObjectURL(referenceSource.previewUrl);
      if (modelSource?.kind === 'upload') URL.revokeObjectURL(modelSource.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAssetPickerConfirm = useCallback(
    (assets: Asset[]) => {
      const asset = assets[0];
      if (!asset || !pickerTarget) return;
      const next: SmartRepairImageSource = {
        kind: 'asset',
        assetId: asset.id,
        path: asset.file_url,
        previewUrl: asset.thumbnail || asset.file_url,
        name: asset.name || (pickerTarget === 'model' ? 'Model' : pickerTarget === 'source' ? 'Source' : 'Reference'),
      };
      getSetter(pickerTarget)((prev) => {
        if (prev?.kind === 'upload') URL.revokeObjectURL(prev.previewUrl);
        return next;
      });
      setPickerTarget(null);
    },
    [pickerTarget, getSetter],
  );

  const shellClassName = useMemo(
    () => (embedded ? 'h-full' : 'min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 p-6'),
    [embedded]
  );

  const contentWrapClassName = embedded ? 'w-full' : 'max-w-5xl mx-auto';

  useEffect(() => {
    if (currentTools.length === 0) return;
    const stillExists = activeToolCode && currentTools.some((tool) => tool.code === activeToolCode);
    if (stillExists) return;
    const tool = currentTools[0];
    setActiveToolCode(tool.code);
    setPrompt(getInitialToolPrompt(tool));
    setActivePresetIndex(tool.presets && tool.presets.length > 0 ? 0 : -1);
  }, [activeToolCode, currentTools, getInitialToolPrompt]);

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

  const sourcePreviewUrl = sourceImageSource?.previewUrl || '';
  const referencePreviewUrl = referenceSource?.previewUrl || '';
  const modelPreviewUrl = modelSource?.previewUrl || '';
  useEffect(() => {
    let alive = true;
    const sources = [sourcePreviewUrl, referencePreviewUrl, modelPreviewUrl]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
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
  }, [referencePreviewUrl, modelPreviewUrl, sourcePreviewUrl]);

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

    if (!sourceImageSource) {
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
        sourceImageSource.kind === 'upload' ? sourceImageSource.file : null,
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
          sourceImagePath: sourceImageSource.kind === 'asset' ? sourceImageSource.path : undefined,
          sourceAssetId: sourceImageSource.kind === 'asset' ? sourceImageSource.assetId : undefined,
          referenceImage: referenceSource?.kind === 'upload' ? referenceSource.file : undefined,
          referenceImagePath: referenceSource?.kind === 'asset' ? referenceSource.path : undefined,
          referenceAssetId: referenceSource?.kind === 'asset' ? referenceSource.assetId : undefined,
          modelImage: modelSource?.kind === 'upload' ? modelSource.file : undefined,
          modelImagePath: modelSource?.kind === 'asset' ? modelSource.path : undefined,
          modelAssetId: modelSource?.kind === 'asset' ? modelSource.assetId : undefined,
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
    setActivePresetIndex(-1);
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
    setActivePresetIndex(-1);
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

  const renderImageSourceSlot = (opts: {
    target: SmartRepairPickerTarget;
    title: string;
    source: SmartRepairImageSource | null;
    isZh: boolean;
  }) => {
    const { target, title, source, isZh: zh } = opts;
    const pickerLabel = zh ? '从素材库选择' : 'Pick from library';
    return (
      <div className="rounded-xl border border-white/5 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-zinc-200">{title}</div>
          <button
            type="button"
            onClick={() => setPickerTarget(target)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold text-zinc-200 transition hover:bg-white/10"
          >
            <Library className="h-3 w-3" />
            {pickerLabel}
          </button>
        </div>
        {source?.kind === 'asset' ? (
          <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
            <img
              src={source.previewUrl}
              alt={source.name}
              className="w-full object-cover"
              style={{ maxHeight: '170px' }}
            />
            <div className="flex items-center justify-between gap-2 p-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold text-zinc-100">{source.name}</div>
                <div className="text-[10px] text-orange-300">{zh ? '来自素材库' : 'From library'}</div>
              </div>
              <button
                type="button"
                onClick={() => clearImageSource(target)}
                className="shrink-0 text-[11px] text-zinc-400 hover:text-zinc-200 underline"
              >
                {zh ? '移除' : 'Remove'}
              </button>
            </div>
          </div>
        ) : source?.kind === 'upload' ? (
          <div>
            <img
              src={source.previewUrl}
              alt={target}
              className="w-full rounded-lg border border-white/10 object-cover"
              style={{ maxHeight: '170px' }}
            />
            <button
              onClick={() => clearImageSource(target)}
              className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline"
            >
              {target === 'source'
                ? t.sr_change_image
                : target === 'reference'
                  ? t.sr_remove_reference
                  : (zh ? '移除模特图' : 'Remove model')}
            </button>
          </div>
        ) : (
          <ImageUploader
            maxFiles={1}
            size="compact"
            onFilesSelected={(files) => setSourceFromFile(target, files[0] || null)}
            onError={(err) =>
              setError({
                code: target === 'reference' ? 'REFERENCE_UPLOAD_ERROR' : 'MODEL_UPLOAD_ERROR',
                message: err,
                severity: 'warning',
              })
            }
          />
        )}
      </div>
    );
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
                          clearImageSource('source');
                          clearImageSource('reference');
                          clearImageSource('model');
                          setPrompt('');
                          setActivePresetIndex(-1);
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
                              setPrompt(getInitialToolPrompt(tool));
                              setActivePresetIndex(tool.presets && tool.presets.length > 0 ? 0 : -1);
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
                      <h2 className="text-lg font-semibold text-white">{isZh ? '参考图与配置' : 'Reference & Config'}</h2>
                    </div>

                    {/* Top split: upload sub-area | prompt sub-area */}
                    <div className="flex min-h-0 flex-1 gap-4">
                      <div
                        className="shrink-0 overflow-y-auto pr-1 space-y-4"
                        style={{ width: `${uploadColWidth}px` }}
                      >
                        {renderImageSourceSlot({
                          target: 'source',
                          title: isZh ? '原图（必传）' : 'Source Image (Required)',
                          source: sourceImageSource,
                          isZh,
                        })}

                        {renderImageSourceSlot({
                          target: 'reference',
                          title: t.sr_reference_optional,
                          source: referenceSource,
                          isZh,
                        })}

                        {renderImageSourceSlot({
                          target: 'model',
                          title: isZh ? '模特照片（可选）' : 'Model photo (Optional)',
                          source: modelSource,
                          isZh,
                        })}
                      </div>
                      <ResizableSplitter
                        position={uploadColWidth}
                        minSize={SMART_REPAIR_UPLOAD_COL_MIN_WIDTH}
                        onResize={(next) =>
                          setUploadColWidth(Math.min(SMART_REPAIR_UPLOAD_COL_MAX_WIDTH, Math.max(SMART_REPAIR_UPLOAD_COL_MIN_WIDTH, next)))
                        }
                        className="mx-1"
                      />

                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="mb-2 flex shrink-0 items-baseline justify-between gap-3">
                          <div className="flex items-baseline gap-2">
                            <h3 className="text-base font-semibold text-zinc-100">{isZh ? '你想怎么改？' : 'What do you want to change?'}</h3>
                            {activeTool && (
                              <span className="text-xs text-zinc-500">
                                {isZh ? '当前：' : 'Tool: '}
                                {isZh ? activeTool.titleZh : activeTool.titleEn}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-zinc-500">
                            {isZh ? '直接用自然语言描述你想要的修改效果' : 'Describe the desired result in natural language'}
                          </span>
                        </div>

                        {activeTool && (
                          <div className="mb-2 flex shrink-0 flex-wrap gap-2">
                            {activeTool.presets && activeTool.presets.length > 0
                              ? activeTool.presets.map((preset, index) => {
                                  const presetPrompt = isZh ? preset.promptZh : preset.promptEn;
                                  const isActive = activePresetIndex === index;
                                  const hasDeviated = isActive && prompt.trim() !== presetPrompt.trim();
                                  const baseClass = 'rounded-full border px-3.5 py-1.5 text-sm font-medium transition';
                                  const stateClass = isActive
                                    ? hasDeviated
                                      ? 'border-dashed border-orange-400/50 bg-orange-500/5 text-orange-200/80'
                                      : 'border-orange-500/60 bg-orange-500/15 text-orange-200'
                                    : 'border-white/10 bg-black/20 text-zinc-300 hover:border-orange-400/40 hover:text-orange-200';
                                  return (
                                    <button
                                      key={`${preset.labelZh}-${index}`}
                                      type="button"
                                      onClick={() => applyPresetPrompt(preset, index)}
                                      className={`${baseClass} ${stateClass}`}
                                      title={
                                        hasDeviated
                                          ? isZh
                                            ? '已偏离原预设，点击重置为该场景预设'
                                            : 'Edited away from this preset — click to reset'
                                          : undefined
                                      }
                                    >
                                      {isZh ? preset.labelZh : preset.labelEn}
                                    </button>
                                  );
                                })
                              : (isZh ? activeTool.suggestionsZh : activeTool.suggestionsEn).map((phrase) => {
                                  const inserted = prompt.includes(phrase);
                                  return (
                                    <button
                                      key={phrase}
                                      type="button"
                                      onClick={() => appendPromptSuggestion(phrase)}
                                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
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
                            className="h-full w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 pb-7 text-base leading-relaxed text-zinc-100 outline-none focus:border-orange-400/50"
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
                            clearImageSource('source');
                            clearImageSource('reference');
                            clearImageSource('model');
                            if (activeTool) {
                              setPrompt(getInitialToolPrompt(activeTool));
                              setActivePresetIndex(
                                activeTool.presets && activeTool.presets.length > 0 ? 0 : -1,
                              );
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
                          disabled={!sourceImageSource}
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
                      <h2 className="text-lg font-semibold text-white">{isZh ? '结果预览' : 'Result Preview'}</h2>
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

          <CreativeAssetPickerDialog
            isOpen={pickerTarget !== null}
            kind={pickerTarget === 'model' ? 'model' : 'product'}
            multiple={false}
            widthClassName="max-w-7xl"
            selectedIds={(() => {
              if (pickerTarget === 'source') return sourceImageSource?.kind === 'asset' ? [sourceImageSource.assetId] : [];
              if (pickerTarget === 'reference') return referenceSource?.kind === 'asset' ? [referenceSource.assetId] : [];
              if (pickerTarget === 'model') return modelSource?.kind === 'asset' ? [modelSource.assetId] : [];
              return [];
            })()}
            title={
              pickerTarget === 'model'
                ? (isZh ? '选择模特素材' : 'Pick model asset')
                : pickerTarget === 'source'
                  ? (isZh ? '选择原图素材' : 'Pick source asset')
                  : (isZh ? '选择参考图素材' : 'Pick reference asset')
            }
            subtitle={isZh ? '可从素材库选择图片，或从本地上传并保存后直接使用。' : 'Pick from your asset library, or upload locally and save first.'}
            emptyLabel={pickerTarget === 'model'
              ? (isZh ? '素材库里还没有模特图片' : 'No model images in your library yet')
              : (isZh ? '素材库里还没有图片素材' : 'No image assets in your library yet')}
            requireSeedanceId={false}
            imageOnly
            autoSelectUploaded
            onConfirm={handleAssetPickerConfirm}
            onClose={() => setPickerTarget(null)}
          />
        </div>
      </div>
    </div>
  );
};
