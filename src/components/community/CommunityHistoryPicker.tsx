import React from 'react';
import { Check, Film, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { getImageHistoryPage } from '../../utils/imageHistory';
import { videoApi } from '../../services/video';

export interface CommunityHistoryPicked {
  kind: 'image' | 'video';
  url: string;
  name: string;
  thumbnail_url?: string;
  source_project_id?: string; // 视频来源的历史项目 id（用于回溯其 skill）
  source_history_id?: string; // 图片来源的历史记录 id（用于读取生成参数）
  feature_type?: string;
}

type HistoryTab = 'video' | 'image';

interface CommunityHistoryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (items: CommunityHistoryPicked[]) => void;
}

const keyOf = (item: CommunityHistoryPicked) => `${item.kind}:${item.url}`;

export const CommunityHistoryPicker = ({ isOpen, onClose, onConfirm }: CommunityHistoryPickerProps) => {
  const [tab, setTab] = React.useState<HistoryTab>('video');
  const [videos, setVideos] = React.useState<CommunityHistoryPicked[]>([]);
  const [images, setImages] = React.useState<CommunityHistoryPicked[]>([]);
  const [loadedVideo, setLoadedVideo] = React.useState(false);
  const [loadedImage, setLoadedImage] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState<Record<string, CommunityHistoryPicked>>({});

  const load = React.useCallback(async (target: HistoryTab) => {
    setLoading(true);
    setError('');
    try {
      if (target === 'video') {
        const res = await videoApi.getHistory({ status: 'SUCCESS', page: 1, page_size: 60 });
        const list = (res.items || [])
          .filter((p) => p.video_url)
          .map<CommunityHistoryPicked>((p) => ({
            kind: 'video',
            url: String(p.video_url),
            name: p.title || '历史视频',
            thumbnail_url: p.cover_url || undefined,
            source_project_id: String(p.id),
          }));
        setVideos(list);
        setLoadedVideo(true);
      } else {
        const res = await getImageHistoryPage({ page: 1, pageSize: 60 });
        const list: CommunityHistoryPicked[] = [];
        (res.items || []).forEach((it) => {
          (it.images || []).forEach((url, idx) => {
            if (url) list.push({
              kind: 'image',
              url,
              name: `${it.featureType || '图片'}-${idx + 1}`,
              source_history_id: String(it.id),
              feature_type: it.featureType,
            });
          });
        });
        setImages(list);
        setLoadedImage(true);
      }
    } catch (e: any) {
      setError(e?.message || '加载生成历史失败');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    if (tab === 'video' && !loadedVideo) void load('video');
    if (tab === 'image' && !loadedImage) void load('image');
  }, [isOpen, tab, loadedVideo, loadedImage, load]);

  React.useEffect(() => {
    if (isOpen) return;
    // 关闭后重置选择与缓存标记，便于下次重新拉取
    setSelected({});
    setLoadedVideo(false);
    setLoadedImage(false);
    setVideos([]);
    setImages([]);
    setError('');
    setTab('video');
  }, [isOpen]);

  if (!isOpen) return null;

  const items = tab === 'video' ? videos : images;
  const toggle = (item: CommunityHistoryPicked) => {
    setSelected((prev) => {
      const k = keyOf(item);
      const next = { ...prev };
      if (next[k]) delete next[k];
      else next[k] = item;
      return next;
    });
  };
  const selectedCount = Object.keys(selected).length;

  return (
    <div className="fixed inset-0 z-[124] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <section className="flex max-h-[82vh] w-full max-w-4xl flex-col rounded-lg border border-white/10 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex gap-2">
            {([['video', '生成的视频', Film], ['image', '生成的图片', ImageIcon]] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold transition ${tab === value ? 'bg-orange-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 custom-scroll">
          {loading ? (
            <div className="flex h-64 items-center justify-center gap-3 text-sm font-bold text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" /> 正在加载生成历史...
            </div>
          ) : error ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm font-bold text-red-300">
              <span>{error}</span>
              <button type="button" onClick={() => void load(tab)} className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-200 hover:bg-white/10">重试</button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm font-bold text-zinc-500">
              暂无{tab === 'video' ? '视频' : '图片'}生成记录
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) => {
                const isSelected = Boolean(selected[keyOf(item)]);
                return (
                  <button
                    key={keyOf(item)}
                    type="button"
                    onClick={() => toggle(item)}
                    className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition ${isSelected ? 'border-orange-400' : 'border-white/10 hover:border-white/30'}`}
                  >
                    {item.kind === 'video' ? (
                      item.thumbnail_url ? (
                        <img src={item.thumbnail_url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <video src={item.url} muted preload="metadata" className="h-full w-full object-cover" />
                      )
                    ) : (
                      <img src={item.url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
                    )}
                    {item.kind === 'video' ? (
                      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <Film className="h-3 w-3" /> 视频
                      </span>
                    ) : null}
                    {isSelected ? (
                      <span className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white shadow">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-left text-[10px] font-bold text-zinc-100">
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <span className="text-xs font-bold text-zinc-400">已选 {selectedCount} 项</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-lg border border-white/10 px-4 text-sm font-bold text-zinc-300 hover:bg-white/10">取消</button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => { onConfirm(Object.values(selected)); onClose(); }}
              className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-400 disabled:opacity-50"
            >
              添加所选
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
