import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Loader2, Play, Trash2, Video, FileJson, X, Star, LayoutGrid, List, Send, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { videoApi, type HistoryProject, type HistorySort } from '../../services/video';
import { tiktokApi, type TikTokDirectPostInfo } from '../../services/tiktok';
import { AppDialog } from '../common/AppDialog';
import { ImageHistoryPanel } from './ImageHistoryPanel';
import {
  TIKTOK_AUTH_COMPLETE_EVENT,
  closeTikTokAuthPopup,
  navigateTikTokAuthPopup,
  openTikTokAuthPopup,
  type TikTokAuthResult,
} from '../../utils/tiktokAuthPopup';

type HistoryTab = 'video' | 'image';

const toDisplayUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  const p = String(path).trim();
  if (!p) return null;
  if (p.startsWith('http')) return p;
  const mediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL || '';
  return mediaBaseUrl ? `${mediaBaseUrl}${p}` : p;
};

const formatDuration = (seconds: number) => {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const rem = total % 60;
  if (m <= 0) return `${total}s`;
  return `${m}:${String(rem).padStart(2, '0')}`;
};

const formatModelLabel = (model: string | null | undefined) => {
  const text = String(model || '').trim();
  if (!text) return null;
  return text;
};

const formatDateTimeToMinute = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const StatusBadge = ({ status, label }: { status: string; label: string }) => {
  switch (status) {
    case 'SUCCESS':
      return (
        <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30">
          {label}
        </span>
      );
    case 'PROCESSING':
    case 'PENDING':
      return (
        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {label}
        </span>
      );
    case 'FAILED':
      return (
        <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30">
          {label}
        </span>
      );
    default:
      return (
        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-white/5">
          {label}
        </span>
      );
  }
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
};

const formatI18n = (template: string | undefined, vars: Record<string, string | number>) => {
  if (!template) return '';
  return Object.entries(vars).reduce((acc, [key, value]) => {
    return acc.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value));
  }, template);
};

const HISTORY_PAGE_SIZE = 16;

type TikTokCreatorInfo = {
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
};

const extractTikTokCreatorInfo = (payload: any): TikTokCreatorInfo => {
  const data = payload?.data || {};
  return (data.creator_info || data || {}) as TikTokCreatorInfo;
};

const buildTikTokDirectPostInfo = (creatorInfo: TikTokCreatorInfo, title = ''): TikTokDirectPostInfo => ({
  title,
  privacy_level: creatorInfo.privacy_level_options?.[0] || 'SELF_ONLY',
  disable_duet: Boolean(creatorInfo.duet_disabled),
  disable_comment: Boolean(creatorInfo.comment_disabled),
  disable_stitch: Boolean(creatorInfo.stitch_disabled),
  brand_content_toggle: false,
  brand_organic_toggle: false,
  is_aigc: true,
});

export const HistoryView = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [projects, setProjects] = useState<HistoryProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryProject | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [promptProject, setPromptProject] = useState<HistoryProject | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Record<string, { id: string; title: string; video_url: string | null }>>({});
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [isBatchFavoriting, setIsBatchFavoriting] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | HistoryProject['status']>('ALL');
  const [sortBy, setSortBy] = useState<HistorySort>('updated_at_desc');
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [postingTikTokProjectId, setPostingTikTokProjectId] = useState<string | null>(null);
  const [pendingTikTokProject, setPendingTikTokProject] = useState<HistoryProject | null>(null);
  const [isTikTokPublishModeOpen, setIsTikTokPublishModeOpen] = useState(false);
  const [isTikTokDirectOpen, setIsTikTokDirectOpen] = useState(false);
  const [isLoadingTikTokCreatorInfo, setIsLoadingTikTokCreatorInfo] = useState(false);
  const [isPostingTikTokDirect, setIsPostingTikTokDirect] = useState(false);
  const [tiktokCreatorInfo, setTikTokCreatorInfo] = useState<TikTokCreatorInfo | null>(null);
  const [tiktokDirectForm, setTikTokDirectForm] = useState<TikTokDirectPostInfo>(() => buildTikTokDirectPostInfo({}));
  const [retryingProjectId, setRetryingProjectId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('video');
  const [loadingPromptId, setLoadingPromptId] = useState<string | null>(null);
  const [promptTab, setPromptTab] = useState<'final' | 'original'>('final');

  const statusLabels: Record<string, string> = useMemo(() => ({
    SUCCESS: t.hist_status_success,
    PROCESSING: t.hist_status_processing,
    PENDING: t.hist_status_pending,
    FAILED: t.hist_status_failed,
    DRAFT: t.hist_status_draft,
  }), [t]);

  const historyQuery = useMemo(() => ({
    status: statusFilter,
    keyword: searchKeyword,
    sort: sortBy,
    page: currentPage,
    page_size: HISTORY_PAGE_SIZE,
  }), [statusFilter, searchKeyword, sortBy, currentPage]);

  const selectedIds = useMemo(() => Object.keys(selectedProjects), [selectedProjects]);
  const selectedCount = selectedIds.length;
  const allSelected = projects.length > 0 && projects.every((item) => Boolean(selectedProjects[item.id]));

  const formatTikTokMetric = (value: unknown) => (
    typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '--'
  );

  const renderTikTokStats = (proj: HistoryProject) => {
    const stats = (proj.platform_stats || {}) as Record<string, unknown>;
    const views = stats.tiktok_view_count;
    const likes = stats.tiktok_like_count;
    return (
    <div className="text-[11px] text-zinc-500/70 flex items-center gap-3">
        <span>{t.hist_metric_views || 'Views'} {formatTikTokMetric(views)}</span>
        <span>{t.hist_metric_likes || 'Likes'} {formatTikTokMetric(likes)}</span>
    </div>
    );
  };

  const refreshTikTokMetrics = async (items: HistoryProject[]) => {
    const projectIds = items
      .filter((item) => Boolean((item.platform_stats as Record<string, unknown> | undefined)?.tiktok_publish_id))
      .map((item) => item.id);
    if (projectIds.length === 0) return;

    try {
      const result = await tiktokApi.refreshProjectMetrics(projectIds);
      const nextStats = result?.data?.projects;
      if (!nextStats || typeof nextStats !== 'object') return;
      setProjects((prev) => prev.map((item) => {
        const stats = (nextStats as Record<string, Record<string, unknown>>)[item.id];
        return stats ? { ...item, platform_stats: stats } : item;
      }));
    } catch (err) {
      // Metrics are best-effort; history itself should remain usable.
      console.log('[TikTok] metrics refresh skipped:', err);
    }
  };

  const loadHistory = async () => {
    if (!user?.id) {
      setProjects([]);
      setError(null);
      setIsLoading(false);
      setTotalPages(1);
      setTotalResults(0);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = showOnlyFavorites 
        ? await videoApi.getFavorites(historyQuery)
        : await videoApi.getHistory(historyQuery);
      const items = Array.isArray(data?.items) ? data.items : [];
      const pagination = data?.pagination;
      setProjects(items);
      void refreshTikTokMetrics(items);
      setTotalResults(Number(pagination?.total || 0));
      setTotalPages(Math.max(1, Number(pagination?.total_pages || 1)));
      if (pagination?.page && pagination.page !== currentPage) {
        setCurrentPage(pagination.page);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load history'));
      setProjects([]);
      setTotalPages(1);
      setTotalResults(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const onTikTokAuthComplete = (event: Event) => {
      const detail = (event as CustomEvent<TikTokAuthResult>).detail;
      if (detail?.status !== 'success') return;
      void loadHistory();
    };

    window.addEventListener(TIKTOK_AUTH_COMPLETE_EVENT, onTikTokAuthComplete);
    return () => window.removeEventListener(TIKTOK_AUTH_COMPLETE_EVENT, onTikTokAuthComplete);
  }, [loadHistory]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchKeyword(searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchKeyword, sortBy, showOnlyFavorites]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!user?.id) {
        setProjects([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = showOnlyFavorites 
          ? await videoApi.getFavorites(historyQuery)
          : await videoApi.getHistory(historyQuery);
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        const pagination = data?.pagination;
        setProjects(items);
        void refreshTikTokMetrics(items);
        setTotalResults(Number(pagination?.total || 0));
        setTotalPages(Math.max(1, Number(pagination?.total_pages || 1)));
        if (pagination?.page && pagination.page !== currentPage) {
          setCurrentPage(pagination.page);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setError(getErrorMessage(e, 'Failed to load history'));
        setProjects([]);
        setTotalPages(1);
        setTotalResults(0);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, historyQuery, showOnlyFavorites, currentPage]);

  useEffect(() => {
    if (!playingVideo) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayingVideo(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playingVideo]);

  useEffect(() => {
    if (projects.length === 0) return;
    setSelectedProjects((prev) => {
      let changed = false;
      const next = { ...prev };
      projects.forEach((proj) => {
        if (!next[proj.id]) return;
        const title = proj.title || t.hist_untitled_project;
        const videoUrl = proj.video_url || null;
        if (next[proj.id].title !== title || next[proj.id].video_url !== videoUrl) {
          next[proj.id] = { id: proj.id, title, video_url: videoUrl };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [projects, t.hist_untitled_project]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const target = projects.find(project => project.id === id);
    if (!target) return;

    setDeleteTarget(target);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeletingId(deleteTarget.id);
    try {
      await videoApi.deleteProject(deleteTarget.id);
      setProjects(prev => prev.filter(project => project.id !== deleteTarget.id));
      setSelectedProjects((prev) => {
        if (!prev[deleteTarget.id]) return prev;
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      setDeleteTarget(null);
    } catch (err: unknown) {
      setFeedbackMessage(getErrorMessage(err, t.hist_delete_failed));
    } finally {
      setDeletingId(prev => (prev === deleteTarget.id ? null : prev));
    }
  };

  const toggleSelect = (proj: HistoryProject) => {
    setSelectedProjects((prev) => {
      if (prev[proj.id]) {
        const next = { ...prev };
        delete next[proj.id];
        return next;
      }
      return {
        ...prev,
        [proj.id]: {
          id: proj.id,
          title: proj.title || t.hist_untitled_project,
          video_url: proj.video_url || null,
        },
      };
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      const currentPageIds = new Set(projects.map((item) => item.id));
      setSelectedProjects((prev) => {
        const next = { ...prev };
        currentPageIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      return;
    }
    setSelectedProjects((prev) => {
      const next = { ...prev };
      projects.forEach((item) => {
        next[item.id] = {
          id: item.id,
          title: item.title || t.hist_untitled_project,
          video_url: item.video_url || null,
        };
      });
      return next;
    });
  };

  const triggerDownload = async (url: string, fileName: string) => {
    try {
      // 对于跨域视频，先 fetch 获取 blob 再下载
      const response = await fetch(url, { method: 'GET', credentials: 'omit' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 延迟释放 blob URL
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      // 如果 fetch 失败，回退到原方式（可能打开新标签页）
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const buildTitleKey = (title: string) => {
    return title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'video';
  };

  const projectsById = useMemo(() => {
    const map = new Map<string, HistoryProject>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  const titleGroups = useMemo(() => {
    const map = new Map<string, HistoryProject[]>();
    projects.forEach((p) => {
      const key = buildTitleKey(p.title || t.hist_untitled_project);
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    });
    map.forEach((list, key) => {
      const sorted = [...list].sort((a, b) => {
        const ta = Date.parse(a.created_at || '') || 0;
        const tb = Date.parse(b.created_at || '') || 0;
        if (ta === tb) return String(a.id).localeCompare(String(b.id));
        return ta - tb;
      });
      map.set(key, sorted);
    });
    return map;
  }, [projects, t.hist_untitled_project]);

  const buildDownloadName = (title: string, opts?: { seq?: number; total?: number }) => {
    const safe = buildTitleKey(title);
    return `${safe}.mp4`;
  };

  const handleDownload = async (proj: { id: string; title: string; video_url: string | null }) => {
    const url = toDisplayUrl(proj.video_url);
    if (!url) {
      setFeedbackMessage(t.hist_video_not_ready);
      return;
    }

    const title = proj.title || t.hist_untitled_project;
    const key = buildTitleKey(title);
    const group = titleGroups.get(key) || [];
    const total = group.length > 0 ? group.length : 1;
    const seq = Math.max(1, group.findIndex((p) => p.id === proj.id) + 1);

    await triggerDownload(url, buildDownloadName(title, { seq, total }));
  };

  const handleBatchDownload = async () => {
    const selectedList = selectedIds.map((id) => selectedProjects[id]).filter(Boolean);
    const downloadable = selectedList.filter((item) => Boolean(item.video_url));
    if (downloadable.length === 0) {
      setFeedbackMessage(t.hist_batch_download_empty);
      return;
    }

    setIsBatchDownloading(true);
    let successCount = 0;
    const failedItems: string[] = [];

    for (let i = 0; i < downloadable.length; i++) {
      const item = downloadable[i];
      const url = toDisplayUrl(item.video_url);
      if (!url) {
        failedItems.push(item.title || t.hist_untitled_project);
        continue;
      }

      const proj = projectsById.get(item.id);
      const title = item.title || t.hist_untitled_project;
      const key = buildTitleKey(title);
      const group = titleGroups.get(key) || [];
      const total = group.length > 0 ? group.length : 1;
      const seq = proj ? Math.max(1, group.findIndex((p) => p.id === proj.id) + 1) : 1;

      try {
        await triggerDownload(url, buildDownloadName(title, { seq, total }));
        successCount++;
      } catch {
        failedItems.push(title);
      }

      if (i < downloadable.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    setIsBatchDownloading(false);

    if (failedItems.length === 0) {
      setFeedbackMessage(
        formatI18n(
          t.hist_batch_download_started || 'Started downloading {{count}} video(s).',
          { count: successCount }
        )
      );
    } else {
      setFeedbackMessage(
        formatI18n(
          t.hist_batch_download_partial || 'Downloaded {{count}} video(s). Failed to download: {{failed}}',
          { count: successCount, failed: failedItems.join(', ') }
        )
      );
    }
  };

  const handleBatchFavorite = async () => {
    if (selectedIds.length === 0) return;

    const targetIds = selectedIds.filter((id) => {
      const proj = projectsById.get(id);
      return Boolean(proj && !proj.is_favorited);
    });

    if (targetIds.length === 0) {
      return;
    }

    setIsBatchFavoriting(true);
    const succeededIds: string[] = [];

    for (const id of targetIds) {
      try {
        const result = await videoApi.toggleFavorite(id);
        if (result.is_favorited) {
          succeededIds.push(id);
        }
      } catch {
        // Continue with remaining items; aggregated error shown below.
      }
    }

    setIsBatchFavoriting(false);

    if (succeededIds.length > 0) {
      const succeededSet = new Set(succeededIds);
      setProjects((prev) => prev.map((item) => (
        succeededSet.has(item.id) ? { ...item, is_favorited: true } : item
      )));
    }

    if (succeededIds.length !== targetIds.length) {
      setFeedbackMessage(t.hist_favorite_toggle_failed || 'Failed to update favorite status');
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    setIsBulkDeleting(true);
    try {
      const targetSet = new Set(selectedIds);
      await videoApi.deleteProjects(selectedIds);
      setProjects((prev) => prev.filter((item) => !targetSet.has(item.id)));
      setSelectedProjects({});
      setIsBulkDeleteOpen(false);
    } catch (err: unknown) {
      setFeedbackMessage(getErrorMessage(err, t.hist_bulk_delete_failed));
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handlePlay = (proj: HistoryProject) => {
    const url = toDisplayUrl(proj.video_url);
    if (!url || proj.status !== 'SUCCESS') {
      setFeedbackMessage(t.hist_video_not_ready);
      return;
    }
    setPlayingVideo(url);
  };

  const handleOpenPrompt = async (proj: HistoryProject) => {
    // Prevent duplicate clicks
    if (loadingPromptId) return;

    // 如果本地已有数据（缓存），直接展示
    if (proj.model_request || proj.request_payload) {
      setPromptTab('final');
      setPromptProject(proj);
      return;
    }

    // 异步从后端按需加载 request_payload / model_request
    setLoadingPromptId(proj.id);
    try {
      const detail = await videoApi.getHistoryDetail(proj.id);
      const enriched: HistoryProject = {
        ...proj,
        request_payload: detail.request_payload,
        model_request: detail.model_request,
      };

      // 回写到列表缓存，下次无需再请求
      setProjects((prev) =>
        prev.map((item) => (item.id === proj.id ? enriched : item)),
      );

      if (!detail.model_request && !detail.request_payload) {
        setFeedbackMessage(t.hist_prompt_empty);
        return;
      }

      setPromptTab('final');
      setPromptProject(enriched);
    } catch {
      setFeedbackMessage(t.hist_prompt_empty);
    } finally {
      setLoadingPromptId(null);
    }
  };

  const handleToggleFavorite = async (proj: HistoryProject, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setTogglingFavoriteId(proj.id);
    try {
      const result = await videoApi.toggleFavorite(proj.id);
      setProjects((prev) => {
        if (showOnlyFavorites && !result.is_favorited) {
          return prev.filter((item) => item.id !== proj.id);
        }
        return prev.map((item) => (item.id === proj.id ? { ...item, is_favorited: result.is_favorited } : item));
      });
    } catch (err: unknown) {
      setFeedbackMessage(getErrorMessage(err, t.hist_favorite_toggle_failed || 'Failed to update favorite status'));
    } finally {
      setTogglingFavoriteId(null);
    }
  };

  const hasTikTokPublished = (proj: HistoryProject) => {
    const stats = proj.platform_stats;
    if (!stats || typeof stats !== 'object') return false;
    const publishId = (stats as Record<string, unknown>).tiktok_publish_id;
    return typeof publishId === 'string' && publishId.trim().length > 0;
  };

  const canPublishToTikTok = (proj: HistoryProject, resolvedVideoUrl: string | null) => {
    return proj.status === 'SUCCESS' && Boolean(resolvedVideoUrl) && !hasTikTokPublished(proj);
  };

  const handlePublishToTikTok = async (proj: HistoryProject) => {
    const videoUrl = toDisplayUrl(proj.video_url);
    if (!canPublishToTikTok(proj, videoUrl)) {
      setFeedbackMessage(t.hist_video_not_ready);
      return;
    }

    setPostingTikTokProjectId(proj.id);
    try {
      const status = await tiktokApi.getStatus();
      if (status?.data?.tiktok_unavailable) {
        setFeedbackMessage(status?.data?.message || 'TikTok 一键发布功能正在接入中，暂未对当前账号开放');
        return;
      }
      setPendingTikTokProject(proj);
      setIsTikTokPublishModeOpen(true);
    } catch (err: unknown) {
      setFeedbackMessage(getErrorMessage(err, '获取 TikTok 状态失败'));
    } finally {
      setPostingTikTokProjectId((prev) => (prev === proj.id ? null : prev));
    }
  };

  const publishDraftToTikTok = async (proj: HistoryProject) => {
    let authPopup: Window | null = null;
    setIsTikTokPublishModeOpen(false);
    setPostingTikTokProjectId(proj.id);
    try {
      const result = await tiktokApi.publishDraft(proj.id);
      if (result.unavailable) {
        setFeedbackMessage(result.message || 'TikTok 一键发布功能正在接入中，暂未对当前账号开放');
        return;
      }
      if (result.requiresAuth) {
        authPopup = openTikTokAuthPopup({
          loadingTitle: t.app_tiktok_popup_loading_title,
          loadingDescription: t.app_tiktok_popup_loading_desc,
        });
        const auth = result.authUrl
          ? { authUrl: result.authUrl, unavailable: false, message: result.message }
          : await tiktokApi.getAuthUrl(proj.id);
        if (auth.unavailable || !auth.authUrl) {
          closeTikTokAuthPopup(authPopup);
          setFeedbackMessage(auth.message || 'TikTok 一键发布功能正在接入中，暂未对当前账号开放');
          return;
        }
        const popupWindow = navigateTikTokAuthPopup(authPopup, auth.authUrl);
        if (!popupWindow) {
          setFeedbackMessage(t.app_tiktok_popup_blocked);
        }
        return;
      }

      closeTikTokAuthPopup(authPopup);

      setProjects((prev) => prev.map((item) => {
        if (item.id !== proj.id) return item;
        const nextStats = { ...(item.platform_stats || {}) } as Record<string, unknown>;
        if (result.publishId) {
          nextStats.tiktok_publish_id = result.publishId;
        }
        return {
          ...item,
          platform_stats: nextStats,
        };
      }));

      setFeedbackMessage(result.message || '已上传到TikTok草稿箱，请在App中查看并发布');
    } catch (err: unknown) {
      closeTikTokAuthPopup(authPopup);
      setFeedbackMessage(getErrorMessage(err, '上传 TikTok 草稿失败'));
    } finally {
      setPostingTikTokProjectId((prev) => (prev === proj.id ? null : prev));
    }
  };

  const prepareDirectPostToTikTok = async (proj: HistoryProject) => {
    let authPopup: Window | null = null;
    setIsTikTokPublishModeOpen(false);
    setIsLoadingTikTokCreatorInfo(true);
    setPostingTikTokProjectId(proj.id);
    try {
      const status = await tiktokApi.getStatus();
      if (status?.data?.tiktok_unavailable) {
        setFeedbackMessage(status?.data?.message || 'TikTok 一键发布功能正在接入中，暂未对当前账号开放');
        return;
      }

      if (!status?.data?.authorized) {
        authPopup = openTikTokAuthPopup({
          loadingTitle: t.app_tiktok_popup_loading_title,
          loadingDescription: t.app_tiktok_popup_loading_desc,
        });
        const auth = await tiktokApi.getAuthUrl();
        if (auth.unavailable || !auth.authUrl) {
          closeTikTokAuthPopup(authPopup);
          setFeedbackMessage(auth.message || 'TikTok 一键发布功能正在接入中，暂未对当前账号开放');
          return;
        }
        const popupWindow = navigateTikTokAuthPopup(authPopup, auth.authUrl);
        if (!popupWindow) {
          setFeedbackMessage(t.app_tiktok_popup_blocked);
          return;
        }
        setFeedbackMessage(t.wb_tiktok_direct_auth_required || 'TikTok authorization is ready. Please choose direct post again after authorization completes.');
        return;
      }

      const creatorPayload = await tiktokApi.getCreatorInfo();
      if (creatorPayload?.unavailable) {
        setFeedbackMessage(creatorPayload.message || 'TikTok 一键发布功能正在接入中，暂未对当前账号开放');
        return;
      }
      if (creatorPayload?.requiresAuth) {
        authPopup = openTikTokAuthPopup({
          loadingTitle: t.app_tiktok_popup_loading_title,
          loadingDescription: t.app_tiktok_popup_loading_desc,
        });
        const auth = creatorPayload.authUrl
          ? { authUrl: creatorPayload.authUrl, unavailable: false, message: creatorPayload.message }
          : await tiktokApi.getAuthUrl();
        if (auth.unavailable || !auth.authUrl) {
          closeTikTokAuthPopup(authPopup);
          setFeedbackMessage(auth.message || 'TikTok 一键发布功能正在接入中，暂未对当前账号开放');
          return;
        }
        const popupWindow = navigateTikTokAuthPopup(authPopup, auth.authUrl);
        if (!popupWindow) {
          setFeedbackMessage(t.app_tiktok_popup_blocked);
          return;
        }
        setFeedbackMessage(t.wb_tiktok_direct_auth_required || 'TikTok authorization is ready. Please choose direct post again after authorization completes.');
        return;
      }
      const creatorInfo = extractTikTokCreatorInfo(creatorPayload);
      setTikTokCreatorInfo(creatorInfo);
      setTikTokDirectForm(buildTikTokDirectPostInfo(creatorInfo, proj.title || ''));
      setPendingTikTokProject(proj);
      setIsTikTokDirectOpen(true);
    } catch (err: unknown) {
      closeTikTokAuthPopup(authPopup);
      setFeedbackMessage(getErrorMessage(err, '获取 TikTok 发布选项失败'));
    } finally {
      setIsLoadingTikTokCreatorInfo(false);
      setPostingTikTokProjectId((prev) => (prev === proj.id ? null : prev));
    }
  };

  const submitDirectPostToTikTok = async () => {
    const proj = pendingTikTokProject;
    if (!proj) return;

    let authPopup: Window | null = null;
    setIsPostingTikTokDirect(true);
    setPostingTikTokProjectId(proj.id);
    try {
      const result = await tiktokApi.publishDirect(proj.id, tiktokDirectForm);
      if (result.unavailable) {
        setFeedbackMessage(result.message || 'TikTok 一键发布功能正在接入中，暂未对当前账号开放');
        return;
      }
      if (result.requiresAuth) {
        authPopup = openTikTokAuthPopup({
          loadingTitle: t.app_tiktok_popup_loading_title,
          loadingDescription: t.app_tiktok_popup_loading_desc,
        });
        const auth = result.authUrl
          ? { authUrl: result.authUrl, unavailable: false, message: result.message }
          : await tiktokApi.getAuthUrl();
        if (auth.unavailable || !auth.authUrl) {
          closeTikTokAuthPopup(authPopup);
          setFeedbackMessage(auth.message || 'TikTok 一键发布功能正在接入中，暂未对当前账号开放');
          return;
        }
        const popupWindow = navigateTikTokAuthPopup(authPopup, auth.authUrl);
        if (!popupWindow) {
          setFeedbackMessage(t.app_tiktok_popup_blocked);
          return;
        }
        setFeedbackMessage(t.wb_tiktok_direct_auth_required || 'TikTok authorization is ready. Please choose direct post again after authorization completes.');
        return;
      }

      closeTikTokAuthPopup(authPopup);
      setIsTikTokDirectOpen(false);
      setProjects((prev) => prev.map((item) => {
        if (item.id !== proj.id) return item;
        const nextStats = { ...(item.platform_stats || {}) } as Record<string, unknown>;
        if (result.publishId) {
          nextStats.tiktok_publish_id = result.publishId;
          nextStats.tiktok_publish_type = 'DIRECT_POST';
        }
        return { ...item, platform_stats: nextStats };
      }));
      setFeedbackMessage(result.message || '已提交 TikTok 直接发布');
    } catch (err: unknown) {
      closeTikTokAuthPopup(authPopup);
      setFeedbackMessage(getErrorMessage(err, 'TikTok 直接发布失败'));
    } finally {
      setIsPostingTikTokDirect(false);
      setPostingTikTokProjectId((prev) => (prev === proj.id ? null : prev));
    }
  };

  const handleRetryGenerate = async (proj: HistoryProject) => {
    if (proj.status !== 'FAILED') return;

    // 如果本地没有 request_payload，先从后端按需加载
    let payload = proj.request_payload;
    if (!payload || typeof payload !== 'object') {
      try {
        const detail = await videoApi.getHistoryDetail(proj.id);
        payload = detail.request_payload;
        if (payload) {
          // 回写缓存
          setProjects((prev) =>
            prev.map((item) =>
              item.id === proj.id
                ? { ...item, request_payload: detail.request_payload, model_request: detail.model_request }
                : item,
            ),
          );
        }
      } catch {
        // ignore fetch error, will show empty prompt message below
      }
    }

    if (!payload || typeof payload !== 'object') {
      setFeedbackMessage(t.hist_prompt_empty);
      return;
    }

    setRetryingProjectId(proj.id);
    try {
      const retryPayload = {
        ...(payload as Record<string, unknown>),
        project_id: proj.id,
      };

      await videoApi.generate(retryPayload);
      setProjects((prev) => prev.map((item) => (
        item.id === proj.id
          ? { ...item, status: 'PROCESSING' }
          : item
      )));
      setFeedbackMessage(t.hist_status_processing);
    } catch (err: unknown) {
      setFeedbackMessage(getErrorMessage(err, t.hist_retry));
    } finally {
      setRetryingProjectId((prev) => (prev === proj.id ? null : prev));
    }
  };

  const canGoPrevPage = currentPage > 1;
  const canGoNextPage = currentPage < totalPages;

  const changePage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage) return;
    setCurrentPage(nextPage);
    setSelectedProjects({});
  };

  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
      <header className="hist-header flex flex-col px-10 pt-6 pb-0 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="hist-title text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.hist_title}</h1>
            <p className="text-zinc-500 text-xs mt-1">{t.hist_subtitle}</p>
          </div>
          <LanguageSwitcher />
        </div>
        {/* Horizontal Tabs */}
        <div className="flex items-center gap-1 mt-4 -mb-px">
          <button
            type="button"
            onClick={() => setHistoryTab('video')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-lg border border-b-0 transition ${
              historyTab === 'video'
                ? 'bg-white/5 border-white/10 text-zinc-100'
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Video className="w-4 h-4" />
            {t.hist_tab_video}
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab('image')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-lg border border-b-0 transition ${
              historyTab === 'image'
                ? 'bg-white/5 border-white/10 text-zinc-100'
                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            {t.hist_tab_image}
          </button>
        </div>
      </header>

      {/* Image Tab */}
      {historyTab === 'image' && (
        <div className="flex-1 overflow-y-auto p-10 custom-scroll">
          <div className="max-w-7xl mx-auto">
            <ImageHistoryPanel
              onNavigateToWorkbench={() => {
                window.dispatchEvent(new CustomEvent('vflow:navigate', { detail: { view: 'workbench' } }));
              }}
              onNavigateToProductImages={(view) => {
                window.dispatchEvent(new CustomEvent('vflow:navigate', { detail: { view } }));
              }}
            />
          </div>
        </div>
      )}

      {/* Video Tab */}
      {historyTab === 'video' && (
      <div className="flex-1 overflow-y-auto p-10 custom-scroll">
        <div className="max-w-7xl mx-auto">
          {!user?.id ? (
            <div className="text-center py-20 text-zinc-500">
              <Video className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>{t.hist_login_required}</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-zinc-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-zinc-400">{error}</p>
              <button
                onClick={loadHistory}
                className="mt-6 px-4 py-2 rounded-lg bg-zinc-100/50 dark:bg-white/5 hover:bg-zinc-200/50 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/5 text-sm text-zinc-900 dark:text-zinc-200 transition"
              >
                {t.hist_retry}
              </button>
            </div>
          ) : projects.length === 0 ? (
            <>
              <div className="mb-6 p-1">
                <div className="flex flex-col lg:flex-row gap-4 mb-4">
                  <div className="flex-1 relative">
                    <input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder={t.hist_filter_search_placeholder}
                      className="w-full h-10 rounded-xl bg-white/[0.03] px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:bg-white/[0.05] focus:ring-1 focus:ring-orange-500/50 transition-all hover:bg-white/[0.04]"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'ALL' | HistoryProject['status'])}
                        className="h-10 appearance-none rounded-xl bg-white/[0.03] pl-4 pr-8 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50 transition-all cursor-pointer hover:bg-white/[0.05]"
                      >
                        <option value="ALL" className="bg-zinc-900 text-zinc-300">{t.hist_filter_all_status}</option>
                        <option value="SUCCESS" className="bg-zinc-900 text-zinc-300">{t.hist_status_success}</option>
                        <option value="PROCESSING" className="bg-zinc-900 text-zinc-300">{t.hist_status_processing}</option>
                        <option value="PENDING" className="bg-zinc-900 text-zinc-300">{t.hist_status_pending}</option>
                        <option value="FAILED" className="bg-zinc-900 text-zinc-300">{t.hist_status_failed}</option>
                        <option value="DRAFT" className="bg-zinc-900 text-zinc-300">{t.hist_status_draft}</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                        <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                      </div>
                    </div>

                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as HistorySort)}
                        className="h-10 appearance-none rounded-xl bg-white/[0.03] pl-4 pr-8 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50 transition-all cursor-pointer hover:bg-white/[0.05]"
                      >
                        <option value="updated_at_desc" className="bg-zinc-900 text-zinc-300">{t.hist_sort_updated_desc}</option>
                        <option value="updated_at_asc" className="bg-zinc-900 text-zinc-300">{t.hist_sort_updated_asc}</option>
                        <option value="created_at_desc" className="bg-zinc-900 text-zinc-300">{t.hist_sort_created_desc}</option>
                        <option value="created_at_asc" className="bg-zinc-900 text-zinc-300">{t.hist_sort_created_asc}</option>
                      </select>
                       <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                        <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                      </div>
                    </div>

                    <div className="flex bg-white/[0.02] rounded-xl p-1 h-10 items-center">
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                          viewMode === 'grid'
                            ? 'bg-white/10 text-zinc-200 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                        }`}
                        title={'Grid View'}
                      >
                        <LayoutGrid size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                          viewMode === 'list'
                            ? 'bg-white/10 text-zinc-200 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                        }`}
                        title={'List View'}
                      >
                        <List size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                   <button
                      type="button"
                      onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                      className={`h-9 flex items-center gap-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                        showOnlyFavorites
                          ? 'bg-amber-500/10 text-amber-500' 
                          : 'bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <Star size={14} className={showOnlyFavorites ? 'fill-current' : ''} />
                      <span>{t.hist_favorites_toggle_only || 'Favorites'}</span>
                    </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center text-center py-20 text-zinc-500">
                <Video className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>{t.hist_empty}</p>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6 p-1">
                {/* Filter / Search Row */}
                <div className="flex flex-col lg:flex-row gap-4 mb-4">
                  <div className="flex-1 relative">
                    <input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder={t.hist_filter_search_placeholder}
                      className="hist-filter-control hist-workbar-item hist-filter-input w-full h-10 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-all shadow-sm"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'ALL' | HistoryProject['status'])}
                        className="hist-filter-control hist-workbar-item hist-filter-select h-10 appearance-none rounded-lg border border-zinc-200 bg-white pl-4 pr-8 py-2 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 transition-all cursor-pointer hover:bg-zinc-50 shadow-sm"
                      >
                        <option value="ALL" className="hist-filter-option bg-white text-zinc-900">{t.hist_filter_all_status}</option>
                        <option value="SUCCESS" className="hist-filter-option bg-white text-zinc-900">{t.hist_status_success}</option>
                        <option value="PROCESSING" className="hist-filter-option bg-white text-zinc-900">{t.hist_status_processing}</option>
                        <option value="PENDING" className="hist-filter-option bg-white text-zinc-900">{t.hist_status_pending}</option>
                        <option value="FAILED" className="hist-filter-option bg-white text-zinc-900">{t.hist_status_failed}</option>
                        <option value="DRAFT" className="hist-filter-option bg-white text-zinc-900">{t.hist_status_draft}</option>
                      </select>
                      <div className="hist-filter-icon pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                        <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                      </div>
                    </div>

                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as HistorySort)}
                        className="hist-filter-control hist-workbar-item hist-filter-select h-10 appearance-none rounded-lg border border-zinc-200 bg-white pl-4 pr-8 py-2 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 transition-all cursor-pointer hover:bg-zinc-50 shadow-sm"
                      >
                        <option value="updated_at_desc" className="hist-filter-option bg-white text-zinc-900">{t.hist_sort_updated_desc}</option>
                        <option value="updated_at_asc" className="hist-filter-option bg-white text-zinc-900">{t.hist_sort_updated_asc}</option>
                        <option value="created_at_desc" className="hist-filter-option bg-white text-zinc-900">{t.hist_sort_created_desc}</option>
                        <option value="created_at_asc" className="hist-filter-option bg-white text-zinc-900">{t.hist_sort_created_asc}</option>
                      </select>
                       <div className="hist-filter-icon pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                        <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                      </div>
                    </div>

                    <div className="hist-filter-control hist-workbar-item hist-workbar-group flex bg-white rounded-lg p-1 border border-zinc-200 h-10 items-center shadow-sm">
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`hist-filter-toggle hist-workbar-toggle flex items-center justify-center w-8 h-8 rounded transition-all ${
                          viewMode === 'grid' 
                            ? 'hist-workbar-toggle-active bg-zinc-200 text-zinc-900 shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-700'
                        }`}
                        title={'Grid View'}
                      >
                        <LayoutGrid size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={`hist-filter-toggle hist-workbar-toggle flex items-center justify-center w-8 h-8 rounded transition-all ${
                          viewMode === 'list' 
                            ? 'hist-workbar-toggle-active bg-zinc-200 text-zinc-900 shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-700'
                        }`}
                        title={'List View'}
                      >
                        <List size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Toolbar Row */}
                <div className="flex flex-wrap items-center justify-between gap-4 h-10 mb-2">
                   <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors ${
                        allSelected 
                          ? 'bg-orange-500/10 text-orange-500' 
                          : 'bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      {allSelected ? t.hist_selection_clear : t.hist_selection_all}
                    </button>

                    <div className="h-4 w-px bg-white/10 mx-1" />

                    <button
                      type="button"
                      onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                      className={`h-9 flex items-center gap-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                        showOnlyFavorites
                          ? 'bg-amber-500/10 text-amber-500' 
                          : 'bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <Star size={14} className={showOnlyFavorites ? 'fill-current' : ''} />
                      <span>{t.hist_favorites_toggle_only || 'Favorites'}</span>
                    </button>
                   </div>

                   {/* Bulk Actions */}
                   <div className={`flex items-center gap-2 transition-opacity duration-200 ${selectedCount > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                      <span className="text-xs text-zinc-500 mr-2">{selectedCount} {t.assets_selected}</span>
                      
                      <button
                        type="button"
                        onClick={handleBatchDownload}
                        disabled={selectedCount === 0 || isBatchDownloading}
                        className="h-9 flex items-center gap-2 px-3 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-sm hover:scale-105 active:scale-95"
                      >
                        {isBatchDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        <span>{t.hist_bulk_download_action}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleBatchFavorite}
                        disabled={selectedCount === 0 || isBatchFavoriting}
                        className="h-9 flex items-center gap-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-sm hover:scale-105 active:scale-95"
                      >
                        {isBatchFavoriting ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
                        <span>{t.hist_bulk_favorite_action || 'Batch Favorite'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsBulkDeleteOpen(true)}
                        disabled={selectedCount === 0}
                        className="h-9 flex items-center gap-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-sm hover:scale-105 active:scale-95"
                      >
                        <Trash2 size={14} />
                        <span>{t.hist_bulk_delete_action}</span>
                      </button>
                   </div>
                </div>
                <div className="mt-2 text-xs text-zinc-500 mb-2">{totalResults} {t.hist_results_label}</div>
              </div>

              <div className={viewMode === 'list' ? "flex flex-col gap-3" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"}>
                  {projects.map((proj) => {
                const coverUrl = toDisplayUrl(proj.cover_url);
                const videoUrl = toDisplayUrl(proj.video_url);
                const canPlay = proj.status === 'SUCCESS' && !!videoUrl;
                const isTikTokPublished = hasTikTokPublished(proj);
                const canPublishTikTok = canPublishToTikTok(proj, videoUrl);
                const showPublishTikTok = !isTikTokPublished;

                const durationText = formatDuration(proj.duration);
                const modelLabel = formatModelLabel(proj.generation_model);

                if (viewMode === 'list') {
                  return (
                    <div
                      key={proj.id}
                      className={`group relative flex flex-row items-stretch rounded-2xl overflow-hidden bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 hover:shadow-lg ${Boolean(selectedProjects[proj.id]) ? 'bg-orange-500/6 backdrop-blur-sm' : ''}`}
                      style={{ height: '110px' }}
                      title={proj.title || ''}
                    >
                      {/* Thumbnail (Fixed Width) */}
                      <div className="w-48 bg-black/40 relative overflow-hidden shrink-0 cursor-pointer" onClick={() => handlePlay(proj)}>
                        <label
                          className="absolute top-2 left-2 z-20 flex items-center justify-center w-6 h-6 bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-md border border-zinc-300 dark:border-white/20 cursor-pointer hover:bg-white/70 dark:hover:bg-black/60 transition-colors shadow-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(selectedProjects[proj.id])}
                            onChange={() => toggleSelect(proj)}
                            className="appearance-none w-3.5 h-3.5 rounded-[2px] border border-zinc-500 checked:bg-orange-500 checked:border-orange-500"
                          />
                          {Boolean(selectedProjects[proj.id]) && <div className="absolute inset-0 flex items-center justify-center text-white text-xs pointer-events-none">✓</div>}
                        </label>

                        {canPlay ? (
                          <>
                            {coverUrl ? (
                              <img
                                src={coverUrl}
                                alt={proj.title}
                                loading="eager"
                                decoding="async"
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition duration-500"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                <Video className="w-6 h-6 text-zinc-600" />
                              </div>
                            )}

                            {modelLabel ? (
                              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-zinc-100 backdrop-blur-sm border border-white/10 max-w-[70%] truncate">
                                {modelLabel}
                              </div>
                            ) : null}

                            {durationText ? (
                              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-zinc-200 font-mono backdrop-blur-sm">
                                {durationText}
                              </div>
                            ) : null}

                            <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/20 backdrop-blur-[1px]">
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePlay(proj); }}
                                className="text-zinc-200 hover:text-orange-500 transition-colors hover:scale-110 transform"
                                title={t.hist_action_view_video}
                              >
                                <Play className="w-8 h-8 fill-current" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-900/50">
                              {proj.status === 'FAILED' ? (
                                <AlertCircle className="w-6 h-6 text-red-900/50" />
                              ) : (
                                <Loader2 className="w-6 h-6 animate-spin text-zinc-700" />
                              )}
                            </div>
                            {proj.status === 'FAILED' ? (
                              <button
                                type="button"
                                onClick={() => handleRetryGenerate(proj)}
                                disabled={retryingProjectId === proj.id}
                                className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full border border-white/20 bg-black/45 text-zinc-100 hover:text-orange-400 hover:border-orange-400/60 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                title={t.hist_retry}
                              >
                                {retryingProjectId === proj.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>

                      {/* Info Area */}
                      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                        <div className="flex justify-between items-start gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-semibold text-zinc-200 truncate group-hover:text-white transition-colors" title={proj.title}>
                                {proj.title || t.hist_untitled_project}
                              </h3>
                              <StatusBadge status={proj.status} label={statusLabels[proj.status] || ''} />
                            </div>
                            {renderTikTokStats(proj)}
                          </div>
                          
                          <div className="text-[10px] text-zinc-600 whitespace-nowrap pt-1">
                            {formatDateTimeToMinute(proj.created_at)}
                          </div>
                        </div>

<div className="flex items-center justify-between gap-3 mt-1 pt-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center gap-1.5 flex-1">
                            {showPublishTikTok ? (
                              <button
                                onClick={() => handlePublishToTikTok(proj)}
                                disabled={!canPublishTikTok || postingTikTokProjectId === proj.id}
                                className={`h-8 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-[11px] ${canPublishTikTok ? 'bg-white/5 text-zinc-300 hover:text-zinc-100 hover:bg-white/10 hover:scale-105' : 'text-zinc-500 bg-white/[0.02] opacity-50 cursor-not-allowed'} ${postingTikTokProjectId === proj.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={canPublishTikTok ? t.wb_btn_tiktok_draft : t.hist_video_not_ready}
                              >
                                {postingTikTokProjectId === proj.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                                <span className="hidden sm:inline">{postingTikTokProjectId === proj.id ? t.wb_tiktok_uploading : t.wb_btn_tiktok_draft}</span>
                              </button>
                            ) : null}

                            <button
                              onClick={() => handlePlay(proj)}
                              className="h-8 px-2.5 text-zinc-300 bg-white/5 hover:text-zinc-100 hover:bg-white/10 rounded-lg transition-all hover:scale-105 flex items-center gap-1.5 text-[11px]"
                              title={t.hist_action_view_video}
                            >
                              <Play className="w-4 h-4 fill-current" />
                              <span className="hidden sm:inline">{t.hist_action_view_video}</span>
                            </button>

                            <button
                              onClick={() => handleOpenPrompt(proj)}
                              disabled={!!loadingPromptId}
                              className="h-8 px-2.5 text-zinc-300 bg-white/5 hover:text-zinc-100 hover:bg-white/10 rounded-lg transition-all hover:scale-105 flex items-center gap-1.5 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                              title={t.hist_action_view_prompt}
                            >
                              {loadingPromptId === proj.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
                              <span className="hidden sm:inline">{loadingPromptId === proj.id ? t.hist_prompt_loading : t.hist_action_view_prompt}</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleDownload({ id: proj.id, title: proj.title || t.hist_untitled_project, video_url: proj.video_url })}
                              className="h-8 w-8 flex items-center justify-center text-zinc-400 bg-white/5 hover:text-zinc-200 hover:bg-white/10 rounded-lg transition-all hover:scale-110"
                              title={t.hist_action_download}
                            >
                              <Download className="w-4 h-4" />
                            </button>

                            <button
                              onClick={(e) => handleToggleFavorite(proj, e)}
                              disabled={togglingFavoriteId === proj.id}
                              className="h-8 w-8 flex items-center justify-center text-zinc-400 bg-white/5 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all hover:scale-110 disabled:opacity-50"
                              title={proj.is_favorited ? (t.hist_favorite_remove_title || 'Unfavorite') : (t.hist_favorite_add_title || 'Favorite')}
                            >
                              {togglingFavoriteId === proj.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Star className={`w-4 h-4 ${proj.is_favorited ? 'fill-current text-amber-500' : ''}`} />
                              )}
                            </button>

                            <button
                              onClick={(e) => handleDelete(e, proj.id)}
                              className="h-8 w-8 flex items-center justify-center text-zinc-500 bg-white/[0.03] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all hover:scale-110 disabled:opacity-50 ml-1"
                              title={t.assets_delete}
                              disabled={deletingId === proj.id}
                            >
                              {deletingId === proj.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={proj.id}
                    className={`group relative flex flex-col rounded-2xl overflow-hidden bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 hover:-translate-y-1 shadow-sm hover:shadow-xl ${Boolean(selectedProjects[proj.id]) ? 'bg-orange-500/6 backdrop-blur-sm' : ''}`}
                    title={proj.title || ''}
                  >
                    <div className="aspect-video bg-black/40 relative overflow-hidden">
                        <label
                          className="absolute top-3 left-3 z-20 flex items-center justify-center w-6 h-6 bg-white/50 dark:bg-black/40 backdrop-blur-sm rounded-md border border-zinc-300 dark:border-white/20 cursor-pointer hover:bg-white/70 dark:hover:bg-black/60 transition-colors opacity-0 group-hover:opacity-100 peer-checked:opacity-100 shadow-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                         <input
                            type="checkbox"
                            checked={Boolean(selectedProjects[proj.id])}
                            onChange={() => toggleSelect(proj)}
                            className="appearance-none w-3.5 h-3.5 rounded-[2px] border border-zinc-500 checked:bg-orange-500 checked:border-orange-500 peer"
                          />
                          {Boolean(selectedProjects[proj.id]) && <div className="absolute inset-0 flex items-center justify-center text-white text-xs pointer-events-none">✓</div>}
                      </label>

                      {canPlay ? (
                        <>
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt={proj.title}
                              loading="eager"
                              decoding="async"
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition duration-500 scale-100 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                              <Video className="w-8 h-8 text-zinc-600" />
                            </div>
                          )}

                          {modelLabel ? (
                            <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 rounded-md text-[10px] text-zinc-100 backdrop-blur-md max-w-[70%] truncate font-medium">
                              {modelLabel}
                            </div>
                          ) : null}

                          {durationText ? (
                            <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 rounded-md text-[10px] text-zinc-200 font-mono backdrop-blur-md font-medium">
                              {durationText}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-2 bg-zinc-900/50">
                            {proj.status === 'FAILED' ? (
                              <AlertCircle className="w-6 h-6 text-red-900/50" />
                            ) : (
                              <Video className="w-6 h-6" />
                            )}
                          </div>
                          {proj.status === 'FAILED' ? (
                            <button
                              type="button"
                              onClick={() => handleRetryGenerate(proj)}
                              disabled={retryingProjectId === proj.id}
                              className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/45 text-zinc-100 hover:text-orange-400 hover:bg-black/60 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm backdrop-blur-md"
                              title={t.hist_retry}
                            >
                              {retryingProjectId === proj.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                            </button>
                          ) : null}
                        </>
                      )}

                      <div className="absolute inset-0 z-10 bg-black/50 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-1.5 px-4">
                        {showPublishTikTok ? (
                          <button
                            onClick={() => handlePublishToTikTok(proj)}
                            disabled={!canPublishTikTok || postingTikTokProjectId === proj.id}
                            className={`w-full max-w-[200px] h-9 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${canPublishTikTok ? 'bg-white/10 text-white hover:bg-orange-500 hover:text-white hover:shadow-lg' : 'bg-black/40 text-zinc-400 opacity-50 cursor-not-allowed'} ${postingTikTokProjectId === proj.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={canPublishTikTok ? t.wb_btn_tiktok_draft : t.hist_video_not_ready}
                          >
                            {postingTikTokProjectId === proj.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                            <span className="text-xs font-semibold">{postingTikTokProjectId === proj.id ? t.wb_tiktok_uploading : t.wb_btn_tiktok_draft}</span>
                          </button>
                        ) : null}

                        <button
                          onClick={() => handlePlay(proj)}
                          className="w-full max-w-[200px] h-9 rounded-lg bg-white/10 text-white hover:bg-orange-500 hover:text-white transition-all duration-200 hover:shadow-lg flex items-center justify-center gap-2"
                          title={t.hist_action_view_video}
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span className="text-xs font-semibold">{t.hist_action_view_video}</span>
                        </button>

                        <button
                          onClick={() => handleOpenPrompt(proj)}
                          disabled={!!loadingPromptId}
                          className="w-full max-w-[200px] h-9 rounded-lg bg-white/10 text-white hover:bg-orange-500 hover:text-white transition-all duration-200 hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                          title={t.hist_action_view_prompt}
                        >
                          {loadingPromptId === proj.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
                          <span className="text-xs font-semibold">{loadingPromptId === proj.id ? t.hist_prompt_loading : t.hist_action_view_prompt}</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-5 flex flex-col gap-3 flex-1 h-full">
                      <div className="flex justify-between items-start gap-3">
                        <h3 className="text-[15px] font-semibold text-zinc-300 group-hover:text-white transition-colors line-clamp-2 leading-relaxed flex-1" title={proj.title}>
                          {proj.title || t.hist_untitled_project}
                        </h3>
                        <div className="flex-shrink-0 pt-0.5">
                          <StatusBadge status={proj.status} label={statusLabels[proj.status] || t.hist_status_draft} />
                        </div>
                      </div>

                      {renderTikTokStats(proj)}

                      <div className="flex items-center justify-between mt-auto pt-4 opacity-60 group-hover:opacity-100 transition-opacity">
                        <div className="text-[11px] text-zinc-400 font-medium">
                          {formatDateTimeToMinute(proj.created_at)}
                        </div>

                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={() => handleDownload({ id: proj.id, title: proj.title || t.hist_untitled_project, video_url: proj.video_url })}
                            className="h-8 w-8 flex items-center justify-center text-zinc-400 bg-white/5 hover:text-zinc-200 hover:bg-white/10 rounded-lg transition-all hover:scale-110"
                            title={t.hist_action_download}
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => handleToggleFavorite(proj, e)}
                            disabled={togglingFavoriteId === proj.id}
                            className="h-8 w-8 flex items-center justify-center text-zinc-400 bg-white/5 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all hover:scale-110 disabled:opacity-50"
                            title={proj.is_favorited ? (t.hist_favorite_remove_title || 'Unfavorite') : (t.hist_favorite_add_title || 'Favorite')}
                          >
                            {togglingFavoriteId === proj.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Star className={`w-4 h-4 ${proj.is_favorited ? 'fill-current text-amber-500' : ''}`} />
                            )}
                          </button>

                          <button
                            onClick={(e) => handleDelete(e, proj.id)}
                            className="h-8 w-8 flex items-center justify-center text-zinc-500 bg-white/[0.03] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all hover:scale-110 disabled:opacity-50 ml-1"
                            title={t.assets_delete}
                            disabled={deletingId === proj.id}
                          >
                            {deletingId === proj.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>

              <div className="mt-6 flex items-center justify-between gap-3 border-t border-zinc-200/60 dark:border-white/10 pt-4">
                <div className="text-xs text-zinc-500">
                  第 {currentPage} / {totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changePage(currentPage - 1)}
                    disabled={!canGoPrevPage || isLoading}
                    className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-white/10 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    onClick={() => changePage(currentPage + 1)}
                    disabled={!canGoNextPage || isLoading}
                    className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-white/10 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      )}

      <AppDialog
        isOpen={isTikTokPublishModeOpen}
        title={t.wb_tiktok_publish_mode_title || 'Publish to TikTok'}
        onClose={() => setIsTikTokPublishModeOpen(false)}
        footer={
          <>
            <button
              className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 disabled:opacity-60"
              onClick={() => setIsTikTokPublishModeOpen(false)}
              disabled={Boolean(postingTikTokProjectId) || isLoadingTikTokCreatorInfo}
              type="button"
            >
              {t.assets_move_cancel || 'Cancel'}
            </button>
            <button
              className="bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-white/15 disabled:opacity-60 flex items-center gap-2"
              onClick={() => pendingTikTokProject && void publishDraftToTikTok(pendingTikTokProject)}
              disabled={!pendingTikTokProject || Boolean(postingTikTokProjectId) || isLoadingTikTokCreatorInfo}
              type="button"
            >
              {postingTikTokProjectId && !isLoadingTikTokCreatorInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t.wb_tiktok_publish_mode_draft || 'Send to TikTok drafts'}
            </button>
            <button
              className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
              onClick={() => pendingTikTokProject && void prepareDirectPostToTikTok(pendingTikTokProject)}
              disabled={!pendingTikTokProject || Boolean(postingTikTokProjectId) || isLoadingTikTokCreatorInfo}
              type="button"
            >
              {isLoadingTikTokCreatorInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t.wb_tiktok_publish_mode_direct || 'Direct post'}
            </button>
          </>
        }
      >
        <div className="text-sm text-zinc-400">
          {t.wb_tiktok_publish_mode_title || 'Publish to TikTok'}
        </div>
      </AppDialog>

      <AppDialog
        isOpen={isTikTokDirectOpen}
        title={t.wb_tiktok_direct_title || 'Direct post settings'}
        onClose={() => {
          if (isPostingTikTokDirect) return;
          setIsTikTokDirectOpen(false);
        }}
        widthClassName="max-w-lg"
        footer={
          <>
            <button
              className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 disabled:opacity-60"
              onClick={() => setIsTikTokDirectOpen(false)}
              disabled={isPostingTikTokDirect}
              type="button"
            >
              {t.assets_move_cancel || 'Cancel'}
            </button>
            <button
              className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600 disabled:opacity-60 flex items-center gap-2"
              onClick={() => void submitDirectPostToTikTok()}
              disabled={isPostingTikTokDirect || !tiktokDirectForm.privacy_level}
              type="button"
            >
              {isPostingTikTokDirect ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t.wb_tiktok_direct_submit || 'Post directly'}
            </button>
          </>
        }
      >
        {(() => {
          const privacyOptions = tiktokCreatorInfo?.privacy_level_options?.length
            ? tiktokCreatorInfo.privacy_level_options
            : ['SELF_ONLY'];
          return (
            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-400">{t.wb_tiktok_direct_caption || 'Caption'}</span>
                <textarea
                  value={tiktokDirectForm.title}
                  onChange={(e) => setTikTokDirectForm((prev) => ({ ...prev, title: e.target.value.slice(0, 2200) }))}
                  maxLength={2200}
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500 resize-y"
                />
                <span className="block text-[11px] text-zinc-500 text-right">{tiktokDirectForm.title.length}/2200</span>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-400">{t.wb_tiktok_direct_privacy || 'Visibility'}</span>
                <select
                  value={tiktokDirectForm.privacy_level}
                  onChange={(e) => setTikTokDirectForm((prev) => ({ ...prev, privacy_level: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500"
                >
                  {privacyOptions.map((option) => (
                    <option key={option} value={option} className="bg-zinc-950 text-zinc-100">{option}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={!tiktokDirectForm.disable_comment}
                    disabled={Boolean(tiktokCreatorInfo?.comment_disabled)}
                    onChange={(e) => setTikTokDirectForm((prev) => ({ ...prev, disable_comment: !e.target.checked }))}
                  />
                  {t.wb_tiktok_direct_allow_comments || 'Allow comments'}
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={!tiktokDirectForm.disable_duet}
                    disabled={Boolean(tiktokCreatorInfo?.duet_disabled)}
                    onChange={(e) => setTikTokDirectForm((prev) => ({ ...prev, disable_duet: !e.target.checked }))}
                  />
                  {t.wb_tiktok_direct_allow_duet || 'Allow duet'}
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={!tiktokDirectForm.disable_stitch}
                    disabled={Boolean(tiktokCreatorInfo?.stitch_disabled)}
                    onChange={(e) => setTikTokDirectForm((prev) => ({ ...prev, disable_stitch: !e.target.checked }))}
                  />
                  {t.wb_tiktok_direct_allow_stitch || 'Allow stitch'}
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={tiktokDirectForm.is_aigc}
                    onChange={(e) => setTikTokDirectForm((prev) => ({ ...prev, is_aigc: e.target.checked }))}
                  />
                  {t.wb_tiktok_direct_aigc || 'AI-generated content'}
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={tiktokDirectForm.brand_content_toggle}
                    onChange={(e) => setTikTokDirectForm((prev) => ({ ...prev, brand_content_toggle: e.target.checked }))}
                  />
                  {t.wb_tiktok_direct_brand_content || 'Branded content'}
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={tiktokDirectForm.brand_organic_toggle}
                    onChange={(e) => setTikTokDirectForm((prev) => ({ ...prev, brand_organic_toggle: e.target.checked }))}
                  />
                  {t.wb_tiktok_direct_brand_organic || 'Promotes your own brand'}
                </label>
              </div>
            </div>
          );
        })()}
      </AppDialog>

      <AppDialog
        isOpen={isBulkDeleteOpen}
        title={t.hist_bulk_delete_title}
        onClose={() => {
          if (isBulkDeleting) return;
          setIsBulkDeleteOpen(false);
        }}
        footer={
          <>
            <button
              className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 disabled:opacity-60"
              onClick={() => setIsBulkDeleteOpen(false)}
              disabled={isBulkDeleting}
            >
              {t.assets_move_cancel}
            </button>
            <button
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500 disabled:opacity-60 flex items-center gap-2"
              onClick={() => void confirmBulkDelete()}
              disabled={isBulkDeleting || selectedCount === 0}
            >
              {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t.hist_bulk_delete_action}
            </button>
          </>
        }
      >
        <div className="whitespace-pre-line text-zinc-300">
          {t.hist_bulk_delete_message_prefix} {selectedCount} {t.hist_bulk_delete_message_suffix}
        </div>
      </AppDialog>

      <AppDialog
        isOpen={!!deleteTarget}
        title={t.hist_delete_confirm_title}
        onClose={() => {
          if (deletingId) return;
          setDeleteTarget(null);
        }}
        footer={
          <>
            <button
              className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 disabled:opacity-60"
              onClick={() => setDeleteTarget(null)}
              disabled={!!deletingId}
            >
              {t.assets_move_cancel}
            </button>
            <button
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500 disabled:opacity-60 flex items-center gap-2"
              onClick={() => void confirmDelete()}
              disabled={!deleteTarget || !!deletingId}
            >
              {deletingId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t.assets_delete}
            </button>
          </>
        }
      >
        <div className="whitespace-pre-line">
          <div className="font-medium text-zinc-100">{deleteTarget?.title || t.hist_untitled_project}</div>
          <div className="mt-2 text-zinc-400">{t.hist_delete_confirm_message}</div>
        </div>
      </AppDialog>

      <AppDialog
        isOpen={!!feedbackMessage}
        title={t.hist_title}
        onClose={() => setFeedbackMessage(null)}
        footer={
          <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500" onClick={() => setFeedbackMessage(null)}>
            {t.wb_debug_close}
          </button>
        }
      >
        <div className="whitespace-pre-line">{feedbackMessage}</div>
      </AppDialog>

      <AppDialog
        isOpen={!!promptProject}
        title={t.hist_prompt_title}
        onClose={() => setPromptProject(null)}
        widthClassName="max-w-3xl"
        footer={
          <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500" onClick={() => setPromptProject(null)}>
            {t.wb_debug_close}
          </button>
        }
      >
        {(() => {
          const mr = promptProject?.model_request;
          const rp = promptProject?.request_payload;
          const hasBoth = !!(mr && rp);
          const active = promptTab === 'final' ? (mr ?? rp ?? {}) : (rp ?? {});
          const data = active as Record<string, unknown>;

          const fieldDefs: { key: string; label: string }[] = [
            { key: 'prompt', label: t.hist_prompt_field_prompt },
            { key: 'model_name', label: t.hist_prompt_field_model },
            { key: 'duration', label: t.hist_prompt_field_duration },
            { key: 'aspect_ratio', label: t.hist_prompt_field_ratio },
            { key: 'mode', label: t.hist_prompt_field_mode },
            { key: 'professional_mode', label: t.hist_prompt_field_kling_mode },
            { key: 'cfg_scale', label: 'CFG Scale' },
            { key: 'with_audio', label: t.hist_prompt_field_sound },
            { key: 'negative_prompt', label: t.hist_prompt_field_negative },
            { key: 'image_path', label: t.hist_prompt_field_assets },
            { key: 'image_url', label: t.hist_prompt_field_assets },
          ];

          return (
            <div className="space-y-3">
              <div className="text-xs text-zinc-500">{promptProject?.title || t.hist_untitled_project}</div>

              {hasBoth && (
                <div className="flex gap-1 p-0.5 rounded-lg bg-white/5 w-fit">
                  <button
                    type="button"
                    onClick={() => setPromptTab('final')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                      promptTab === 'final' ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {t.hist_prompt_tab_final}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptTab('original')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                      promptTab === 'original' ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {t.hist_prompt_tab_original}
                  </button>
                </div>
              )}

              <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 custom-scroll space-y-2">
                {fieldDefs.map(({ key, label }) => {
                  const val = data[key];
                  if (val === undefined || val === null || val === '') return null;
                  const display = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
                  return (
                    <div key={key} className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</span>
                      <span className="text-xs text-zinc-200 whitespace-pre-wrap break-all leading-5 bg-white/5 rounded-lg px-3 py-2">{display}</span>
                    </div>
                  );
                })}
                {/* Show any remaining keys not in fieldDefs */}
                {Object.entries(data).filter(([k, v]) => !fieldDefs.some(f => f.key === k) && v !== undefined && v !== null && v !== '').map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{k}</span>
                    <span className="text-xs text-zinc-200 whitespace-pre-wrap break-all leading-5 bg-white/5 rounded-lg px-3 py-2">
                      {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
                    </span>
                  </div>
                ))}
                {Object.keys(data).length === 0 && (
                  <div className="text-xs text-zinc-500 text-center py-4">{t.hist_prompt_empty}</div>
                )}
              </div>
            </div>
          );
        })()}
      </AppDialog>

      {playingVideo ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={() => setPlayingVideo(null)}
        >
          <div
            className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setPlayingVideo(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition backdrop-blur-sm"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <video src={playingVideo} controls autoPlay className="w-full h-full object-contain" />
          </div>
        </div>
      ) : null}
    </div>
  );
};
