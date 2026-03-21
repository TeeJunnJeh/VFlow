import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Loader2, Play, Trash2, Video, FileJson, X, Star } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { videoApi, type HistoryProject, type HistorySort } from '../../services/video';
import { AppDialog } from '../common/AppDialog';

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
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | HistoryProject['status']>('ALL');
  const [sortBy, setSortBy] = useState<HistorySort>('updated_at_desc');
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);

  const categoryLabels: Record<string, string> = {
    camera: t.opt_cat_camera,
    beauty: t.opt_cat_beauty,
    food: t.opt_cat_food,
    electronics: t.opt_cat_digital,
  };

  const styleLabels: Record<string, string> = {
    realistic: t.opt_style_real,
    cinematic: t.opt_style_cine,
    '3d': t.opt_style_3d,
    anime: t.opt_style_anime,
  };

  const displayValue = (value: unknown) => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  };

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
  }), [statusFilter, searchKeyword, sortBy]);

  const selectedIds = useMemo(() => Object.keys(selectedProjects), [selectedProjects]);
  const selectedCount = selectedIds.length;
  const allSelected = projects.length > 0 && projects.every((item) => Boolean(selectedProjects[item.id]));

  const renderConfigLine = (proj: HistoryProject) => {
    const catRaw = displayValue(proj.config_snapshot?.category);
    const styleRaw = displayValue(proj.config_snapshot?.style);
    const ratioRaw = displayValue(proj.config_snapshot?.ratio);

    const cat = catRaw ? (categoryLabels[catRaw] || catRaw) : '';
    const style = styleRaw ? (styleLabels[styleRaw] || styleRaw) : '';
    const ratio = ratioRaw;

    const parts = [cat, style, ratio].filter(Boolean);
    return parts.length ? parts.join(' • ') : '';
  };

  const loadHistory = async () => {
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
      setProjects(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load history'));
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchKeyword(searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

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
        setProjects(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(getErrorMessage(e, 'Failed to load history'));
        setProjects([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, historyQuery, showOnlyFavorites]);

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

  const triggerDownload = (url: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const buildDownloadName = (title: string, index?: number) => {
    const safe = title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'video';
    const suffix = typeof index === 'number' ? `_${index + 1}` : '';
    return `${safe}${suffix}.mp4`;
  };

  const handleDownload = (proj: { title: string; video_url: string | null }) => {
    const url = toDisplayUrl(proj.video_url);
    if (!url) {
      setFeedbackMessage(t.hist_video_not_ready);
      return;
    }
    triggerDownload(url, buildDownloadName(proj.title || t.hist_untitled_project));
  };

  const handleBatchDownload = () => {
    const selectedList = selectedIds.map((id) => selectedProjects[id]).filter(Boolean);
    const downloadable = selectedList.filter((item) => Boolean(item.video_url));
    if (downloadable.length === 0) {
      setFeedbackMessage(t.hist_batch_download_empty);
      return;
    }

    downloadable.forEach((item, index) => {
      window.setTimeout(() => {
        const url = toDisplayUrl(item.video_url);
        if (!url) return;
        triggerDownload(url, buildDownloadName(item.title || t.hist_untitled_project, index));
      }, index * 180);
    });
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

  const handleOpenPrompt = (proj: HistoryProject) => {
    if (!proj.model_request && !proj.request_payload) {
      setFeedbackMessage(t.hist_prompt_empty);
      return;
    }
    setPromptProject(proj);
  };

  const handleToggleFavorite = async (proj: HistoryProject, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setTogglingFavoriteId(proj.id);
    try {
      const result = await videoApi.toggleFavorite(proj.id);
      // Update the project in the list with new favorite status
      setProjects((prev) => 
        prev.map((item) => 
          item.id === proj.id 
            ? { ...item, is_favorited: result.is_favorited }
            : item
        )
      );
    } catch (err: unknown) {
      setFeedbackMessage(getErrorMessage(err, t.hist_favorite_toggle_failed || 'Failed to update favorite status'));
    } finally {
      setTogglingFavoriteId(null);
    }
  };

  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
      <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.hist_title}</h1>
          <p className="text-zinc-500 text-xs mt-1">{t.hist_subtitle}</p>
        </div>
        <LanguageSwitcher />
      </header>

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
                className="mt-6 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-sm text-zinc-200 transition"
              >
                {t.hist_retry}
              </button>
            </div>
          ) : projects.length === 0 ? (
            <>
              <div className="mb-5 p-4 rounded-xl border border-white/10 bg-transparent">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto] gap-3">
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t.hist_filter_search_placeholder}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-orange-500"
                  />

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'ALL' | HistoryProject['status'])}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500"
                  >
                    <option value="ALL">{t.hist_filter_all_status}</option>
                    <option value="SUCCESS">{t.hist_status_success}</option>
                    <option value="PROCESSING">{t.hist_status_processing}</option>
                    <option value="PENDING">{t.hist_status_pending}</option>
                    <option value="FAILED">{t.hist_status_failed}</option>
                    <option value="DRAFT">{t.hist_status_draft}</option>
                  </select>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as HistorySort)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500"
                  >
                    <option value="updated_at_desc">{t.hist_sort_updated_desc}</option>
                    <option value="updated_at_asc">{t.hist_sort_updated_asc}</option>
                    <option value="created_at_desc">{t.hist_sort_created_desc}</option>
                    <option value="created_at_asc">{t.hist_sort_created_asc}</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setSortBy('updated_at_desc');
                      setSearchInput('');
                      setSearchKeyword('');
                    }}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 transition"
                  >
                    {t.hist_filter_reset}
                  </button>
                </div>
              </div>

              <div className="text-center py-20 text-zinc-500">
                <Video className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>{t.hist_empty}</p>
              </div>
            </>
          ) : (
            <>
              <div className="mb-5 p-4 rounded-xl border border-white/10 bg-transparent">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto] gap-3">
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t.hist_filter_search_placeholder}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-orange-500"
                  />

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'ALL' | HistoryProject['status'])}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500"
                  >
                    <option value="ALL">{t.hist_filter_all_status}</option>
                    <option value="SUCCESS">{t.hist_status_success}</option>
                    <option value="PROCESSING">{t.hist_status_processing}</option>
                    <option value="PENDING">{t.hist_status_pending}</option>
                    <option value="FAILED">{t.hist_status_failed}</option>
                    <option value="DRAFT">{t.hist_status_draft}</option>
                  </select>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as HistorySort)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500"
                  >
                    <option value="updated_at_desc">{t.hist_sort_updated_desc}</option>
                    <option value="updated_at_asc">{t.hist_sort_updated_asc}</option>
                    <option value="created_at_desc">{t.hist_sort_created_desc}</option>
                    <option value="created_at_asc">{t.hist_sort_created_asc}</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setSortBy('updated_at_desc');
                      setSearchInput('');
                      setSearchKeyword('');
                    }}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 transition"
                  >
                    {t.hist_filter_reset}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${allSelected ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'}`}
                  >
                    {allSelected ? t.hist_selection_clear : t.hist_selection_all}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDownload}
                    disabled={selectedCount === 0}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition flex items-center gap-1 ${selectedCount > 0 ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'}`}
                  >
                    <Download className="w-4 h-4" />
                    {t.hist_bulk_download_action}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteOpen(true)}
                    disabled={selectedCount === 0}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${selectedCount > 0 ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'}`}
                  >
                    {t.hist_bulk_delete_action} ({selectedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition flex items-center gap-2 ${showOnlyFavorites ? 'border-orange-500/60 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'}`}
                  >
                    <Star className="w-4 h-4" />
                    {showOnlyFavorites ? (t.hist_favorites_toggle_view_all || 'Show All') : (t.hist_favorites_toggle_only || 'My Favorites')}
                  </button>
                </div>
                <div className="mt-2 text-xs text-zinc-500">{projects.length} {t.hist_results_label}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {projects.map(proj => {
                const coverUrl = toDisplayUrl(proj.cover_url);
                const videoUrl = toDisplayUrl(proj.video_url);
                const canPlay = proj.status === 'SUCCESS' && !!videoUrl;

                const durationText = formatDuration(proj.duration);
                const configLine = renderConfigLine(proj);

                return (
                  <div
                    key={proj.id}
                    className="glass-card rounded-xl overflow-hidden group border border-white/5 hover:border-orange-500/30 transition flex flex-col"
                    title={proj.title || ''}
                  >
                    <div className="aspect-video bg-black/40 relative overflow-hidden">
                      <label
                        className="absolute top-2 left-2 z-20 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] text-zinc-100 border border-white/15"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(selectedProjects[proj.id])}
                          onChange={() => toggleSelect(proj)}
                          className="accent-orange-500"
                        />
                        {t.assets_select}
                      </label>

                      {canPlay ? (
                        <>
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt={proj.title}
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-40 transition"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                              <Video className="w-8 h-8 text-zinc-700" />
                            </div>
                          )}

                          {durationText ? (
                            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white font-mono backdrop-blur-sm">
                              {durationText}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
                          {proj.status === 'FAILED' ? (
                            <AlertCircle className="w-6 h-6 text-red-900/50" />
                          ) : (
                            <Video className="w-6 h-6" />
                          )}
                        </div>
                      )}

                      <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition rounded-none flex items-center justify-center py-4 px-4">
                        <div className="w-full flex items-center gap-2">
                          <button
                            onClick={() => handlePlay(proj)}
                            className="flex-1 bg-white text-black py-2 rounded-lg text-xs font-bold hover:bg-orange-500 hover:text-white transition shadow-lg flex items-center justify-center gap-2"
                          >
                            <Play className="w-3.5 h-3.5" />
                            {t.hist_action_view_video}
                          </button>
                          <button
                            onClick={() => handleOpenPrompt(proj)}
                            className="flex-1 bg-zinc-800 text-white py-2 rounded-lg text-xs font-bold hover:bg-zinc-700 transition flex items-center justify-center gap-2"
                          >
                            <FileJson className="w-3.5 h-3.5" />
                            {t.hist_action_view_prompt}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="text-sm font-bold text-zinc-200 line-clamp-1" title={proj.title}>
                          {proj.title || t.hist_untitled_project}
                        </h3>
                        <StatusBadge status={proj.status} label={statusLabels[proj.status] || t.hist_status_draft} />
                      </div>

                      {configLine ? (
                        <div className="text-[11px] text-zinc-500 line-clamp-1">{configLine}</div>
                      ) : null}

                      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                        <div className="text-[10px] text-zinc-500 flex-1">
                          {new Date(proj.updated_at).toLocaleDateString()}
                          <span className="ml-1 opacity-50">
                            {new Date(proj.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <button
                          onClick={() => handleDownload({ title: proj.title || t.hist_untitled_project, video_url: proj.video_url })}
                          className="p-1.5 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-500/10 rounded transition"
                          title={t.hist_action_download}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => handleToggleFavorite(proj, e)}
                          disabled={togglingFavoriteId === proj.id}
                          className="p-1.5 text-zinc-600 hover:text-orange-400 hover:bg-orange-500/10 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title={proj.is_favorited ? (t.hist_favorite_remove_title || 'Unfavorite') : (t.hist_favorite_add_title || 'Favorite')}
                        >
                          {togglingFavoriteId === proj.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Star className={`w-3.5 h-3.5 ${proj.is_favorited ? 'fill-current text-orange-400' : ''}`} />
                          )}
                        </button>

                        <button
                          onClick={(e) => handleDelete(e, proj.id)}
                          className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t.assets_delete}
                          disabled={deletingId === proj.id}
                        >
                          {deletingId === proj.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
            </>
          )}
        </div>
      </div>

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
        <div className="space-y-3">
          <div className="text-xs text-zinc-500">{promptProject?.title || t.hist_untitled_project}</div>
          <pre className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-zinc-200 whitespace-pre-wrap break-all custom-scroll">
            {JSON.stringify(promptProject?.model_request ?? promptProject?.request_payload ?? {}, null, 2)}
          </pre>
        </div>
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

