import type { Asset } from '../../services/assets';

export type CreativeLabAssetSnapshot = {
  id: string;
  name: string;
  type: string;
  file_url: string;
  thumbnail?: string;
  media_kind?: string;
  seedance_asset_id?: string;
};

export type CreativeLabMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  status?: 'idle' | 'pending' | 'processing' | 'success' | 'failed' | 'extracting';
  assets?: CreativeLabAssetSnapshot[];
  taskId?: string | number;
  projectId?: string;
  script?: string;
  seedancePrompt?: string;
  scriptExpanded?: boolean;
  videoUrl?: string;
  downloadUrl?: string;
  coverUrl?: string;
  result?: Record<string, unknown>;
  error?: string;
  recovery?: 'reference_video_rejected' | 'product_or_model_rejected' | 'none';
};

export type CreativeLabSession = {
  id: string;
  feature: 'viral_replay' | 'script_extract';
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: CreativeLabMessage[];
};

export type CreativeLabSessionMeta = {
  id: string;
  feature: CreativeLabSession['feature'];
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview?: string;
  referenceVideoName?: string;
  resultVideoUrl?: string;
  coverUrl?: string;
};

const legacyKeyFor = (userId: string | number | undefined, feature: CreativeLabSession['feature']) =>
  `vflow_creative_lab_${feature}_${userId || 'guest'}_v1`;

const indexKeyFor = (userId: string | number | undefined, feature: CreativeLabSession['feature']) =>
  `vflow_creative_lab_${feature}_${userId || 'guest'}_sessions_v2`;

const sessionKeyFor = (userId: string | number | undefined, feature: CreativeLabSession['feature'], sessionId: string) =>
  `vflow_creative_lab_${feature}_${userId || 'guest'}_${sessionId}_v2`;

const activeKeyFor = (userId: string | number | undefined, feature: CreativeLabSession['feature']) =>
  `vflow_creative_lab_${feature}_${userId || 'guest'}_active_v2`;

const makeSessionId = (feature: CreativeLabSession['feature']) =>
  `${feature}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const fallbackTitle = (feature: CreativeLabSession['feature']) =>
  feature === 'viral_replay' ? '爆款复刻' : '脚本提取';

const createFallbackSession = (feature: CreativeLabSession['feature']): CreativeLabSession => ({
  id: makeSessionId(feature),
  feature,
  title: fallbackTitle(feature),
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [],
});

const readJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const previewText = (message: CreativeLabMessage | undefined) => {
  const value = String(message?.script || message?.seedancePrompt || message?.content || '').trim().replace(/\s+/g, ' ');
  return value.length > 72 ? `${value.slice(0, 72)}...` : value;
};

const buildSessionMeta = (session: CreativeLabSession): CreativeLabSessionMeta => {
  const lastMessage = [...session.messages].reverse().find((message) => message.role !== 'system') || session.messages[session.messages.length - 1];
  const firstAsset = session.messages.flatMap((message) => message.assets || []).find((asset) =>
    /video|motion/i.test(`${asset.media_kind || ''} ${asset.type || ''}`),
  );
  const latestVideoMessage = [...session.messages].reverse().find((message) => message.videoUrl || message.downloadUrl);
  return {
    id: session.id,
    feature: session.feature,
    title: session.title || fallbackTitle(session.feature),
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || Date.now(),
    lastMessagePreview: previewText(lastMessage),
    referenceVideoName: firstAsset?.name,
    resultVideoUrl: latestVideoMessage?.videoUrl || latestVideoMessage?.downloadUrl,
    coverUrl: latestVideoMessage?.coverUrl,
  };
};

const sortMetas = (items: CreativeLabSessionMeta[]) =>
  [...items].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

const writeSessionIndex = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
  metas: CreativeLabSessionMeta[],
) => writeJson(indexKeyFor(userId, feature), sortMetas(metas));

const ensureMigrated = (userId: string | number | undefined, feature: CreativeLabSession['feature']) => {
  if (typeof window === 'undefined') return;
  const indexKey = indexKeyFor(userId, feature);
  const existingIndex = readJson<CreativeLabSessionMeta[] | null>(indexKey, null);
  if (Array.isArray(existingIndex)) return;

  const legacyRaw = window.localStorage.getItem(legacyKeyFor(userId, feature));
  if (!legacyRaw) {
    writeJson(indexKey, []);
    return;
  }
  try {
    const parsed = JSON.parse(legacyRaw);
    if (!parsed || !Array.isArray(parsed.messages)) {
      writeJson(indexKey, []);
      return;
    }
    const now = Date.now();
    const session: CreativeLabSession = {
      id: String(parsed.id || makeSessionId(feature)),
      feature,
      title: String(parsed.title || fallbackTitle(feature)),
      createdAt: Number(parsed.createdAt || now),
      updatedAt: Number(parsed.updatedAt || now),
      messages: parsed.messages,
    };
    writeJson(sessionKeyFor(userId, feature, session.id), session);
    writeSessionIndex(userId, feature, [buildSessionMeta(session)]);
    writeJson(activeKeyFor(userId, feature), session.id);
  } catch {
    writeJson(indexKey, []);
  }
};

export const snapshotAsset = (asset: Asset): CreativeLabAssetSnapshot => ({
  id: asset.id,
  name: asset.name,
  type: asset.type,
  file_url: asset.file_url,
  thumbnail: asset.thumbnail,
  media_kind: asset.media_kind,
  seedance_asset_id: String(asset.meta_data?.seedance_asset_id || '').trim() || undefined,
});

export const loadCreativeLabSession = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
): CreativeLabSession => {
  const fallback = createFallbackSession(feature);
  if (typeof window === 'undefined') return fallback;
  ensureMigrated(userId, feature);
  const activeId = getLastActiveCreativeLabSessionId(userId, feature);
  if (activeId) return loadCreativeLabSessionById(userId, feature, activeId) || fallback;
  const latest = listCreativeLabSessions(userId, feature)[0];
  return latest ? loadCreativeLabSessionById(userId, feature, latest.id) || fallback : fallback;
};

export const saveCreativeLabSession = (userId: string | number | undefined, session: CreativeLabSession) => {
  if (typeof window === 'undefined') return;
  try {
    saveCreativeLabSessionById(userId, session);
  } catch {
    // ignore local storage failures
  }
};

export const clearCreativeLabSession = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
) => {
  if (typeof window === 'undefined') return;
  try {
    ensureMigrated(userId, feature);
    listCreativeLabSessions(userId, feature).forEach((meta) => {
      window.localStorage.removeItem(sessionKeyFor(userId, feature, meta.id));
    });
    window.localStorage.removeItem(indexKeyFor(userId, feature));
    window.localStorage.removeItem(activeKeyFor(userId, feature));
    window.localStorage.removeItem(legacyKeyFor(userId, feature));
  } catch {
    // ignore local storage failures
  }
};

export const listCreativeLabSessions = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
): CreativeLabSessionMeta[] => {
  if (typeof window === 'undefined') return [];
  ensureMigrated(userId, feature);
  const metas = readJson<CreativeLabSessionMeta[]>(indexKeyFor(userId, feature), []);
  return sortMetas(metas.filter((meta) => meta && meta.id && meta.feature === feature));
};

export const loadCreativeLabSessionById = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
  sessionId: string,
): CreativeLabSession | null => {
  if (typeof window === 'undefined' || !sessionId) return null;
  ensureMigrated(userId, feature);
  const parsed = readJson<CreativeLabSession | null>(sessionKeyFor(userId, feature, sessionId), null);
  if (!parsed || !Array.isArray(parsed.messages)) return null;
  return {
    ...parsed,
    id: String(parsed.id || sessionId),
    feature,
    title: String(parsed.title || fallbackTitle(feature)),
    createdAt: Number(parsed.createdAt || Date.now()),
    updatedAt: Number(parsed.updatedAt || Date.now()),
    messages: parsed.messages,
  };
};

export const saveCreativeLabSessionById = (
  userId: string | number | undefined,
  session: CreativeLabSession,
) => {
  if (typeof window === 'undefined') return;
  ensureMigrated(userId, session.feature);
  const normalized: CreativeLabSession = {
    ...session,
    id: session.id || makeSessionId(session.feature),
    title: session.title || fallbackTitle(session.feature),
    updatedAt: Date.now(),
  };
  writeJson(sessionKeyFor(userId, normalized.feature, normalized.id), normalized);
  const existing = listCreativeLabSessions(userId, normalized.feature).filter((meta) => meta.id !== normalized.id);
  writeSessionIndex(userId, normalized.feature, [buildSessionMeta(normalized), ...existing]);
  setLastActiveCreativeLabSessionId(userId, normalized.feature, normalized.id);
};

export const createCreativeLabSession = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
  initial?: Partial<CreativeLabSession>,
): CreativeLabSession => {
  const now = Date.now();
  const session: CreativeLabSession = {
    id: initial?.id || makeSessionId(feature),
    feature,
    title: initial?.title || fallbackTitle(feature),
    createdAt: initial?.createdAt || now,
    updatedAt: initial?.updatedAt || now,
    messages: initial?.messages || [],
  };
  saveCreativeLabSessionById(userId, session);
  return session;
};

export const deleteCreativeLabSession = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
  sessionId: string,
) => {
  if (typeof window === 'undefined' || !sessionId) return;
  ensureMigrated(userId, feature);
  try {
    window.localStorage.removeItem(sessionKeyFor(userId, feature, sessionId));
    const remaining = listCreativeLabSessions(userId, feature).filter((meta) => meta.id !== sessionId);
    writeSessionIndex(userId, feature, remaining);
    if (getLastActiveCreativeLabSessionId(userId, feature) === sessionId) {
      if (remaining[0]) setLastActiveCreativeLabSessionId(userId, feature, remaining[0].id);
      else window.localStorage.removeItem(activeKeyFor(userId, feature));
    }
  } catch {
    // ignore local storage failures
  }
};

export const renameCreativeLabSession = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
  sessionId: string,
  title: string,
) => {
  const session = loadCreativeLabSessionById(userId, feature, sessionId);
  if (!session) return;
  saveCreativeLabSessionById(userId, { ...session, title: title.trim() || fallbackTitle(feature) });
};

export const getLastActiveCreativeLabSessionId = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
) => {
  if (typeof window === 'undefined') return '';
  return String(readJson(activeKeyFor(userId, feature), '') || '');
};

export const setLastActiveCreativeLabSessionId = (
  userId: string | number | undefined,
  feature: CreativeLabSession['feature'],
  sessionId: string,
) => {
  if (typeof window === 'undefined') return;
  if (!sessionId) window.localStorage.removeItem(activeKeyFor(userId, feature));
  else writeJson(activeKeyFor(userId, feature), sessionId);
};
