export type SeedanceReplayMediaKind = 'image' | 'video' | 'audio';

export type SeedanceReplayParsedAsset = {
  file: File;
  name: string;
  mediaKind: SeedanceReplayMediaKind;
  format?: string | null;
  mimeType: string | null;
  sourceUrl?: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fps: number | null;
};

export type SeedanceReplayValidationCandidate = Omit<SeedanceReplayParsedAsset, 'file'>;

export type SeedanceReplayValidationAsset = {
  mediaKind?: SeedanceReplayMediaKind | 'file' | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  validationMessages?: string[] | null;
};

export type SeedanceReplayValidationSummary = {
  imageErrors: string[];
  videoErrors: string[];
  audioErrors: string[];
  globalErrors: string[];
  hasMinimumAssets: boolean;
  hasBlockingIssues: boolean;
};

const FILE_SIZE_MB = 1024 * 1024;

export const SEEDANCE_REPLAY_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'gif'];
export const SEEDANCE_REPLAY_VIDEO_EXTS = ['mp4', 'mov'];
export const SEEDANCE_REPLAY_AUDIO_EXTS = ['wav', 'mp3'];
export const SEEDANCE_REPLAY_UPLOAD_ACCEPT = [
  ...SEEDANCE_REPLAY_IMAGE_EXTS.map((ext) => `.${ext}`),
  ...SEEDANCE_REPLAY_VIDEO_EXTS.map((ext) => `.${ext}`),
  ...SEEDANCE_REPLAY_AUDIO_EXTS.map((ext) => `.${ext}`),
].join(',');
export const SEEDANCE_REPLAY_IMAGE_LIMIT = 9;
export const SEEDANCE_REPLAY_VIDEO_LIMIT = 3;
export const SEEDANCE_REPLAY_AUDIO_LIMIT = 3;
export const SEEDANCE_REPLAY_IMAGE_MAX_BYTES = 30 * FILE_SIZE_MB;
export const SEEDANCE_REPLAY_IMAGE_TOTAL_BYTES_LIMIT = 64 * FILE_SIZE_MB;
export const SEEDANCE_REPLAY_VIDEO_MAX_BYTES = 50 * FILE_SIZE_MB;
export const SEEDANCE_REPLAY_AUDIO_MAX_BYTES = 15 * FILE_SIZE_MB;
export const SEEDANCE_REPLAY_AUDIO_TOTAL_BYTES_LIMIT = 64 * FILE_SIZE_MB;
export const SEEDANCE_REPLAY_DURATION_MIN = 2;
export const SEEDANCE_REPLAY_DURATION_MAX = 15;
export const SEEDANCE_REPLAY_DIMENSION_MIN = 300;
export const SEEDANCE_REPLAY_DIMENSION_MAX = 6000;
export const SEEDANCE_REPLAY_RATIO_MIN = 0.4;
export const SEEDANCE_REPLAY_RATIO_MAX = 2.5;
export const SEEDANCE_REPLAY_VIDEO_PIXELS_MIN = 409600;
export const SEEDANCE_REPLAY_VIDEO_PIXELS_MAX = 927408;
export const SEEDANCE_REPLAY_VIDEO_FPS_MIN = 24;
export const SEEDANCE_REPLAY_VIDEO_FPS_MAX = 60;

const getFileExtension = (name: string) => name.split('.').pop()?.toLowerCase() || '';
const formatMegabytes = (bytes: number) => `${(bytes / FILE_SIZE_MB).toFixed(bytes >= 10 * FILE_SIZE_MB ? 1 : 2)}MB`;
const formatSeedanceReplayText = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
const getSeedanceReplayKindLabel = (t: any, mediaKind: SeedanceReplayMediaKind) => {
  if (mediaKind === 'image') return t?.wb_seedance_replay_media_image || 'Image';
  if (mediaKind === 'video') return t?.wb_seedance_replay_media_video || 'Video';
  return t?.wb_seedance_replay_media_audio || 'Audio';
};
const normalizeFormat = (value: string | null | undefined) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('/')) {
    const mimeMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
    };
    return mimeMap[normalized] || normalized.split('/').pop()?.split(';')[0]?.trim() || '';
  }
  return normalized.replace(/^\./, '');
};
const resolveSeedanceReplayFormat = (asset: {
  format?: string | null;
  mimeType?: string | null;
  sourceUrl?: string | null;
  name: string;
}) => {
  const formatFromField = normalizeFormat(asset.format);
  if (formatFromField) return formatFromField;
  const formatFromMime = normalizeFormat(asset.mimeType);
  if (formatFromMime) return formatFromMime;
  const formatFromUrl = getFileExtension((asset.sourceUrl || '').split('?')[0]);
  if (formatFromUrl) return formatFromUrl;
  return getFileExtension(asset.name);
};

const loadImageFileMetadata = (file: File, t?: any): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  const cleanup = () => {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(objectUrl);
  };

  image.onload = () => {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    cleanup();
    resolve({ width, height });
  };

  image.onerror = () => {
    cleanup();
    reject(new Error(formatSeedanceReplayText(
      t?.wb_seedance_replay_error_read_image_info || 'Unable to read image info: {name}',
      { name: file.name },
    )));
  };

  image.src = objectUrl;
});

const loadVideoFileMetadata = (file: File, t?: any): Promise<{ width: number; height: number; durationSeconds: number; fps: number | null }> => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  const cleanup = () => {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  };

  video.preload = 'metadata';
  video.muted = true;
  video.onloadedmetadata = () => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    const durationSeconds = Number.isFinite(video.duration) ? video.duration : NaN;
    cleanup();
    if (!Number.isFinite(durationSeconds)) {
      reject(new Error(formatSeedanceReplayText(
        t?.wb_seedance_replay_error_read_video_duration || 'Unable to read video duration: {name}',
        { name: file.name },
      )));
      return;
    }
    resolve({ width, height, durationSeconds, fps: null });
  };

  video.onerror = () => {
    cleanup();
    reject(new Error(formatSeedanceReplayText(
      t?.wb_seedance_replay_error_read_video_info || 'Unable to read video info: {name}',
      { name: file.name },
    )));
  };

  video.src = objectUrl;
});

const loadAudioFileMetadata = (file: File, t?: any): Promise<{ durationSeconds: number }> => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  const cleanup = () => {
    audio.onloadedmetadata = null;
    audio.onerror = null;
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(objectUrl);
  };

  audio.preload = 'metadata';
  audio.onloadedmetadata = () => {
    const durationSeconds = Number.isFinite(audio.duration) ? audio.duration : NaN;
    cleanup();
    if (!Number.isFinite(durationSeconds)) {
      reject(new Error(formatSeedanceReplayText(
        t?.wb_seedance_replay_error_read_audio_duration || 'Unable to read audio duration: {name}',
        { name: file.name },
      )));
      return;
    }
    resolve({ durationSeconds });
  };

  audio.onerror = () => {
    cleanup();
    reject(new Error(formatSeedanceReplayText(
      t?.wb_seedance_replay_error_read_audio_info || 'Unable to read audio info: {name}',
      { name: file.name },
    )));
  };

  audio.src = objectUrl;
});

export const parseSeedanceReplayLocalFile = async (
  inputFile: File,
  options: {
    inferMediaKind: (value: { name?: string | null; url?: string | null; type?: string | null; file?: File | null }) => SeedanceReplayMediaKind | 'file';
    compressImage?: (file: File) => Promise<File> | File;
  },
  t?: any,
): Promise<SeedanceReplayParsedAsset> => {
  const rawMediaKind = options.inferMediaKind({ name: inputFile.name, file: inputFile });
  if (rawMediaKind !== 'image' && rawMediaKind !== 'video' && rawMediaKind !== 'audio') {
    throw new Error(formatSeedanceReplayText(
      t?.wb_seedance_replay_error_unsupported_format || 'Unsupported format: {name}',
      { name: inputFile.name },
    ));
  }

  const extension = getFileExtension(inputFile.name);
  const shouldCompressImage = rawMediaKind === 'image' && ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
  const file = shouldCompressImage && options.compressImage
    ? await options.compressImage(inputFile)
    : inputFile;

  if (rawMediaKind === 'image') {
    const { width, height } = await loadImageFileMetadata(file, t);
    return {
      file,
      name: file.name,
      mediaKind: 'image',
      format: extension || null,
      mimeType: file.type || null,
      sizeBytes: file.size,
      width,
      height,
      durationSeconds: null,
      fps: null,
    };
  }

  if (rawMediaKind === 'video') {
    const { width, height, durationSeconds, fps } = await loadVideoFileMetadata(file, t);
    return {
      file,
      name: file.name,
      mediaKind: 'video',
      format: extension || null,
      mimeType: file.type || null,
      sizeBytes: file.size,
      width,
      height,
      durationSeconds,
      fps,
    };
  }

  const { durationSeconds } = await loadAudioFileMetadata(file, t);
  return {
    file,
    name: file.name,
    mediaKind: 'audio',
    format: extension || null,
    mimeType: file.type || null,
    sizeBytes: file.size,
    width: null,
    height: null,
    durationSeconds,
    fps: null,
  };
};

export const validateSeedanceReplayParsedAsset = (asset: SeedanceReplayValidationCandidate | SeedanceReplayParsedAsset, t?: any) => {
  const extension = resolveSeedanceReplayFormat(asset);
  const ratio = asset.width && asset.height ? asset.width / asset.height : null;
  const duration = asset.durationSeconds ?? 0;
  const kindLabel = getSeedanceReplayKindLabel(t, asset.mediaKind);

  if (asset.mediaKind === 'image') {
    if (!SEEDANCE_REPLAY_IMAGE_EXTS.includes(extension)) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_unsupported_format || '{kind} format not supported: {name}. Supported {formats}',
        { kind: kindLabel, name: asset.name, formats: 'jpeg / png / webp / bmp / tiff / gif' },
      );
    }
    if (asset.sizeBytes >= SEEDANCE_REPLAY_IMAGE_MAX_BYTES) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_size_limit || '{kind} size cannot exceed {size}: {name}',
        { kind: kindLabel, size: '30MB', name: asset.name },
      );
    }
    if (!asset.width || !asset.height || asset.width < SEEDANCE_REPLAY_DIMENSION_MIN || asset.width > SEEDANCE_REPLAY_DIMENSION_MAX || asset.height < SEEDANCE_REPLAY_DIMENSION_MIN || asset.height > SEEDANCE_REPLAY_DIMENSION_MAX) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_dimensions || '{kind} dimensions must be between {min}-{max}: {name}',
        { kind: kindLabel, min: SEEDANCE_REPLAY_DIMENSION_MIN, max: SEEDANCE_REPLAY_DIMENSION_MAX, name: asset.name },
      );
    }
    if (!ratio || ratio < SEEDANCE_REPLAY_RATIO_MIN || ratio > SEEDANCE_REPLAY_RATIO_MAX) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_ratio || '{kind} aspect ratio must be between {min}-{max}: {name}',
        { kind: kindLabel, min: SEEDANCE_REPLAY_RATIO_MIN, max: SEEDANCE_REPLAY_RATIO_MAX, name: asset.name },
      );
    }
    return null;
  }

  if (asset.mediaKind === 'video') {
    if (!SEEDANCE_REPLAY_VIDEO_EXTS.includes(extension)) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_unsupported_format || '{kind} format not supported: {name}. Supported {formats}',
        { kind: kindLabel, name: asset.name, formats: 'mp4 / mov' },
      );
    }
    if (asset.sizeBytes > SEEDANCE_REPLAY_VIDEO_MAX_BYTES) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_size_limit || '{kind} size cannot exceed {size}: {name}',
        { kind: kindLabel, size: '50MB', name: asset.name },
      );
    }
    if (duration < SEEDANCE_REPLAY_DURATION_MIN || duration > SEEDANCE_REPLAY_DURATION_MAX) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_duration || '{kind} duration must be between {min}-{max}s: {name}',
        { kind: kindLabel, min: SEEDANCE_REPLAY_DURATION_MIN, max: SEEDANCE_REPLAY_DURATION_MAX, name: asset.name },
      );
    }
    if (!asset.width || !asset.height || asset.width < SEEDANCE_REPLAY_DIMENSION_MIN || asset.width > SEEDANCE_REPLAY_DIMENSION_MAX || asset.height < SEEDANCE_REPLAY_DIMENSION_MIN || asset.height > SEEDANCE_REPLAY_DIMENSION_MAX) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_dimensions || '{kind} dimensions must be between {min}-{max}: {name}',
        { kind: kindLabel, min: SEEDANCE_REPLAY_DIMENSION_MIN, max: SEEDANCE_REPLAY_DIMENSION_MAX, name: asset.name },
      );
    }
    if (!ratio || ratio < SEEDANCE_REPLAY_RATIO_MIN || ratio > SEEDANCE_REPLAY_RATIO_MAX) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_ratio || '{kind} aspect ratio must be between {min}-{max}: {name}',
        { kind: kindLabel, min: SEEDANCE_REPLAY_RATIO_MIN, max: SEEDANCE_REPLAY_RATIO_MAX, name: asset.name },
      );
    }
    const pixels = asset.width * asset.height;
    if (pixels < SEEDANCE_REPLAY_VIDEO_PIXELS_MIN || pixels > SEEDANCE_REPLAY_VIDEO_PIXELS_MAX) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_pixels || '{kind} total pixels must be between {min}-{max}: {name}',
        { kind: kindLabel, min: SEEDANCE_REPLAY_VIDEO_PIXELS_MIN, max: SEEDANCE_REPLAY_VIDEO_PIXELS_MAX, name: asset.name },
      );
    }
    if (typeof asset.fps === 'number' && (asset.fps < SEEDANCE_REPLAY_VIDEO_FPS_MIN || asset.fps > SEEDANCE_REPLAY_VIDEO_FPS_MAX)) {
      return formatSeedanceReplayText(
        t?.wb_seedance_replay_error_fps || '{kind} FPS must be between {min}-{max}: {name}',
        { kind: kindLabel, min: SEEDANCE_REPLAY_VIDEO_FPS_MIN, max: SEEDANCE_REPLAY_VIDEO_FPS_MAX, name: asset.name },
      );
    }
    return null;
  }

  if (!SEEDANCE_REPLAY_AUDIO_EXTS.includes(extension)) {
    return formatSeedanceReplayText(
      t?.wb_seedance_replay_error_unsupported_format || '{kind} format not supported: {name}. Supported {formats}',
      { kind: kindLabel, name: asset.name, formats: 'wav / mp3' },
    );
  }
  if (asset.sizeBytes > SEEDANCE_REPLAY_AUDIO_MAX_BYTES) {
    return formatSeedanceReplayText(
      t?.wb_seedance_replay_error_size_limit || '{kind} size cannot exceed {size}: {name}',
      { kind: kindLabel, size: '15MB', name: asset.name },
    );
  }
  if (duration < SEEDANCE_REPLAY_DURATION_MIN || duration > SEEDANCE_REPLAY_DURATION_MAX) {
    return formatSeedanceReplayText(
      t?.wb_seedance_replay_error_duration || '{kind} duration must be between {min}-{max}s: {name}',
      { kind: kindLabel, min: SEEDANCE_REPLAY_DURATION_MIN, max: SEEDANCE_REPLAY_DURATION_MAX, name: asset.name },
    );
  }
  return null;
};

export const buildSeedanceReplayValidationSummary = <T extends SeedanceReplayValidationAsset>(assets: T[], t?: any): SeedanceReplayValidationSummary => {
  const seedanceAssets = assets.filter(
    (asset): asset is T & { mediaKind: SeedanceReplayMediaKind } =>
      asset.mediaKind === 'image' || asset.mediaKind === 'video' || asset.mediaKind === 'audio'
  );
  const imageAssets = seedanceAssets.filter((asset) => asset.mediaKind === 'image');
  const videoAssets = seedanceAssets.filter((asset) => asset.mediaKind === 'video');
  const audioAssets = seedanceAssets.filter((asset) => asset.mediaKind === 'audio');
  const uniqueMessages = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
  const sumSizeBytes = (items: SeedanceReplayValidationAsset[]) => items.reduce((sum, item) => sum + Math.max(0, item.sizeBytes ?? 0), 0);
  const sumDuration = (items: SeedanceReplayValidationAsset[]) => items.reduce((sum, item) => sum + Math.max(0, item.durationSeconds ?? 0), 0);
  const totalImageBytes = sumSizeBytes(imageAssets);
  const totalVideoDuration = sumDuration(videoAssets);
  const totalAudioDuration = sumDuration(audioAssets);
  const totalAudioBytes = sumSizeBytes(audioAssets);
  const imageKindLabel = getSeedanceReplayKindLabel(t, 'image');
  const videoKindLabel = getSeedanceReplayKindLabel(t, 'video');
  const audioKindLabel = getSeedanceReplayKindLabel(t, 'audio');

  const imageErrors = uniqueMessages([
    ...(imageAssets.length > SEEDANCE_REPLAY_IMAGE_LIMIT
      ? [formatSeedanceReplayText(
          t?.wb_seedance_replay_error_count || '{kind} count exceeds limit ({count}/{limit})',
          { kind: imageKindLabel, count: imageAssets.length, limit: SEEDANCE_REPLAY_IMAGE_LIMIT },
        )]
      : []),
    ...(totalImageBytes > SEEDANCE_REPLAY_IMAGE_TOTAL_BYTES_LIMIT
      ? [formatSeedanceReplayText(
          t?.wb_seedance_replay_error_total_size || '{kind} total size exceeds limit ({current}/{limit})',
          { kind: imageKindLabel, current: formatMegabytes(totalImageBytes), limit: '64MB' },
        )]
      : []),
    ...imageAssets.flatMap((asset) => asset.validationMessages || []),
  ]);
  const videoErrors = uniqueMessages([
    ...(videoAssets.length > SEEDANCE_REPLAY_VIDEO_LIMIT
      ? [formatSeedanceReplayText(
          t?.wb_seedance_replay_error_count || '{kind} count exceeds limit ({count}/{limit})',
          { kind: videoKindLabel, count: videoAssets.length, limit: SEEDANCE_REPLAY_VIDEO_LIMIT },
        )]
      : []),
    ...(totalVideoDuration > SEEDANCE_REPLAY_DURATION_MAX
      ? [formatSeedanceReplayText(
          t?.wb_seedance_replay_error_total_duration || '{kind} total duration exceeds limit ({current}/{limit})',
          { kind: videoKindLabel, current: `${totalVideoDuration.toFixed(1)}s`, limit: `${SEEDANCE_REPLAY_DURATION_MAX}s` },
        )]
      : []),
    ...videoAssets.flatMap((asset) => asset.validationMessages || []),
  ]);
  const audioErrors = uniqueMessages([
    ...(audioAssets.length > SEEDANCE_REPLAY_AUDIO_LIMIT
      ? [formatSeedanceReplayText(
          t?.wb_seedance_replay_error_count || '{kind} count exceeds limit ({count}/{limit})',
          { kind: audioKindLabel, count: audioAssets.length, limit: SEEDANCE_REPLAY_AUDIO_LIMIT },
        )]
      : []),
    ...(totalAudioDuration > SEEDANCE_REPLAY_DURATION_MAX
      ? [formatSeedanceReplayText(
          t?.wb_seedance_replay_error_total_duration || '{kind} total duration exceeds limit ({current}/{limit})',
          { kind: audioKindLabel, current: `${totalAudioDuration.toFixed(1)}s`, limit: `${SEEDANCE_REPLAY_DURATION_MAX}s` },
        )]
      : []),
    ...(totalAudioBytes > SEEDANCE_REPLAY_AUDIO_TOTAL_BYTES_LIMIT
      ? [formatSeedanceReplayText(
          t?.wb_seedance_replay_error_total_size || '{kind} total size exceeds limit ({current}/{limit})',
          { kind: audioKindLabel, current: formatMegabytes(totalAudioBytes), limit: '64MB' },
        )]
      : []),
    ...audioAssets.flatMap((asset) => asset.validationMessages || []),
  ]);
  const hasMinimumAssets = imageAssets.length > 0 || videoAssets.length > 0;
  const globalErrors = hasMinimumAssets
    ? []
    : [t?.wb_seedance_replay_error_min_assets || 'Please upload at least 1 image or 1 video'];

  return {
    imageErrors,
    videoErrors,
    audioErrors,
    globalErrors,
    hasMinimumAssets,
    hasBlockingIssues: imageErrors.length > 0 || videoErrors.length > 0 || audioErrors.length > 0 || globalErrors.length > 0,
  };
};
