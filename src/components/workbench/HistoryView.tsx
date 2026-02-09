import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Play, Trash2, Video, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { videoApi, type HistoryProject } from '../../services/video';

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

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'SUCCESS':
      return (
        <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30">
          Success
        </span>
      );
    case 'PROCESSING':
    case 'PENDING':
      return (
        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processing
        </span>
      );
    case 'FAILED':
      return (
        <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30">
          Failed
        </span>
      );
    default:
      return (
        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-white/5">
          Draft
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
      const data = await videoApi.getHistory();
      setProjects(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load history'));
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

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
        const data = await videoApi.getHistory();
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
  }, [user?.id]);

  useEffect(() => {
    if (!playingVideo) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayingVideo(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playingVideo]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this project?')) return;

    setDeletingId(id);
    try {
      await videoApi.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Failed to delete project'));
    } finally {
      setDeletingId(prev => (prev === id ? null : prev));
    }
  };

  const handlePlay = (proj: HistoryProject) => {
    const url = toDisplayUrl(proj.video_url);
    if (url) setPlayingVideo(url);
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
              <p>Please log in to view history.</p>
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
                Retry
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 text-zinc-500">
              <Video className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No history found.</p>
            </div>
          ) : (
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
                    className="glass-card rounded-xl overflow-hidden group border border-white/5 hover:border-orange-500/30 transition flex flex-col cursor-pointer"
                    onClick={() => {
                      if (canPlay) setPlayingVideo(videoUrl!);
                    }}
                    title={proj.title || ''}
                  >
                    <div className="aspect-video bg-black/40 relative overflow-hidden group/thumb">
                      {canPlay ? (
                        <>
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt={proj.title}
                              className="w-full h-full object-cover opacity-80 group-hover/thumb:opacity-60 transition"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                              <Video className="w-8 h-8 text-zinc-700" />
                            </div>
                          )}

                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition duration-300">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlay(proj);
                              }}
                              className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-orange-500 hover:text-white transition text-white shadow-xl"
                            >
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </button>
                          </div>

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
                    </div>

                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="text-sm font-bold text-zinc-200 line-clamp-1" title={proj.title}>
                          {proj.title || 'Untitled Project'}
                        </h3>
                        <StatusBadge status={proj.status} />
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
                          onClick={(e) => handleDelete(e, proj.id)}
                          className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
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
          )}
        </div>
      </div>

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

