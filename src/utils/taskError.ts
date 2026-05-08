import { ApiError } from '../services/errors';

const DEFAULT_VIDEO_ERROR = '生成失败，请更换素材或稍后重试。';
const DEFAULT_SCRIPT_ERROR = '脚本提取失败，请更换视频素材或稍后重试。';

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const nestedString = (record: Record<string, unknown> | null, path: string[]): string => {
  let cursor: unknown = record;
  for (const key of path) {
    const current = asRecord(cursor);
    if (!current) return '';
    cursor = current[key];
  }
  return readString(cursor);
};

const looksTechnical = (message: string): boolean => {
  const value = message.trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    value.startsWith('{') ||
    value.startsWith('[') ||
    lower.includes('[debug') ||
    lower.includes('arkchat') ||
    lower.includes('badrequesterror') ||
    lower.includes('error code:') ||
    lower.includes('http 400') ||
    lower.includes('http 500') ||
    lower.includes('traceback') ||
    lower.includes('request failed') ||
    lower.includes('invalid video_url') ||
    /"(error|message|code|request_id)"\s*:/.test(value)
  );
};

const fallbackFromText = (message: string, fallback: string): string => {
  const lower = message.toLowerCase();
  if (
    lower.includes('inputvideosensitivecontentdetected') ||
    lower.includes('input video') ||
    lower.includes('video may contain') ||
    lower.includes('reference_video') ||
    lower.includes('video_rejected')
  ) {
    return '参考视频中含有真人或隐私信息，未通过 Seedance 视频审核。可以更换参考视频，或先提取脚本后生成。';
  }
  if (lower.includes('invalid video_url') || lower.includes('video_url')) {
    return '参考视频无法被脚本提取服务访问。请确认 ngrok 隧道正在运行，或更换公网可访问的视频素材。';
  }
  if (lower.includes('inputimagesensitivecontentdetected') || lower.includes('privacyinformation') || lower.includes('real person')) {
    return '商品图不合规（有人像），请更换不含真人或隐私信息的商品图。';
  }
  if (lower.includes('insufficient') || lower.includes('credit') || lower.includes('余额') || lower.includes('v点')) {
    return 'V点不足，请充值后重试。';
  }
  return fallback;
};

export const normalizeTaskError = (result: unknown, fallback = DEFAULT_VIDEO_ERROR): string => {
  const record = asRecord(result);
  const candidates = [
    readString(record?.user_error),
    nestedString(record, ['error_classification', 'user_message']),
    nestedString(record, ['error_classification', 'safe_message']),
    readString(record?.message),
    readString(record?.error),
  ].filter(Boolean);

  const message = candidates.find((candidate) => !looksTechnical(candidate)) || candidates[0] || fallback;
  return looksTechnical(message) ? fallbackFromText(message, fallback) : message;
};

export const normalizeApiError = (error: unknown, fallback = DEFAULT_VIDEO_ERROR): string => {
  if (error instanceof ApiError) {
    const data = asRecord(error.data);
    const candidates = [
      readString(data?.user_error),
      nestedString(data, ['error_classification', 'user_message']),
      nestedString(data, ['error_classification', 'safe_message']),
      readString(error.message),
    ].filter(Boolean);
    const message = candidates.find((candidate) => !looksTechnical(candidate)) || candidates[0] || fallback;
    return looksTechnical(message) ? fallbackFromText(message, fallback) : message;
  }
  const raw = readString((error as any)?.message) || readString(error);
  if (!raw) return fallback;
  return looksTechnical(raw) ? fallbackFromText(raw, fallback) : raw;
};

export const normalizeScriptError = (error: unknown): string => normalizeApiError(error, DEFAULT_SCRIPT_ERROR);
