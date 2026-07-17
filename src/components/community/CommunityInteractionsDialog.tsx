import React from 'react';
import { Check, Loader2, User, X } from 'lucide-react';
import type { CommunityAuthor, CommunityInteractionTab } from '../../services/community';

interface CommunityInteractionsDialogProps {
  isOpen: boolean;
  activeTab: CommunityInteractionTab;
  items: CommunityAuthor[];
  isLoading: boolean;
  errorMessage?: string | null;
  total?: number;
  labels: {
    title: string;
    followers: string;
    following: string;
    likes: string;
    emptyFollowers: string;
    emptyFollowing: string;
    emptyLikes: string;
    loading: string;
    followed: string;
    follow: string;
    posts: string;
    followersMeta: string;
    noMore: string;
    close: string;
  };
  currentUserId?: string;
  onClose: () => void;
  onTabChange: (tab: CommunityInteractionTab) => void;
  onAuthorClick?: (author: CommunityAuthor) => void;
  onFollowAuthor?: (author: CommunityAuthor, value: boolean) => void;
}

const TABS: CommunityInteractionTab[] = ['followers', 'following', 'likes'];

const statNumber = (value: unknown, fallback = 0) => {
  const next = Number(value ?? fallback);
  return Number.isFinite(next) ? next : fallback;
};

const CommunityInteractionAvatar = ({ author, onClick }: { author: CommunityAuthor; onClick?: () => void }) => {
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  const avatarUrl = String(author.avatar_url || '').trim();
  const canRenderAvatar = Boolean(avatarUrl) && !avatarFailed;

  React.useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-950"
    >
      {canRenderAvatar ? (
        <img
          src={avatarUrl}
          alt={author.name || 'creator'}
          className="h-full w-full object-cover"
          onError={() => setAvatarFailed(true)}
        />
      ) : (
        <User className="h-8 w-8 text-zinc-600" />
      )}
    </button>
  );
};

export const CommunityInteractionsDialog = ({
  isOpen,
  activeTab,
  items,
  isLoading,
  errorMessage,
  labels,
  currentUserId = '',
  onClose,
  onTabChange,
  onAuthorClick,
  onFollowAuthor,
}: CommunityInteractionsDialogProps) => {
  if (!isOpen) return null;

  const tabLabel = (tab: CommunityInteractionTab) => {
    if (tab === 'followers') return labels.followers;
    if (tab === 'following') return labels.following;
    return labels.likes;
  };

  const emptyText = activeTab === 'followers'
    ? labels.emptyFollowers
    : activeTab === 'following'
      ? labels.emptyFollowing
      : labels.emptyLikes;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onClick={onClose}>
      <section
        className="flex h-[min(82vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-8 pt-7">
          <h2 className="text-xl font-black text-zinc-100">{labels.title}</h2>
          <button
            type="button"
            title={labels.close}
            aria-label={labels.close}
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mx-8 mt-6 flex items-end gap-8 border-b border-white/10">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={`community-detail-tab ${activeTab === tab ? 'community-detail-tab-active' : ''}`}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>

        <div className="custom-scroll mx-8 mb-8 mt-6 flex-1 overflow-y-auto rounded-lg bg-white/[0.04]">
          {isLoading ? (
            <div className="flex h-full min-h-[420px] items-center justify-center gap-3 text-sm font-bold text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              {labels.loading}
            </div>
          ) : errorMessage ? (
            <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center text-sm font-bold text-red-200">
              {errorMessage}
            </div>
          ) : items.length > 0 ? (
            <div className="px-6 py-5">
              {items.map((author, index) => {
                const isSelf = Boolean(currentUserId && author.id && String(currentUserId) === String(author.id));
                const isFollowing = Boolean(author.is_following);
                return (
                  <div key={author.id || index} className="flex items-center gap-5 border-b border-white/10 py-5 last:border-b-0">
                    <CommunityInteractionAvatar author={author} onClick={() => onAuthorClick?.(author)} />
                    <button type="button" onClick={() => onAuthorClick?.(author)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-lg font-black text-zinc-100">{author.name || 'creator'}</div>
                      <div className="mt-2 flex items-center gap-4 text-sm font-bold text-zinc-400">
                        <span>{labels.posts}: {statNumber(author.post_count ?? author.works_count, 0)}</span>
                        <span className="h-4 w-px bg-white/10" />
                        <span>{labels.followersMeta}: {statNumber(author.follower_count ?? author.fans_count, 0)}</span>
                      </div>
                    </button>
                    {!isSelf && activeTab !== 'followers' ? (
                      <button
                        type="button"
                        onClick={() => onFollowAuthor?.(author, !isFollowing)}
                        className={`inline-flex h-11 min-w-[112px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-black transition ${isFollowing ? 'bg-white/10 text-zinc-300 hover:bg-white/15' : 'bg-orange-500 text-white hover:bg-orange-400'}`}
                      >
                        {isFollowing ? <Check className="h-4 w-4" /> : null}
                        {isFollowing ? labels.followed : labels.follow}
                      </button>
                    ) : null}
                  </div>
                );
              })}
              <div className="py-5 text-center text-sm font-bold text-zinc-500">{labels.noMore}</div>
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center text-sm font-bold text-zinc-500">
              {emptyText}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
