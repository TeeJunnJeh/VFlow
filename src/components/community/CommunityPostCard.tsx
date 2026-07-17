import React from 'react';
import { Bookmark, Heart, Library, Play, User } from 'lucide-react';
import type { CommunityAuthor, CommunityPost } from '../../services/community';

interface CommunityPostCardProps {
  post: CommunityPost;
  labels: {
    like: string;
    favorite: string;
    collect: string;
    uncollect: string;
  };
  onOpen: (post: CommunityPost) => void;
  onLike?: (post: CommunityPost) => void;
  onFavorite?: (post: CommunityPost) => void;
  onCollectFirstMaterial?: (post: CommunityPost) => void;
  onAuthorClick?: (author: CommunityAuthor) => void;
}

export const CommunityPostCard = React.memo(({
  post,
  labels,
  onOpen,
  onLike,
  onFavorite,
  onCollectFirstMaterial,
  onAuthorClick,
}: CommunityPostCardProps) => {
  // 优先选视频作为卡片主媒体（与详情弹窗一致）
  const videoMedia = post.media.find((m) => m.kind === 'video');
  const firstMedia = videoMedia || post.media[0];
  const isVideo = firstMedia?.kind === 'video' && Boolean(firstMedia?.url);
  const imageUrl = !isVideo ? (post.cover_url || firstMedia?.thumbnail_url || firstMedia?.url || '') : '';
  const canCollect = post.materials.length > 0;

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  const authorAvatarUrl = String(post.author.avatar_url || '').trim();
  const canRenderAuthorAvatar = Boolean(authorAvatarUrl) && !avatarFailed;

  React.useEffect(() => {
    setAvatarFailed(false);
  }, [authorAvatarUrl]);

  const handleMouseEnter = React.useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const p = el.play();
    if (p && typeof p.then === 'function') p.then(() => setIsPlaying(true)).catch(() => {});
  }, []);
  const handleMouseLeave = React.useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    try { el.currentTime = 0; } catch { /* noop */ }
    setIsPlaying(false);
  }, []);

  const handleLoadedMetadata = React.useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    try { el.currentTime = 0.001; } catch { /* noop */ }
  }, []);

  return (
    <article className="group relative overflow-hidden rounded-lg border border-white/10 bg-zinc-950">
      <button
        type="button"
        onClick={() => onOpen(post)}
        className="block w-full text-left"
      >
        <div
          className="relative overflow-hidden bg-zinc-900"
          onMouseEnter={isVideo ? handleMouseEnter : undefined}
          onMouseLeave={isVideo ? handleMouseLeave : undefined}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              src={firstMedia!.url}
              muted
              loop
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              className="h-auto w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={post.title}
              loading="lazy"
              decoding="async"
              className="h-auto w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="aspect-[4/5] w-full bg-zinc-900" />
          )}
          {isVideo && !isPlaying ? (
            <div className="pointer-events-none absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white">
              <Play className="h-4 w-4 fill-current" />
            </div>
          ) : null}
        </div>

        <div className="px-3 py-3">
          <p className="line-clamp-2 text-sm font-black leading-5 text-zinc-100">
            {post.title}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span
              role={onAuthorClick ? 'button' : undefined}
              tabIndex={onAuthorClick ? 0 : undefined}
              onClick={(event) => {
                if (!onAuthorClick) return;
                event.stopPropagation();
                onAuthorClick(post.author);
              }}
              onKeyDown={(event) => {
                if (!onAuthorClick || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                event.stopPropagation();
                onAuthorClick(post.author);
              }}
              className={`inline-flex min-w-0 items-center gap-2 truncate font-bold text-zinc-400 ${onAuthorClick ? 'hover:text-orange-200' : ''}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-900">
                {canRenderAuthorAvatar ? (
                  <img
                    src={authorAvatarUrl}
                    alt={post.author.name || 'creator'}
                    className="h-full w-full object-cover"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <User className="h-3.5 w-3.5 text-zinc-600" />
                )}
              </span>
              <span className="min-w-0 truncate">@{post.author.name || 'creator'}</span>
            </span>
          </div>
        </div>
      </button>

      <div className="grid grid-cols-3 border-t border-white/10 bg-zinc-950/95">
        <button
          type="button"
          title={labels.like}
          aria-label={labels.like}
          onClick={() => onLike?.(post)}
          className={`flex h-10 items-center justify-center gap-1 text-xs font-bold transition ${post.is_liked ? 'text-red-300' : 'text-zinc-300 hover:text-red-300'}`}
        >
          <Heart className={`h-4 w-4 ${post.is_liked ? 'fill-current' : ''}`} />
          {post.like_count}
        </button>
        <button
          type="button"
          title={labels.favorite}
          aria-label={labels.favorite}
          onClick={() => onFavorite?.(post)}
          className={`flex h-10 items-center justify-center gap-1 text-xs font-bold transition ${post.is_favorited ? 'text-orange-300' : 'text-zinc-300 hover:text-orange-300'}`}
        >
          <Bookmark className={`h-4 w-4 ${post.is_favorited ? 'fill-current' : ''}`} />
          {post.favorite_count}
        </button>
        <button
          type="button"
          title={post.is_collected ? labels.uncollect : labels.collect}
          aria-label={post.is_collected ? labels.uncollect : labels.collect}
          disabled={!canCollect}
          onClick={() => onCollectFirstMaterial?.(post)}
          className={`flex h-10 items-center justify-center gap-1 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${post.is_collected ? 'text-emerald-300' : 'text-zinc-300 hover:text-emerald-300'}`}
        >
          <Library className="h-4 w-4" />
          {post.collect_count}
        </button>
      </div>
    </article>
  );
});

CommunityPostCard.displayName = 'CommunityPostCard';
