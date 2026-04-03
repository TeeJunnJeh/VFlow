export type SeedanceReplayMediaKind = 'image' | 'video' | 'audio';

export type SeedanceReplayParsedAsset = {
  file: File;
  name: string;
  mediaKind: SeedanceReplayMediaKind;
  mimeType: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fps: number | null;
};

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

const loadImageFileMetadata = (file: File): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
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
    reject(new Error(`无法读取图片信息：${file.name}`));
  };

  image.src = objectUrl;
});

const loadVideoFileMetadata = (file: File): Promise<{ width: number; height: number; durationSeconds: number; fps: number | null }> => new Promise((resolve, reject) => {
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
      reject(new Error(`无法读取视频时长：${file.name}`));
      return;
    }
    resolve({ width, height, durationSeconds, fps: null });
  };

  video.onerror = () => {
    cleanup();
    reject(new Error(`无法读取视频信息：${file.name}`));
  };

  video.src = objectUrl;
});

const loadAudioFileMetadata = (file: File): Promise<{ durationSeconds: number }> => new Promise((resolve, reject) => {
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
      reject(new Error(`无法读取音频时长：${file.name}`));
      return;
    }
    resolve({ durationSeconds });
  };

  audio.onerror = () => {
    cleanup();
    reject(new Error(`无法读取音频信息：${file.name}`));
  };

  audio.src = objectUrl;
});

export const parseSeedanceReplayLocalFile = async (
  inputFile: File,
  options: {
    inferMediaKind: (value: { name?: string | null; url?: string | null; type?: string | null; file?: File | null }) => SeedanceReplayMediaKind | 'file';
    compressImage?: (file: File) => Promise<File> | File;
  },
): Promise<SeedanceReplayParsedAsset> => {
  const rawMediaKind = options.inferMediaKind({ name: inputFile.name, file: inputFile });
  if (rawMediaKind !== 'image' && rawMediaKind !== 'video' && rawMediaKind !== 'audio') {
    throw new Error(`格式不支持：${inputFile.name}`);
  }

  const extension = getFileExtension(inputFile.name);
  const shouldCompressImage = rawMediaKind === 'image' && ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
  const file = shouldCompressImage && options.compressImage
    ? await options.compressImage(inputFile)
    : inputFile;

  if (rawMediaKind === 'image') {
    const { width, height } = await loadImageFileMetadata(file);
    return {
      file,
      name: file.name,
      mediaKind: 'image',
      mimeType: file.type || null,
      sizeBytes: file.size,
      width,
      height,
      durationSeconds: null,
      fps: null,
    };
  }

  if (rawMediaKind === 'video') {
    const { width, height, durationSeconds, fps } = await loadVideoFileMetadata(file);
    return {
      file,
      name: file.name,
      mediaKind: 'video',
      mimeType: file.type || null,
      sizeBytes: file.size,
      width,
      height,
      durationSeconds,
      fps,
    };
  }

  const { durationSeconds } = await loadAudioFileMetadata(file);
  return {
    file,
    name: file.name,
    mediaKind: 'audio',
    mimeType: file.type || null,
    sizeBytes: file.size,
    width: null,
    height: null,
    durationSeconds,
    fps: null,
  };
};

export const validateSeedanceReplayParsedAsset = (asset: SeedanceReplayParsedAsset) => {
  const extension = getFileExtension(asset.name);
  const ratio = asset.width && asset.height ? asset.width / asset.height : null;
  const duration = asset.durationSeconds ?? 0;

  if (asset.mediaKind === 'image') {
    if (!SEEDANCE_REPLAY_IMAGE_EXTS.includes(extension)) {
      return `图片格式不支持：${asset.name}。支持 jpeg / png / webp / bmp / tiff / gif`;
    }
    if (asset.sizeBytes >= SEEDANCE_REPLAY_IMAGE_MAX_BYTES) {
      return `图片大小不能超过 30MB：${asset.name}`;
    }
    if (!asset.width || !asset.height || asset.width < SEEDANCE_REPLAY_DIMENSION_MIN || asset.width > SEEDANCE_REPLAY_DIMENSION_MAX || asset.height < SEEDANCE_REPLAY_DIMENSION_MIN || asset.height > SEEDANCE_REPLAY_DIMENSION_MAX) {
      return `图片宽高需在 ${SEEDANCE_REPLAY_DIMENSION_MIN}-${SEEDANCE_REPLAY_DIMENSION_MAX} 之间：${asset.name}`;
    }
    if (!ratio || ratio < SEEDANCE_REPLAY_RATIO_MIN || ratio > SEEDANCE_REPLAY_RATIO_MAX) {
      return `图片宽高比需在 ${SEEDANCE_REPLAY_RATIO_MIN}-${SEEDANCE_REPLAY_RATIO_MAX} 之间：${asset.name}`;
    }
    return null;
  }

  if (asset.mediaKind === 'video') {
    if (!SEEDANCE_REPLAY_VIDEO_EXTS.includes(extension)) {
      return `视频格式不支持：${asset.name}。支持 mp4 / mov`;
    }
    if (asset.sizeBytes > SEEDANCE_REPLAY_VIDEO_MAX_BYTES) {
      return `视频大小不能超过 50MB：${asset.name}`;
    }
    if (duration < SEEDANCE_REPLAY_DURATION_MIN || duration > SEEDANCE_REPLAY_DURATION_MAX) {
      return `视频时长需在 ${SEEDANCE_REPLAY_DURATION_MIN}-${SEEDANCE_REPLAY_DURATION_MAX} 秒之间：${asset.name}`;
    }
    if (!asset.width || !asset.height || asset.width < SEEDANCE_REPLAY_DIMENSION_MIN || asset.width > SEEDANCE_REPLAY_DIMENSION_MAX || asset.height < SEEDANCE_REPLAY_DIMENSION_MIN || asset.height > SEEDANCE_REPLAY_DIMENSION_MAX) {
      return `视频宽高需在 ${SEEDANCE_REPLAY_DIMENSION_MIN}-${SEEDANCE_REPLAY_DIMENSION_MAX} 之间：${asset.name}`;
    }
    if (!ratio || ratio < SEEDANCE_REPLAY_RATIO_MIN || ratio > SEEDANCE_REPLAY_RATIO_MAX) {
      return `视频宽高比需在 ${SEEDANCE_REPLAY_RATIO_MIN}-${SEEDANCE_REPLAY_RATIO_MAX} 之间：${asset.name}`;
    }
    const pixels = asset.width * asset.height;
    if (pixels < SEEDANCE_REPLAY_VIDEO_PIXELS_MIN || pixels > SEEDANCE_REPLAY_VIDEO_PIXELS_MAX) {
      return `视频总像素需在 ${SEEDANCE_REPLAY_VIDEO_PIXELS_MIN}-${SEEDANCE_REPLAY_VIDEO_PIXELS_MAX} 之间：${asset.name}`;
    }
    if (typeof asset.fps === 'number' && (asset.fps < SEEDANCE_REPLAY_VIDEO_FPS_MIN || asset.fps > SEEDANCE_REPLAY_VIDEO_FPS_MAX)) {
      return `视频帧率需在 ${SEEDANCE_REPLAY_VIDEO_FPS_MIN}-${SEEDANCE_REPLAY_VIDEO_FPS_MAX} FPS 之间：${asset.name}`;
    }
    return null;
  }

  if (!SEEDANCE_REPLAY_AUDIO_EXTS.includes(extension)) {
    return `音频格式不支持：${asset.name}。支持 wav / mp3`;
  }
  if (asset.sizeBytes > SEEDANCE_REPLAY_AUDIO_MAX_BYTES) {
    return `音频大小不能超过 15MB：${asset.name}`;
  }
  if (duration < SEEDANCE_REPLAY_DURATION_MIN || duration > SEEDANCE_REPLAY_DURATION_MAX) {
    return `音频时长需在 ${SEEDANCE_REPLAY_DURATION_MIN}-${SEEDANCE_REPLAY_DURATION_MAX} 秒之间：${asset.name}`;
  }
  return null;
};

export const buildSeedanceReplayValidationSummary = <T extends SeedanceReplayValidationAsset>(assets: T[]): SeedanceReplayValidationSummary => {
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

  const imageErrors = uniqueMessages([
    ...(imageAssets.length > SEEDANCE_REPLAY_IMAGE_LIMIT ? [`图片数量超过限制（${imageAssets.length}/${SEEDANCE_REPLAY_IMAGE_LIMIT}）`] : []),
    ...(totalImageBytes > SEEDANCE_REPLAY_IMAGE_TOTAL_BYTES_LIMIT ? [`图片总大小超过限制（${formatMegabytes(totalImageBytes)}/64MB）`] : []),
    ...imageAssets.flatMap((asset) => asset.validationMessages || []),
  ]);
  const videoErrors = uniqueMessages([
    ...(videoAssets.length > SEEDANCE_REPLAY_VIDEO_LIMIT ? [`视频数量超过限制（${videoAssets.length}/${SEEDANCE_REPLAY_VIDEO_LIMIT}）`] : []),
    ...(totalVideoDuration > SEEDANCE_REPLAY_DURATION_MAX ? [`视频总时长超过限制（${totalVideoDuration.toFixed(1)}s/${SEEDANCE_REPLAY_DURATION_MAX}s）`] : []),
    ...videoAssets.flatMap((asset) => asset.validationMessages || []),
  ]);
  const audioErrors = uniqueMessages([
    ...(audioAssets.length > SEEDANCE_REPLAY_AUDIO_LIMIT ? [`音频数量超过限制（${audioAssets.length}/${SEEDANCE_REPLAY_AUDIO_LIMIT}）`] : []),
    ...(totalAudioDuration > SEEDANCE_REPLAY_DURATION_MAX ? [`音频总时长超过限制（${totalAudioDuration.toFixed(1)}s/${SEEDANCE_REPLAY_DURATION_MAX}s）`] : []),
    ...(totalAudioBytes > SEEDANCE_REPLAY_AUDIO_TOTAL_BYTES_LIMIT ? [`音频总大小超过限制（${formatMegabytes(totalAudioBytes)}/64MB）`] : []),
    ...audioAssets.flatMap((asset) => asset.validationMessages || []),
  ]);
  const hasMinimumAssets = imageAssets.length > 0 || videoAssets.length > 0;
  const globalErrors = hasMinimumAssets ? [] : ['请至少上传 1 张图片或 1 个视频'];

  return {
    imageErrors,
    videoErrors,
    audioErrors,
    globalErrors,
    hasMinimumAssets,
    hasBlockingIssues: imageErrors.length > 0 || videoErrors.length > 0 || audioErrors.length > 0 || globalErrors.length > 0,
  };
};
