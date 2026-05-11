/**
 * 商品图片生成 4 模块共享的「比例选择器」配置。
 *
 * 设计原则：
 * - 主 chip 行：多数模块用 `{1:1, 2:3, 3:4, 9:16}` 作为电商主图 / 短视频封面 / 社媒竖屏常用集
 * - 「更多比例」popover：每个模块只暴露其上游 API 实际支持的剩余比例
 *
 * 上游 API 支持矩阵（见 backend `projects/views.py`）：
 *  - Flux 文生图（SmartRepair）:    9 个，无 21:9
 *      `_aspect_ratio_to_flux_dimensions`
 *  - Nano Banana（Gallery / FirstFrame 默认）: 10 个全部
 *      `_normalize_first_frame_aspect_ratio`
 *  - GPT (FirstFrame openai-compat): 仅 3 个：1:1 / 3:2 / 2:3
 *      `_aspect_ratio_to_gpt_size`
 *  - ClothingSwap 图片上游: 10 个全部；视频上游 Veo 3.1 优先使用 16:9 / 9:16
 *      `CLOTHING_SWAP_ASPECT_RATIO_CHOICES` / `generate_clothing_swap_video`
 */

import type { FirstFrameModel, SmartRepairModel } from '../../../types/productImages';

export interface AspectRatioConfig {
  primary: string[];
  more: string[];
}

const PRIMARY_DEFAULT: string[] = ['1:1', '2:3', '3:4', '9:16'];

export const SMART_REPAIR_RATIOS: AspectRatioConfig = {
  primary: PRIMARY_DEFAULT,
  // Flux supports 9 ratios; subtracting the primary 4 leaves 5 in "more"
  more: ['16:9', '3:2', '4:3', '4:5', '5:4'],
};

export const CLOTHING_SWAP_RATIOS: AspectRatioConfig = {
  primary: ['16:9', '9:16'],
  more: ['1:1', '2:3', '3:4', '4:5', '5:4', '4:3', '3:2', '21:9'],
};

export const GALLERY_RATIOS: AspectRatioConfig = {
  primary: PRIMARY_DEFAULT,
  more: ['16:9', '21:9', '3:2', '4:3', '4:5', '5:4'],
};

// `FirstFrameModel` 当前只列了 gpt-image-2 / gpt-image-1.5；如果以后扩到 gpt-image-1
// 也算进 GPT 分支，就把它加进类型 union 后这里追加。
const GPT_FIRST_FRAME_MODELS = new Set<FirstFrameModel>(['gpt-image-1.5']);

/**
 * FirstFrame 的可选比例集随当前所选模型变化。
 * - GPT 系列上游只支持 3 个比例，全部放主行，没有「更多」
 * - 其它模型（默认 Nano Banana Pro，可能扩展到 Flux 系列）按 PRIMARY_DEFAULT + Nano Banana 全集
 *
 * 切换模型时如果当前 `aspectRatio` 不在新模型的支持集里，调用方应在
 * `formData.model` 变化的副作用里 fallback 到 `primary[0]`。FirstFrameForm 已经
 * 通过 `normalizeFirstFrameAspectRatio` 完成了这个 fallback，picker 不重复。
 */
export function firstFrameRatiosForModel(model?: FirstFrameModel): AspectRatioConfig {
  if (model && GPT_FIRST_FRAME_MODELS.has(model)) {
    return { primary: ['1:1', '3:2', '2:3'], more: [] };
  }
  return {
    primary: PRIMARY_DEFAULT,
    more: ['16:9', '21:9', '3:2', '4:3', '4:5', '5:4'],
  };
}

/**
 * 比例对应的描述词，仅在「更多比例」popover 内附在数字后面（chip 行只显示数字）。
 * 横竖共用一个描述词：16:9 / 9:16 都是「宽屏」，只是横竖朝向不同。
 */
const RATIO_DESCRIPTORS_ZH: Record<string, string> = {
  '21:9': '超宽',
  '16:9': '宽屏',
  '4:3': '标准',
  '3:2': '经典',
  '5:4': '近横',
  '9:16': '宽屏',
  '3:4': '标准',
  '2:3': '经典',
  '4:5': '近竖',
};

const RATIO_DESCRIPTORS_EN: Record<string, string> = {
  '21:9': 'Ultra-wide',
  '16:9': 'Widescreen',
  '4:3': 'Standard',
  '3:2': 'Classic',
  '5:4': 'Near-square',
  '9:16': 'Widescreen',
  '3:4': 'Standard',
  '2:3': 'Classic',
  '4:5': 'Near-square',
};

export function ratioDescriptorsForLanguage(language: string): Record<string, string> {
  return language === 'zh' ? RATIO_DESCRIPTORS_ZH : RATIO_DESCRIPTORS_EN;
}

/**
 * AI 智能修复在 3 个模型间的比例适配：
 *  - gpt-image-1.5 → 上游只支持 3 个 (1:1 / 3:2 / 2:3)
 *  - nano-banana-pro / flux-2-pro → 沿用 SMART_REPAIR_RATIOS 的 9 比例
 */
const GPT_SMART_REPAIR_MODELS = new Set<SmartRepairModel>(['gpt-image-1.5']);

export function smartRepairRatiosForModel(model?: SmartRepairModel): AspectRatioConfig {
  if (model && GPT_SMART_REPAIR_MODELS.has(model)) {
    return { primary: ['1:1', '3:2', '2:3'], more: [] };
  }
  return SMART_REPAIR_RATIOS;
}

/** 切换模型时若当前 aspectRatio 不在新模型支持集，落到 primary[0]。 */
export function normalizeSmartRepairAspectRatio(curr: string, model?: SmartRepairModel): string {
  const cfg = smartRepairRatiosForModel(model);
  const allowed = new Set<string>([...cfg.primary, ...cfg.more]);
  return allowed.has(curr) ? curr : cfg.primary[0];
}
