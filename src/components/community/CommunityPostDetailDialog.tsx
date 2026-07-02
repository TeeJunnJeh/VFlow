import { Bookmark, Flag, Heart, Library, X } from 'lucide-react';
import type { CommunityPost } from '../../services/community';

interface CommunityPostDetailDialogProps {
  post: CommunityPost | null;
  labels: {
    close: string;
    like: string;
    favorite: string;
    collect: string;
    uncollect: string;
    report: string;
  };
  onClose: () => void;
  onLike?: (post: CommunityPost) => void;
  onFavorite?: (post: CommunityPost) => void;
  onCollectMaterial?: (post: CommunityPost, materialId: string) => void;
  onReport?: (post: CommunityPost) => void;
}

export const CommunityPostDetailDialog = ({
  post,
  labels,
  onClose,
  onLike,
  onFavorite,
  onCollectMaterial,
  onReport,
}: CommunityPostDetailDialogProps) => {
  if (!post) return null;

  const primaryMedia = post.media.find((item) => item.kind === 'video') || post.media[0];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={onClose}>
      <section
        className="grid h-[min(82vh,760px)] w-full max-w-6xl grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative bg-black">
          {primaryMedia?.kind === 'video' ? (
            <video src={primaryMedia.url} poster={primaryMedia.thumbnail_url || post.cover_url} className="h-full w-full object-contain" controls preload="metadata" />
          ) : primaryMedia?.url ? (
            <img src={primaryMedia.url} alt={post.title} className="h-full w-full object-contain" />
          ) : (
            <div className="h-full w-full bg-zinc-900" />
          )}
        </div>

        <aside className="flex min-h-0 flex-col border-l border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-zinc-100">{post.title}</h2>
              <div className="mt-1 truncate text-xs text-zinc-500">@{post.author.name || 'creator'}</div>
            </div>
            <button type="button" title={labels.close} aria-label={labels.close} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="custom-scroll flex-1 overflow-y-auto px-5 py-4">
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{post.body}</p>

            {post.materials.length > 0 ? (
              <div className="mt-6 grid gap-2">
                {post.materials.map((material) => (
                  <button
                    key={material.id}
                    type="button"
                    title={post.is_collected ? labels.uncollect : labels.collect}
                    aria-label={post.is_collected ? labels.uncollect : labels.collect}
                    onClick={() => onCollectMaterial?.(post, material.id)}
                    className={`flex h-12 items-center justify-between rounded-lg border px-3 text-left text-sm transition ${post.is_collected ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-zinc-200 hover:border-emerald-400/40 hover:bg-emerald-500/10'}`}
                  >
                    <span className="min-w-0 truncate">{material.name}</span>
                    <Library className="h-4 w-4 shrink-0 text-emerald-300" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-4 border-t border-white/10">
            <button type="button" title={labels.like} aria-label={labels.like} onClick={() => onLike?.(post)} className={`flex h-12 items-center justify-center gap-1 text-xs font-bold ${post.is_liked ? 'text-red-300' : 'text-zinc-300 hover:text-red-300'}`}>
              <Heart className={`h-4 w-4 ${post.is_liked ? 'fill-current' : ''}`} />
              {post.like_count}
            </button>
            <button type="button" title={labels.favorite} aria-label={labels.favorite} onClick={() => onFavorite?.(post)} className={`flex h-12 items-center justify-center gap-1 text-xs font-bold ${post.is_favorited ? 'text-orange-300' : 'text-zinc-300 hover:text-orange-300'}`}>
              <Bookmark className={`h-4 w-4 ${post.is_favorited ? 'fill-current' : ''}`} />
              {post.favorite_count}
            </button>
            <button
              type="button"
              title={post.is_collected ? labels.uncollect : labels.collect}
              aria-label={post.is_collected ? labels.uncollect : labels.collect}
              disabled={!post.materials[0]}
              onClick={() => post.materials[0] && onCollectMaterial?.(post, post.materials[0].id)}
              className={`flex h-12 items-center justify-center gap-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-35 ${post.is_collected ? 'text-emerald-300' : 'text-zinc-300 hover:text-emerald-300'}`}
            >
              <Library className="h-4 w-4" />
              {post.collect_count}
            </button>
            <button type="button" title={labels.report} aria-label={labels.report} onClick={() => onReport?.(post)} className="flex h-12 items-center justify-center gap-1 text-xs font-bold text-zinc-300 hover:text-yellow-300">
              <Flag className="h-4 w-4" />
              {labels.report}
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
};
