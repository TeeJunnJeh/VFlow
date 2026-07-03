import React from 'react';
import { AlertCircle, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRequireAuth } from '../../utils/useRequireAuth';
import { communityApi, isCommunityApiUnavailableError, type CommunityCreateDraft, type CommunityPost, type CommunityPostType, type CommunityReactionAction } from '../../services/community';
import { CommunityComposerDialog } from './CommunityComposerDialog';
import { CommunityPostCard } from './CommunityPostCard';
import { CommunityPostDetailDialog } from './CommunityPostDetailDialog';
import { getCommunityPreviewPosts } from './communityPreviewPosts';

type CommunityFilter = 'all' | CommunityPostType;

type LoadOptions = {
  cursor?: string | null;
  append?: boolean;
};

const FILTERS: CommunityFilter[] = ['all', 'material_share', 'experience'];
const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 320;

const mergeUniquePosts = (current: CommunityPost[], incoming: CommunityPost[]) => {
  const seen = new Set(current.map((post) => post.id));
  return [...current, ...incoming.filter((post) => post.id && !seen.has(post.id))];
};

const getErrorMessage = (err: unknown, fallback: string) => {
  const message = err instanceof Error ? err.message : String(err || '');
  return message || fallback;
};

export const CommunityView = () => {
  const { t } = useLanguage();
  const { requireAuth } = useRequireAuth();
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [filter, setFilter] = React.useState<CommunityFilter>('all');
  const [posts, setPosts] = React.useState<CommunityPost[]>([]);
  const [selectedPost, setSelectedPost] = React.useState<CommunityPost | null>(null);
  const [isComposerOpen, setIsComposerOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const loadRequestIdRef = React.useRef(0);
  const toastTimerRef = React.useRef<number | null>(null);

  const labels = React.useMemo(() => ({
    title: (t as any).community_title || 'Creator Community',
    search: (t as any).community_search_placeholder || 'Search posts, materials, creators',
    all: (t as any).community_filter_all || 'All',
    material: (t as any).community_filter_material || 'Materials',
    experience: (t as any).community_filter_experience || 'Experience',
    publish: (t as any).community_publish || 'Publish',
    publishing: (t as any).community_publishing || 'Publishing...',
    empty: (t as any).community_empty || 'No posts',
    loading: (t as any).community_loading || 'Loading posts...',
    retry: (t as any).community_retry || 'Retry',
    loadMore: (t as any).community_load_more || 'Load more',
    noMore: (t as any).community_no_more || 'All posts loaded',
    loadError: (t as any).community_error_load || 'Failed to load community posts',
    previewNotice: (t as any).community_preview_notice || 'Preview posts are shown until the community backend is available.',
    actionError: (t as any).community_error_action || 'Action failed',
    publishError: (t as any).community_error_submit || 'Publish failed',
    like: (t as any).community_like_post || (t as any).community_like || 'Like post',
    favorite: (t as any).community_favorite_post || (t as any).community_favorite || 'Save post',
    collect: (t as any).community_collect_asset || 'Add to assets',
    uncollect: (t as any).community_uncollect_asset || 'Remove from assets',
    report: (t as any).community_report || 'Report',
    close: (t as any).community_close || 'Close',
    titlePlaceholder: (t as any).community_title_placeholder || 'Post title',
    bodyPlaceholder: (t as any).community_body_placeholder || 'Share a creative note',
    videoRequired: (t as any).community_video_required || 'Video is required',
    materialType: (t as any).community_post_type_material || 'Material share',
    experienceType: (t as any).community_post_type_experience || 'Creative experience',
    submit: (t as any).community_submit || 'Submit',
    cancel: (t as any).community_cancel || 'Cancel',
    publishSuccess: (t as any).community_publish_success || 'Published',
    collectSuccess: (t as any).community_collect_success || 'Added to assets',
    uncollectSuccess: (t as any).community_uncollect_success || 'Removed from assets',
    reportPrompt: (t as any).community_report_prompt || 'Why are you reporting this post?',
    reportDefaultReason: (t as any).community_report_reason_default || 'Inappropriate content',
    reportSuccess: (t as any).community_report_submitted || 'Report submitted',
    videoLabel: (t as any).community_video_label || 'Video',
    imagesLabel: (t as any).community_images_label || 'Images',
    audioLabel: (t as any).community_audio_label || 'Audio',
    assetsLabel: (t as any).community_assets_label || 'Assets',
    assetPickerTitle: (t as any).community_asset_picker_title || 'Select assets',
  }), [t]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const showToast = React.useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2200);
  }, []);

  React.useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const filterLabel = (value: CommunityFilter) => {
    if (value === 'material_share') return labels.material;
    if (value === 'experience') return labels.experience;
    return labels.all;
  };

  const replacePost = React.useCallback((nextPost: CommunityPost) => {
    setPosts((prev) => prev.map((post) => (post.id === nextPost.id ? nextPost : post)));
    setSelectedPost((prev) => (prev?.id === nextPost.id ? nextPost : prev));
  }, []);

  const updatePost = React.useCallback((postId: string, updater: (post: CommunityPost) => CommunityPost) => {
    setPosts((prev) => prev.map((post) => (post.id === postId ? updater(post) : post)));
    setSelectedPost((prev) => (prev?.id === postId ? updater(prev) : prev));
  }, []);

  const loadPosts = React.useCallback(async (options?: LoadOptions) => {
    const cursor = options?.cursor || null;
    const append = Boolean(options?.append && cursor);
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    setErrorMessage(null);
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);

    try {
      const response = await communityApi.listPosts({
        type: filter,
        q: debouncedQuery,
        cursor: cursor || undefined,
        limit: PAGE_SIZE,
      });
      if (loadRequestIdRef.current !== requestId) return;
      setPosts((prev) => (append ? mergeUniquePosts(prev, response.items) : response.items));
      setNextCursor(response.nextCursor);
      setIsPreviewMode(false);
    } catch (err) {
      if (loadRequestIdRef.current !== requestId) return;
      if (isCommunityApiUnavailableError(err)) {
        const previewResponse = getCommunityPreviewPosts({
          type: filter,
          q: debouncedQuery,
          cursor: cursor || undefined,
          limit: PAGE_SIZE,
        });
        setPosts((prev) => (append ? mergeUniquePosts(prev, previewResponse.items) : previewResponse.items));
        setNextCursor(previewResponse.nextCursor);
        setIsPreviewMode(true);
        setErrorMessage(null);
        return;
      }
      if (!append) setPosts([]);
      setNextCursor(null);
      setIsPreviewMode(false);
      setErrorMessage(getErrorMessage(err, labels.loadError));
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [debouncedQuery, filter, labels.loadError]);

  React.useEffect(() => {
    void loadPosts({ append: false });
  }, [loadPosts]);

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !nextCursor || isLoading || isLoadingMore || errorMessage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadPosts({ cursor: nextCursor, append: true });
      }
    }, { rootMargin: '360px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [errorMessage, isLoading, isLoadingMore, loadPosts, nextCursor]);

  const openPost = React.useCallback((post: CommunityPost) => {
    setSelectedPost(post);
    if (post.is_placeholder) return;
    void communityApi.getPostDetail(post.id)
      .then(replacePost)
      .catch(() => {
        // The list payload is enough for first render; detail can be retried by reopening later.
      });
  }, [replacePost]);

  const handleReaction = React.useCallback(async (post: CommunityPost, action: CommunityReactionAction) => {
    if (!requireAuth()) return;
    const previous = post;
    const nextValue = action === 'like' ? !post.is_liked : !post.is_favorited;

    updatePost(post.id, (current) => {
      if (action === 'like') {
        const delta = current.is_liked === nextValue ? 0 : (nextValue ? 1 : -1);
        return { ...current, is_liked: nextValue, like_count: Math.max(0, current.like_count + delta) };
      }
      const delta = current.is_favorited === nextValue ? 0 : (nextValue ? 1 : -1);
      return { ...current, is_favorited: nextValue, favorite_count: Math.max(0, current.favorite_count + delta) };
    });

    if (post.is_placeholder) return;

    try {
      const response = await communityApi.setReaction(post.id, action, nextValue);
      const data = response?.data || {};
      updatePost(post.id, (current) => ({
        ...current,
        is_liked: data.is_liked === undefined ? current.is_liked : Boolean(data.is_liked),
        is_favorited: data.is_favorited === undefined ? current.is_favorited : Boolean(data.is_favorited),
        like_count: Number(data.like_count ?? current.like_count),
        favorite_count: Number(data.favorite_count ?? data.star_count ?? current.favorite_count),
      }));
    } catch (err) {
      updatePost(post.id, () => previous);
      setErrorMessage(getErrorMessage(err, labels.actionError));
    }
  }, [labels.actionError, requireAuth, updatePost]);

  const handleCollectMaterial = React.useCallback(async (post: CommunityPost, materialId: string) => {
    if (!materialId) return;
    if (!requireAuth()) return;
    const previous = post;
    const nextValue = !post.is_collected;

    updatePost(post.id, (current) => {
      const delta = current.is_collected === nextValue ? 0 : (nextValue ? 1 : -1);
      return {
        ...current,
        is_collected: nextValue,
        collect_count: Math.max(0, current.collect_count + delta),
      };
    });

    if (post.is_placeholder) {
      showToast(nextValue ? labels.collectSuccess : labels.uncollectSuccess);
      return;
    }

    try {
      const response = await communityApi.collectMaterial(post.id, materialId, nextValue, null);
      const data = response?.data || {};
      updatePost(post.id, (current) => ({
        ...current,
        is_collected: data.is_collected === undefined ? current.is_collected : Boolean(data.is_collected),
        collect_count: Number(data.collect_count ?? current.collect_count),
      }));
      showToast(nextValue ? labels.collectSuccess : labels.uncollectSuccess);
    } catch (err) {
      updatePost(post.id, () => previous);
      setErrorMessage(getErrorMessage(err, labels.actionError));
    }
  }, [labels.actionError, labels.collectSuccess, labels.uncollectSuccess, requireAuth, showToast, updatePost]);

  const handleCollectFirstMaterial = React.useCallback((post: CommunityPost) => {
    const material = post.materials.find((item) => item.can_collect !== false) || post.materials[0];
    if (material) void handleCollectMaterial(post, material.id);
  }, [handleCollectMaterial]);

  const handleReport = React.useCallback(async (post: CommunityPost) => {
    if (typeof window === 'undefined') return;
    if (!requireAuth()) return;
    const reason = window.prompt(labels.reportPrompt, labels.reportDefaultReason);
    if (reason === null) return;

    if (post.is_placeholder) {
      showToast(labels.reportSuccess);
      return;
    }

    try {
      await communityApi.reportPost(post.id, reason.trim() || labels.reportDefaultReason);
      showToast(labels.reportSuccess);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, labels.actionError));
    }
  }, [labels.actionError, labels.reportDefaultReason, labels.reportPrompt, labels.reportSuccess, requireAuth, showToast]);

  const handleSubmitPost = React.useCallback(async (draft: CommunityCreateDraft) => {
    if (!requireAuth()) return;
    setIsSubmittingPost(true);
    setErrorMessage(null);
    try {
      const created = await communityApi.createPost(draft);
      if (created.id) {
        setPosts((prev) => [created, ...prev.filter((post) => post.id !== created.id)]);
      }
      setIsComposerOpen(false);
      showToast(labels.publishSuccess);
    } catch (err) {
      const message = getErrorMessage(err, labels.publishError);
      setErrorMessage(message);
      throw new Error(message);
    } finally {
      setIsSubmittingPost(false);
    }
  }, [labels.publishError, labels.publishSuccess, requireAuth, showToast]);

  const hasPosts = posts.length > 0;

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col bg-[#050505]">
      <header className="shrink-0 border-b border-white/5 px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-black tracking-tight text-zinc-100">{labels.title}</h1>
          <button
            type="button"
            onClick={() => {
              if (!requireAuth()) return;
              setIsComposerOpen(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white shadow-lg shadow-orange-950/30 hover:bg-orange-400"
          >
            <Plus className="h-4 w-4" />
            {labels.publish}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.search}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/35 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-orange-400/70"
            />
          </div>
          <div className="flex items-center gap-2">
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`h-10 rounded-lg border px-3 text-xs font-bold transition ${
                  filter === value
                    ? 'border-orange-400/60 bg-orange-500/15 text-orange-200'
                    : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10'
                }`}
              >
                {filterLabel(value)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="custom-scroll flex-1 overflow-y-auto px-8 py-6">
        {isPreviewMode ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{labels.previewNotice}</span>
          </div>
        ) : null}

        {errorMessage && hasPosts ? (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">{errorMessage}</span>
            </div>
            <button type="button" onClick={() => void loadPosts({ append: false })} className="shrink-0 text-xs font-bold text-red-100 hover:text-white">
              {labels.retry}
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex h-72 items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] text-sm font-bold text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            {labels.loading}
          </div>
        ) : errorMessage && !hasPosts ? (
          <div className="flex h-72 flex-col items-center justify-center gap-4 rounded-lg border border-red-400/20 bg-red-500/10 px-6 text-center text-sm text-red-100">
            <AlertCircle className="h-7 w-7" />
            <div className="max-w-lg break-words font-bold">{errorMessage}</div>
            <button
              type="button"
              onClick={() => void loadPosts({ append: false })}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200/20 bg-red-200/10 px-4 text-xs font-bold text-red-50 hover:bg-red-200/20"
            >
              <RefreshCw className="h-4 w-4" />
              {labels.retry}
            </button>
          </div>
        ) : hasPosts ? (
          <>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
              {posts.map((post) => (
                <CommunityPostCard
                  key={post.id}
                  post={post}
                  labels={{ like: labels.like, favorite: labels.favorite, collect: labels.collect, uncollect: labels.uncollect }}
                  onOpen={openPost}
                  onLike={(item) => void handleReaction(item, 'like')}
                  onFavorite={(item) => void handleReaction(item, 'favorite')}
                  onCollectFirstMaterial={handleCollectFirstMaterial}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="flex h-20 items-center justify-center text-xs font-bold text-zinc-500">
              {isLoadingMore ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{labels.loading}</span>
              ) : nextCursor ? (
                <button type="button" onClick={() => void loadPosts({ cursor: nextCursor, append: true })} className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-zinc-300 hover:bg-white/10">
                  {labels.loadMore}
                </button>
              ) : (
                labels.noMore
              )}
            </div>
          </>
        ) : (
          <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm font-bold text-zinc-500">
            {labels.empty}
          </div>
        )}
      </main>

      <CommunityComposerDialog
        isOpen={isComposerOpen}
        isSubmitting={isSubmittingPost}
        labels={{
          close: labels.close,
          cancel: labels.cancel,
          submit: labels.submit,
          submitting: labels.publishing,
          titlePlaceholder: labels.titlePlaceholder,
          bodyPlaceholder: labels.bodyPlaceholder,
          videoRequired: labels.videoRequired,
          materialType: labels.materialType,
          experienceType: labels.experienceType,
          videoLabel: labels.videoLabel,
          imagesLabel: labels.imagesLabel,
          audioLabel: labels.audioLabel,
          assetsLabel: labels.assetsLabel,
          assetPickerTitle: labels.assetPickerTitle,
        }}
        onClose={() => setIsComposerOpen(false)}
        onSubmit={handleSubmitPost}
      />

      <CommunityPostDetailDialog
        post={selectedPost}
        labels={{
          close: labels.close,
          like: labels.like,
          favorite: labels.favorite,
          collect: labels.collect,
          uncollect: labels.uncollect,
          report: labels.report,
        }}
        onClose={() => setSelectedPost(null)}
        onLike={(item) => void handleReaction(item, 'like')}
        onFavorite={(item) => void handleReaction(item, 'favorite')}
        onCollectMaterial={handleCollectMaterial}
        onReport={(item) => void handleReport(item)}
      />

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-[130] rounded-lg border border-emerald-300/20 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-100 shadow-2xl backdrop-blur">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
};
