import React from 'react';
import { ArrowLeft, Loader2, Plus, User, UserPlus } from 'lucide-react';
import Masonry from 'react-masonry-css';
import type { CommunityAuthor, CommunityInteractionTab, CommunityPost, CommunityPostType } from '../../services/community';
import { CommunityPostCard } from './CommunityPostCard';

type CommunityProfileFilter = 'all' | CommunityPostType;

interface CommunityAuthorProfileViewProps {
  author: CommunityAuthor;
  posts: CommunityPost[];
  isLoading: boolean;
  errorMessage?: string | null;
  filter: CommunityProfileFilter;
  isOwnProfile?: boolean;
  labels: {
    all: string;
    material: string;
    experience: string;
    empty: string;
    loading: string;
    back: string;
    follow: string;
    followed: string;
    followers: string;
    following: string;
    likes: string;
    posts: string;
    publish: string;
  };
  cardLabels: {
    like: string;
    favorite: string;
    collect: string;
    uncollect: string;
  };
  onBack: () => void;
  onFilterChange: (filter: CommunityProfileFilter) => void;
  onOpenPost: (post: CommunityPost) => void;
  onPublish?: () => void;
  onOpenInteractions?: (tab: CommunityInteractionTab) => void;
  onFollowAuthor?: (author: CommunityAuthor, value: boolean) => void;
  onLike?: (post: CommunityPost) => void;
  onFavorite?: (post: CommunityPost) => void;
  onCollectFirstMaterial?: (post: CommunityPost) => void;
  onAuthorClick?: (author: CommunityAuthor) => void;
}

const PROFILE_FILTERS: CommunityProfileFilter[] = ['all', 'material_share', 'experience'];

const PROFILE_MASONRY_BREAKPOINT_COLS = {
  default: 6,
  1536: 5,
  1280: 4,
  1024: 3,
  640: 2,
  0: 1,
};

const statNumber = (value: unknown, fallback = 0) => {
  const next = Number(value ?? fallback);
  return Number.isFinite(next) ? next : fallback;
};

export const CommunityAuthorProfileView = ({
  author,
  posts,
  isLoading,
  errorMessage,
  filter,
  isOwnProfile = false,
  labels,
  cardLabels,
  onBack,
  onFilterChange,
  onOpenPost,
  onPublish,
  onOpenInteractions,
  onFollowAuthor,
  onLike,
  onFavorite,
  onCollectFirstMaterial,
  onAuthorClick,
}: CommunityAuthorProfileViewProps) => {
  const authorName = author.name || 'creator';
  const postCount = statNumber(author.post_count ?? author.works_count, posts.length);
  const followerCount = statNumber(author.follower_count ?? author.fans_count, 0);
  const followingCount = statNumber(author.following_count, 0);
  const likeCount = statNumber(author.like_count, posts.reduce((sum, item) => sum + statNumber(item.like_count, 0), 0));
  const isFollowing = Boolean(author.is_following);
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  const avatarUrl = String(author.avatar_url || '').trim();
  const canRenderAvatar = Boolean(avatarUrl) && !avatarFailed;

  React.useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  const filterLabel = (value: CommunityProfileFilter) => {
    if (value === 'material_share') return labels.material;
    if (value === 'experience') return labels.experience;
    return labels.all;
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-zinc-300 hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {labels.back}
      </button>

      <section className="community-profile-hero relative overflow-hidden rounded-lg border border-white/10">
        <div className="relative px-6 pb-9 pt-14 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-zinc-900 shadow-xl shadow-black/40">
            {canRenderAvatar ? (
              <img
                src={avatarUrl}
                alt={authorName}
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <User className="h-10 w-10 text-zinc-600" />
            )}
          </div>
          <h2 className="mt-4 text-2xl font-black text-white">{authorName}</h2>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-12 text-sm sm:gap-16">
            <button
              type="button"
              disabled={!isOwnProfile}
              onClick={() => onOpenInteractions?.('followers')}
              className={`community-profile-stat-button text-center ${isOwnProfile ? 'cursor-pointer hover:opacity-85' : 'cursor-default'}`}
            >
              <div className="text-xl font-black text-white">{followerCount}</div>
              <div className="mt-1 font-bold text-zinc-400">{labels.followers}</div>
            </button>
            <button
              type="button"
              disabled={!isOwnProfile}
              onClick={() => onOpenInteractions?.('following')}
              className={`community-profile-stat-button text-center ${isOwnProfile ? 'cursor-pointer hover:opacity-85' : 'cursor-default'}`}
            >
              <div className="text-xl font-black text-white">{followingCount}</div>
              <div className="mt-1 font-bold text-zinc-400">{labels.following}</div>
            </button>
            <button
              type="button"
              disabled={!isOwnProfile}
              onClick={() => onOpenInteractions?.('likes')}
              className={`community-profile-stat-button text-center ${isOwnProfile ? 'cursor-pointer hover:opacity-85' : 'cursor-default'}`}
            >
              <div className="text-xl font-black text-white">{likeCount}</div>
              <div className="mt-1 font-bold text-zinc-400">{labels.likes}</div>
            </button>
            <div className="text-center">
              <div className="text-xl font-black text-white">{postCount}</div>
              <div className="mt-1 font-bold text-zinc-400">{labels.posts}</div>
            </div>
          </div>
          {!isOwnProfile ? (
            <button
              type="button"
              onClick={() => onFollowAuthor?.(author, !isFollowing)}
              className={`mx-auto mt-6 inline-flex h-11 items-center gap-2 rounded-lg px-7 text-sm font-black shadow-lg transition ${isFollowing ? 'border border-white/10 bg-white/10 text-zinc-100 hover:bg-white/15' : 'bg-orange-500 text-white shadow-orange-950/30 hover:bg-orange-400'}`}
            >
              <UserPlus className="h-4 w-4" />
              {isFollowing ? labels.followed : labels.follow}
            </button>
          ) : null}
        </div>
      </section>

      <div className="flex items-end justify-between gap-4 border-b border-white/10">
        <div className="flex items-end gap-8">
          {PROFILE_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onFilterChange(value)}
              className={`community-detail-tab ${filter === value ? 'community-detail-tab-active' : ''}`}
            >
              {filterLabel(value)}{value === 'all' ? ` (${postCount})` : ''}
            </button>
          ))}
        </div>
        {isOwnProfile ? (
          <button
            type="button"
            onClick={onPublish}
            className="mb-3 inline-flex h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white shadow-lg shadow-orange-950/30 hover:bg-orange-400"
          >
            <Plus className="h-4 w-4" />
            {labels.publish}
          </button>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex h-56 items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] text-sm font-bold text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          {labels.loading}
        </div>
      ) : posts.length > 0 ? (
        <Masonry
          breakpointCols={PROFILE_MASONRY_BREAKPOINT_COLS}
          className="community-masonry-grid"
          columnClassName="community-masonry-grid-col"
        >
          {posts.map((post) => (
            <CommunityPostCard
              key={post.id}
              post={post}
              labels={cardLabels}
              onOpen={onOpenPost}
              onLike={onLike}
              onFavorite={onFavorite}
              onCollectFirstMaterial={onCollectFirstMaterial}
              onAuthorClick={onAuthorClick}
            />
          ))}
        </Masonry>
      ) : (
        <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm font-bold text-zinc-500">
          {labels.empty}
        </div>
      )}
    </div>
  );
};