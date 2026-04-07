import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Play,
  Plus,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import {
  SEEDANCE_REPLAY_AUDIO_MAX_BYTES,
  SEEDANCE_REPLAY_AUDIO_LIMIT,
  SEEDANCE_REPLAY_AUDIO_TOTAL_BYTES_LIMIT,
  SEEDANCE_REPLAY_DIMENSION_MAX,
  SEEDANCE_REPLAY_DIMENSION_MIN,
  SEEDANCE_REPLAY_DURATION_MIN,
  SEEDANCE_REPLAY_DURATION_MAX,
  SEEDANCE_REPLAY_IMAGE_EXTS,
  SEEDANCE_REPLAY_IMAGE_MAX_BYTES,
  SEEDANCE_REPLAY_IMAGE_LIMIT,
  SEEDANCE_REPLAY_IMAGE_TOTAL_BYTES_LIMIT,
  SEEDANCE_REPLAY_RATIO_MAX,
  SEEDANCE_REPLAY_RATIO_MIN,
  SEEDANCE_REPLAY_VIDEO_EXTS,
  SEEDANCE_REPLAY_VIDEO_FPS_MAX,
  SEEDANCE_REPLAY_VIDEO_FPS_MIN,
  SEEDANCE_REPLAY_VIDEO_MAX_BYTES,
  SEEDANCE_REPLAY_VIDEO_LIMIT,
  SEEDANCE_REPLAY_VIDEO_PIXELS_MAX,
  SEEDANCE_REPLAY_VIDEO_PIXELS_MIN,
  type SeedanceReplayMediaKind,
  type SeedanceReplayValidationSummary,
} from './seedanceReplayUploadRules';

type SourceType = 'library' | 'local';
type MediaKind = 'image' | 'video' | 'audio';
type TooltipAlign = 'left' | 'center' | 'right';

export type SeedanceReplayUploadAsset = {
  id: string;
  name: string;
  mediaKind: MediaKind;
  source: SourceType;
  previewUrl?: string | null;
  durationSeconds?: number | null;
};

type SeedanceReplayUploadPanelProps = {
  assets: SeedanceReplayUploadAsset[];
  validationSummary?: SeedanceReplayValidationSummary;
  focusTarget?: 'top' | SeedanceReplayMediaKind | null;
  onAddFromLibrary?: (targetMediaKind?: SeedanceReplayMediaKind) => void;
  onAddFromLocal?: (targetMediaKind?: SeedanceReplayMediaKind) => void;
  onPreview?: (assetId: string) => void;
  onRemove?: (assetId: string) => void;
};

const noop = () => {};
const FILE_SIZE_MB = 1024 * 1024;
const tooltipBaseClass = 'pointer-events-none absolute top-full mt-2 w-[240px] rounded-2xl border border-white/20 bg-zinc-950/90 p-3 text-left opacity-0 shadow-2xl shadow-black/40 backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100 z-20';
const normalizedFormatLabelMap: Record<string, string> = {
  jpg: 'jpeg',
  tif: 'tiff',
};

function formatSeconds(value: number) {
  return `${value.toFixed(1)}s`;
}

function formatMegabytes(value: number) {
  return `${Math.round(value / FILE_SIZE_MB)}MB`;
}

function formatExtensions(exts: string[]) {
  return Array.from(new Set(exts.map((ext) => normalizedFormatLabelMap[ext] || ext))).join('/');
}

function formatText(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function getSourceLabelMap(t: any): Record<SourceType, string> {
  return {
    library: t.wb_seedance_replay_source_library || 'Library',
    local: t.wb_seedance_replay_source_local || 'Local',
  };
}

function getMediaTooltipItems(t: any): Record<MediaKind, string[]> {
  return {
    image: [
      formatText(t.wb_seedance_replay_tip_format || 'Format: {formats}', { formats: formatExtensions(SEEDANCE_REPLAY_IMAGE_EXTS) }),
      formatText(t.wb_seedance_replay_tip_single_size_lt || 'Single item < {size}', { size: formatMegabytes(SEEDANCE_REPLAY_IMAGE_MAX_BYTES) }),
      formatText(t.wb_seedance_replay_tip_dimensions || 'Dimensions {min}-{max}', { min: SEEDANCE_REPLAY_DIMENSION_MIN, max: SEEDANCE_REPLAY_DIMENSION_MAX }),
      formatText(t.wb_seedance_replay_tip_ratio || 'Aspect ratio {min}-{max}', { min: SEEDANCE_REPLAY_RATIO_MIN, max: SEEDANCE_REPLAY_RATIO_MAX }),
      formatText(t.wb_seedance_replay_tip_total_size || 'Total size <= {size}', { size: formatMegabytes(SEEDANCE_REPLAY_IMAGE_TOTAL_BYTES_LIMIT) }),
    ],
    video: [
      formatText(t.wb_seedance_replay_tip_format || 'Format: {formats}', { formats: formatExtensions(SEEDANCE_REPLAY_VIDEO_EXTS) }),
      formatText(t.wb_seedance_replay_tip_single_size_lte || 'Single item <= {size}', { size: formatMegabytes(SEEDANCE_REPLAY_VIDEO_MAX_BYTES) }),
      formatText(t.wb_seedance_replay_tip_duration || 'Duration {min}-{max}s', { min: SEEDANCE_REPLAY_DURATION_MIN, max: SEEDANCE_REPLAY_DURATION_MAX }),
      formatText(t.wb_seedance_replay_tip_dimensions || 'Dimensions {min}-{max}', { min: SEEDANCE_REPLAY_DIMENSION_MIN, max: SEEDANCE_REPLAY_DIMENSION_MAX }),
      formatText(t.wb_seedance_replay_tip_ratio || 'Aspect ratio {min}-{max}', { min: SEEDANCE_REPLAY_RATIO_MIN, max: SEEDANCE_REPLAY_RATIO_MAX }),
      formatText(t.wb_seedance_replay_tip_pixels || 'Total pixels {min}-{max}', { min: SEEDANCE_REPLAY_VIDEO_PIXELS_MIN, max: SEEDANCE_REPLAY_VIDEO_PIXELS_MAX }),
      formatText(t.wb_seedance_replay_tip_fps || 'FPS {min}-{max}', { min: SEEDANCE_REPLAY_VIDEO_FPS_MIN, max: SEEDANCE_REPLAY_VIDEO_FPS_MAX }),
      formatText(t.wb_seedance_replay_tip_total_duration || 'Total duration <= {duration}s', { duration: SEEDANCE_REPLAY_DURATION_MAX }),
    ],
    audio: [
      formatText(t.wb_seedance_replay_tip_format || 'Format: {formats}', { formats: 'wav/mp3' }),
      formatText(t.wb_seedance_replay_tip_single_size_lte || 'Single item <= {size}', { size: formatMegabytes(SEEDANCE_REPLAY_AUDIO_MAX_BYTES) }),
      formatText(t.wb_seedance_replay_tip_duration || 'Duration {min}-{max}s', { min: SEEDANCE_REPLAY_DURATION_MIN, max: SEEDANCE_REPLAY_DURATION_MAX }),
      formatText(t.wb_seedance_replay_tip_total_duration || 'Total duration <= {duration}s', { duration: SEEDANCE_REPLAY_DURATION_MAX }),
      formatText(t.wb_seedance_replay_tip_total_size || 'Total size <= {size}', { size: formatMegabytes(SEEDANCE_REPLAY_AUDIO_TOTAL_BYTES_LIMIT) }),
    ],
  };
}

function tooltipAlignClass(align: TooltipAlign) {
  if (align === 'left') return 'left-0 translate-x-0';
  if (align === 'right') return 'right-0 left-auto translate-x-0';
  return 'left-1/2 -translate-x-1/2';
}

const shakeAnimationStyle: React.CSSProperties = {
  animation: 'seedanceReplayShake 520ms ease-in-out 2',
};

export function SeedanceReplayUploadPanel({
  assets,
  validationSummary,
  focusTarget = null,
  onAddFromLibrary = noop,
  onAddFromLocal = noop,
  onPreview = noop,
  onRemove = noop,
}: SeedanceReplayUploadPanelProps) {
  const { t } = useLanguage();
  const topRef = useRef<HTMLDivElement>(null);
  const imageCardRef = useRef<HTMLDivElement>(null);
  const videoCardRef = useRef<HTMLDivElement>(null);
  const audioCardRef = useRef<HTMLDivElement>(null);
  const [flashTarget, setFlashTarget] = useState<'top' | SeedanceReplayMediaKind | null>(null);
  const imageAssets = assets.filter((asset) => asset.mediaKind === 'image');
  const videoAssets = assets.filter((asset) => asset.mediaKind === 'video');
  const audioAssets = assets.filter((asset) => asset.mediaKind === 'audio');
  const mediaTooltipItems = getMediaTooltipItems(t);

  const imageCount = imageAssets.length;
  const videoCount = videoAssets.length;
  const audioCount = audioAssets.length;
  const videoTotalDuration = videoAssets.reduce((sum, asset) => sum + (asset.durationSeconds || 0), 0);
  const audioTotalDuration = audioAssets.reduce((sum, asset) => sum + (asset.durationSeconds || 0), 0);

  const hasContent = assets.length > 0;
  const imageErrors = validationSummary?.imageErrors || [];
  const videoErrors = validationSummary?.videoErrors || [];
  const audioErrors = validationSummary?.audioErrors || [];
  const globalErrors = validationSummary?.globalErrors || [];
  const hasMinimumAssets = validationSummary?.hasMinimumAssets ?? (imageCount > 0 || videoCount > 0);
  const hasBlockingIssues = validationSummary?.hasBlockingIssues ?? (globalErrors.length > 0 || imageErrors.length > 0 || videoErrors.length > 0 || audioErrors.length > 0);
  const hasSatisfiedConditions = hasMinimumAssets && !hasBlockingIssues;
  const imageOverLimit = imageErrors.length > 0;
  const videoOverLimit = videoErrors.length > 0;
  const audioOverLimit = audioErrors.length > 0;

  const handleAddFromLibrary = (targetMediaKind?: MediaKind) => {
    onAddFromLibrary(targetMediaKind);
  };

  useEffect(() => {
    if (!focusTarget) return;
    const targetRef = focusTarget === 'top'
      ? topRef
      : focusTarget === 'image'
        ? imageCardRef
        : focusTarget === 'video'
          ? videoCardRef
          : audioCardRef;
    targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashTarget(focusTarget);
    const timer = window.setTimeout(() => {
      setFlashTarget((current) => (current === focusTarget ? null : current));
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [focusTarget]);

  return (
    <div className="flex flex-col gap-3">
      <style>{`
        @keyframes seedanceReplayShake {
          0% { transform: translate3d(0, 0, 0); }
          18% { transform: translate3d(-5px, 0, 0); }
          36% { transform: translate3d(5px, 0, 0); }
          54% { transform: translate3d(-4px, 0, 0); }
          72% { transform: translate3d(4px, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
      `}</style>
      {!hasContent ? (
        <div className="glass-panel relative z-10 rounded-xl border border-dashed border-white/10 p-5 sm:p-6">
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-2">
              <RoundIcon icon={<ImageIcon className="h-4 w-4" />} label={t.wb_seedance_replay_media_image || 'Image'} tooltipItems={mediaTooltipItems.image} />
              <RoundIcon icon={<Video className="h-4 w-4" />} label={t.wb_seedance_replay_media_video || 'Video'} tooltipItems={mediaTooltipItems.video} />
              <RoundIcon icon={<Music className="h-4 w-4" />} label={t.wb_seedance_replay_media_audio || 'Audio'} tooltipItems={mediaTooltipItems.audio} />
            </div>

            <h3 className="text-base font-bold text-zinc-100">{t.wb_seedance_replay_add_reference_title || 'Add Reference Assets'}</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              {t.wb_seedance_replay_add_reference_desc || 'Add images, videos, and audio together; the system will organize them automatically.'}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <PrimaryButton onClick={() => handleAddFromLibrary()}>
                <FolderOpen className="h-3.5 w-3.5" />
                {t.wb_seedance_replay_choose_from_library || 'Choose From Library'}
              </PrimaryButton>
              <SecondaryButton onClick={() => onAddFromLocal()}>
                <Upload className="h-3.5 w-3.5" />
                {t.wb_seedance_replay_upload_local || 'Upload Local Files'}
              </SecondaryButton>
            </div>

          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-xl border border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-zinc-500">
              {t.wb_seedance_replay_quick_add || 'Quick Add'}
              <span className="ml-1 font-medium text-zinc-500/80">
                {t.wb_seedance_replay_quick_add_hint || '(Supports mixed additions, auto-classified by system)'}
              </span>
            </span>
            <PrimaryButton onClick={() => handleAddFromLibrary()}>
              <FolderOpen className="h-3.5 w-3.5" />
              {t.wb_seedance_replay_choose_from_library || 'Choose From Library'}
            </PrimaryButton>
            <SecondaryButton onClick={() => onAddFromLocal()}>
              <Upload className="h-3.5 w-3.5" />
              {t.wb_seedance_replay_upload_local || 'Upload Local Files'}
            </SecondaryButton>
          </div>
        </div>
      )}

      <div
        ref={topRef}
        style={flashTarget === 'top' ? shakeAnimationStyle : undefined}
        className={`glass-panel rounded-xl border px-3 py-3 transition-all duration-300 ${
          flashTarget === 'top'
            ? 'border-orange-400/70 ring-2 ring-orange-400/40 shadow-[0_0_0_1px_rgba(251,146,60,0.35),0_0_28px_rgba(251,146,60,0.14)]'
            : 'border-white/10'
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300 lg:gap-5">
            <StatusMetric icon={<ImageIcon className="h-3.5 w-3.5 text-zinc-500" />} label={t.wb_seedance_replay_media_image || 'Image'} value={imageCount} limit={SEEDANCE_REPLAY_IMAGE_LIMIT} error={imageOverLimit} />
            <MetricDivider />
            <StatusMetric
              icon={<Video className="h-3.5 w-3.5 text-zinc-500" />}
              label={t.wb_seedance_replay_media_video || 'Video'}
              value={videoCount}
              limit={SEEDANCE_REPLAY_VIDEO_LIMIT}
              duration={formatSeconds(videoTotalDuration)}
              durationLimit={`${SEEDANCE_REPLAY_DURATION_MAX}s`}
              error={videoOverLimit}
            />
            <MetricDivider />
            <StatusMetric
              icon={<Music className="h-3.5 w-3.5 text-zinc-500" />}
              label={t.wb_seedance_replay_media_audio || 'Audio'}
              value={audioCount}
              limit={SEEDANCE_REPLAY_AUDIO_LIMIT}
              duration={formatSeconds(audioTotalDuration)}
              durationLimit={`${SEEDANCE_REPLAY_DURATION_MAX}s`}
              error={audioOverLimit}
            />
          </div>

          <div className={`flex items-center gap-2 text-xs font-medium ${hasSatisfiedConditions ? 'text-emerald-400' : 'text-zinc-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${hasSatisfiedConditions ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
            {hasSatisfiedConditions
              ? (t.wb_seedance_replay_conditions_ready || 'Requirements Met')
              : (t.wb_seedance_replay_conditions_pending || 'Requirements Pending')}
          </div>
        </div>

        {(globalErrors.length > 0 || imageErrors.length > 0 || videoErrors.length > 0 || audioErrors.length > 0) && (
          <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
            {globalErrors.map((message) => (
              <p key={message} className="flex items-center gap-2 text-xs text-orange-300">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                {message}
              </p>
            ))}
            {imageErrors.map((message) => (
              <p key={message} className="flex items-center gap-2 text-xs text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                {message}
              </p>
            ))}
            {videoErrors.map((message) => (
              <p key={message} className="flex items-center gap-2 text-xs text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                {message}
              </p>
            ))}
            {audioErrors.map((message) => (
              <p key={message} className="flex items-center gap-2 text-xs text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                {message}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <CategoryCard
          containerRef={imageCardRef}
          highlighted={flashTarget === 'image'}
          title={t.wb_seedance_replay_ref_images || 'Reference Images'}
          icon={<ImageIcon className="h-4 w-4" />}
          items={imageAssets}
          count={imageCount}
          limit={SEEDANCE_REPLAY_IMAGE_LIMIT}
          exceedsLimit={imageOverLimit}
          errorMessages={imageErrors}
          onAddFromLibrary={() => handleAddFromLibrary('image')}
          onAddFromLocal={() => onAddFromLocal('image')}
          onPreview={onPreview}
          onRemove={onRemove}
        />
        <CategoryCard
          containerRef={videoCardRef}
          highlighted={flashTarget === 'video'}
          title={t.wb_seedance_replay_ref_videos || 'Reference Videos'}
          icon={<Video className="h-4 w-4" />}
          items={videoAssets}
          count={videoCount}
          limit={SEEDANCE_REPLAY_VIDEO_LIMIT}
          totalDuration={videoTotalDuration}
          durationLimit={SEEDANCE_REPLAY_DURATION_MAX}
          exceedsLimit={videoOverLimit}
          errorMessages={videoErrors}
          onAddFromLibrary={() => handleAddFromLibrary('video')}
          onAddFromLocal={() => onAddFromLocal('video')}
          onPreview={onPreview}
          onRemove={onRemove}
        />
        <CategoryCard
          containerRef={audioCardRef}
          highlighted={flashTarget === 'audio'}
          title={t.wb_seedance_replay_ref_audio || 'Reference Audio'}
          icon={<Music className="h-4 w-4" />}
          items={audioAssets}
          count={audioCount}
          limit={SEEDANCE_REPLAY_AUDIO_LIMIT}
          totalDuration={audioTotalDuration}
          durationLimit={SEEDANCE_REPLAY_DURATION_MAX}
          exceedsLimit={audioOverLimit}
          errorMessages={audioErrors}
          onAddFromLibrary={() => handleAddFromLibrary('audio')}
          onAddFromLocal={() => onAddFromLocal('audio')}
          onPreview={onPreview}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}

function RoundIcon({
  icon,
  label,
  tooltipItems,
  tooltipAlign = 'center',
}: {
  icon: React.ReactNode;
  label?: string;
  tooltipItems?: string[];
  tooltipAlign?: TooltipAlign;
}) {
  const hasTooltip = Boolean(label && tooltipItems?.length);

  return (
    <div className="group relative">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
        tabIndex={hasTooltip ? 0 : -1}
        aria-label={label}
      >
        {icon}
      </div>
      {hasTooltip && (
        <div className={`${tooltipBaseClass} ${tooltipAlignClass(tooltipAlign)}`}>
          <div className="text-[11px] font-bold text-white/90">{label}</div>
          <div className="mt-1 space-y-1 text-[10px] leading-relaxed text-zinc-200/80">
            {tooltipItems!.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition hover:border-white/30 hover:bg-white/[0.08]"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition hover:border-white/30 hover:bg-white/[0.08]"
    >
      {children}
    </button>
  );
}

function StatusMetric({
  icon,
  label,
  value,
  limit,
  duration,
  durationLimit,
  error,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  limit: number;
  duration?: string;
  durationLimit?: string;
  error?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs text-zinc-300">
        {label} <span className={value > limit || error ? 'text-orange-300' : 'text-zinc-100'}>{value}</span>/{limit}
      </span>
      {duration && durationLimit && (
        <span className="text-[11px] text-zinc-500">
          <span className={error ? 'text-red-400' : 'text-zinc-400'}>{duration}</span>/{durationLimit}
        </span>
      )}
    </div>
  );
}

function MetricDivider() {
  return <div className="hidden h-3.5 w-px bg-white/10 sm:block" />;
}

type CategoryCardProps = {
  title: string;
  icon: React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  highlighted?: boolean;
  items: SeedanceReplayUploadAsset[];
  count: number;
  limit: number;
  totalDuration?: number;
  durationLimit?: number;
  exceedsLimit?: boolean;
  errorMessages?: string[];
  onAddFromLibrary: () => void;
  onAddFromLocal: () => void;
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
};

function CategoryCard({
  title,
  icon,
  containerRef,
  highlighted = false,
  items,
  count,
  limit,
  totalDuration,
  durationLimit,
  exceedsLimit,
  errorMessages = [],
  onAddFromLibrary,
  onAddFromLocal,
  onPreview,
  onRemove,
}: CategoryCardProps) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const isEmpty = items.length === 0;

  return (
    <div
      ref={containerRef}
      style={highlighted ? shakeAnimationStyle : undefined}
      className={`glass-panel rounded-xl border p-3.5 transition-all duration-300 ${
        highlighted
          ? 'border-orange-400/70 ring-2 ring-orange-400/40 shadow-[0_0_0_1px_rgba(251,146,60,0.35),0_0_28px_rgba(251,146,60,0.14)]'
          : exceedsLimit
            ? 'border-red-500/40'
            : 'border-white/10'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="text-zinc-400">{icon}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
              <span className="text-xs text-zinc-500">
                {count}/{limit}
                {typeof totalDuration === 'number' && typeof durationLimit === 'number' ? (
                  <span className="ml-2">
                    <span className={exceedsLimit ? 'text-red-400' : 'text-zinc-400'}>{formatSeconds(totalDuration)}</span>/{durationLimit}s
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-1.5">
          <MiniIconButton onClick={() => setMenuOpen((prev) => !prev)}>
            <Plus className="h-3.5 w-3.5" />
          </MiniIconButton>

          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onAddFromLibrary();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/5"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {t.wb_seedance_replay_add_from_library || 'Add From Library'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onAddFromLocal();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/5"
              >
                <Upload className="h-3.5 w-3.5" />
                {t.wb_seedance_replay_add_from_local || 'Add Local Files'}
              </button>
            </div>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-8 text-center text-xs leading-5 text-zinc-500">
          {t.wb_seedance_replay_empty_hint || 'Click \"+\" to choose from the library or upload local files.'}
        </div>
      ) : items[0].mediaKind === 'image' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ImageCard key={item.id} item={item} onPreview={onPreview} onRemove={onRemove} />
          ))}
        </div>
      ) : items[0].mediaKind === 'video' ? (
        <div className="space-y-2">
          {items.map((item) => (
            <VideoCard key={item.id} item={item} onPreview={onPreview} onRemove={onRemove} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <AudioCard key={item.id} item={item} onPreview={onPreview} onRemove={onRemove} />
          ))}
        </div>
      )}

      {errorMessages.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
          {errorMessages.map((message) => (
            <p key={message} className="flex items-center gap-2 text-xs text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              {message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniIconButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

function ImageCard({
  item,
  onPreview,
  onRemove,
}: {
  item: SeedanceReplayUploadAsset;
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
}) {
  const { t } = useLanguage();
  const sourceLabelMap = getSourceLabelMap(t);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/20">
      {item.previewUrl ? (
        <img src={item.previewUrl} alt={item.name} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-white/5" />
      )}

      <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-zinc-100 backdrop-blur">
        {sourceLabelMap[item.source]}
      </div>

      <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 opacity-0 transition group-hover:opacity-100">
        <OverlayActionButton tone="neutral" onClick={() => onPreview(item.id)}>
          <Eye className="h-3.5 w-3.5" />
        </OverlayActionButton>
        <OverlayActionButton tone="danger" onClick={() => onRemove(item.id)}>
          <X className="h-3.5 w-3.5" />
        </OverlayActionButton>
      </div>
    </div>
  );
}

function VideoCard({
  item,
  onPreview,
  onRemove,
}: {
  item: SeedanceReplayUploadAsset;
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
}) {
  const { t } = useLanguage();
  const sourceLabelMap = getSourceLabelMap(t);
  return (
    <div className="group rounded-xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex h-20 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5 sm:w-32">
          {item.previewUrl ? (
            <video src={item.previewUrl} className="h-full w-full object-cover opacity-80" muted playsInline />
          ) : null}
          <Play className="absolute h-6 w-6 text-zinc-300" />
          <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {formatSeconds(item.durationSeconds || 0)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-zinc-100">{item.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
              {sourceLabelMap[item.source]}
            </span>
            <span>{formatSeconds(item.durationSeconds || 0)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
          <OverlayActionButton tone="neutral" onClick={() => onPreview(item.id)}>
            <Eye className="h-3.5 w-3.5" />
          </OverlayActionButton>
          <OverlayActionButton tone="danger" onClick={() => onRemove(item.id)}>
            <X className="h-3.5 w-3.5" />
          </OverlayActionButton>
        </div>
      </div>
    </div>
  );
}

function AudioCard({
  item,
  onPreview,
  onRemove,
}: {
  item: SeedanceReplayUploadAsset;
  onPreview: (assetId: string) => void;
  onRemove: (assetId: string) => void;
}) {
  const { t } = useLanguage();
  const sourceLabelMap = getSourceLabelMap(t);
  return (
    <div className="group rounded-xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
          <Music className="h-5 w-5 text-zinc-300" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-zinc-100">{item.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
              {sourceLabelMap[item.source]}
            </span>
            <span>{formatSeconds(item.durationSeconds || 0)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
          <OverlayActionButton tone="neutral" onClick={() => onPreview(item.id)}>
            <Play className="h-3.5 w-3.5" />
          </OverlayActionButton>
          <OverlayActionButton tone="danger" onClick={() => onRemove(item.id)}>
            <X className="h-3.5 w-3.5" />
          </OverlayActionButton>
        </div>
      </div>
    </div>
  );
}

function OverlayActionButton({
  children,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  tone: 'neutral' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-lg border transition',
        tone === 'danger'
          ? 'border-red-500/30 bg-red-500/20 text-red-200 hover:bg-red-500 hover:text-white'
          : 'border-white/10 bg-black/40 text-white hover:bg-white/20',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
