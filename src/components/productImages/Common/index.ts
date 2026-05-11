/**
 * 商品图片生成 - 共用组件导出
 */

export { ImageUploader } from './ImageUploader';
export {
  AssetLibraryPickerDialog,
  type AssetLibraryPickedAsset,
  type AssetLibraryPickerTabConfig,
} from './AssetLibraryPickerDialog';
export { LoadingProgress } from './LoadingProgress';
export { ErrorDialog, type ErrorInfo, type ErrorSeverity } from './ErrorDialog';
export { AspectRatioPicker, type AspectRatioPickerProps, type AspectRatioPickerLabels } from './AspectRatioPicker';
export {
  type AspectRatioConfig,
  CLOTHING_SWAP_RATIOS,
  GALLERY_RATIOS,
  SMART_REPAIR_RATIOS,
  firstFrameRatiosForModel,
  smartRepairRatiosForModel,
  normalizeSmartRepairAspectRatio,
  ratioDescriptorsForLanguage,
} from './aspectRatioOptions';
export {
  ModelSelectorChips,
  DEFAULT_MODEL_SELECTOR_OPTIONS,
  type ModelSelectorValue,
  type ModelSelectorOption,
} from './ModelSelectorChips';
export { LoadingCard, type LoadingCardProps, type LoadingCardTheme } from './LoadingCard';
export { ImageDetailDialog, type ImageDetailDialogProps, type ImageDetailInfoRow } from './ImageDetailDialog';
