import React from 'react';
import { Bookmark, ChevronLeft, ChevronRight, Flag, Heart, Library, Loader2, Reply, Send, SlidersHorizontal, Sparkles, Trash2, User, UserPlus, X } from 'lucide-react';
import { assetsApi } from '../../services/assets';
import { communityApi, type CommunityAuthor, type CommunityComment, type CommunityPost, type CommunitySharedSkill } from '../../services/community';
import { useRequireAuth } from '../../utils/useRequireAuth';

const CREATION_FEATURE_LABELS: Record<string, string> = {
  first_frame: '首帧生成',
  gallery: '商品套图',
  text_separation: '文字分离',
  smart_repair: '智能修复',
  clothing_swap: 'AI 换装',
  ai_model: 'AI 模特',
};

const formatSharedSkill = (skill: CommunitySharedSkill): string => {
  const lines: string[] = [];
  if (skill.name) lines.push(`【${String(skill.name)}】`);
  if (skill.summary) lines.push(String(skill.summary));
  if (skill.description) lines.push(String(skill.description));
  const tags = Array.isArray(skill.tags) ? skill.tags.filter(Boolean) : [];
  if (tags.length) lines.push(`标签：${tags.map(String).join('、')}`);
  const recipe = (skill.recipe && typeof skill.recipe === 'object') ? (skill.recipe as Record<string, unknown>) : null;
  if (recipe) {
    const labelMap: Record<string, string> = { hook: '开场钩子', structure: '分镜结构', pacing: '节奏', tone: '调性', camera: '运镜', lighting: '光线', music: '音乐' };
    lines.push('创作配方：');
    Object.entries(recipe).forEach(([k, v]) => {
      const label = labelMap[k] || k;
      const val = Array.isArray(v) ? v.map(String).join(' / ') : String(v ?? '');
      if (val) lines.push(`· ${label}：${val}`);
    });
  }
  if (skill.seed) lines.push(`种子 Seed：#${String(skill.seed)}`);
  return lines.join('\n');
};

interface CommunityPostDetailDialogProps {
  post: CommunityPost | null;
  labels: {
    close: string;
    like: string;
    favorite: string;
    collect: string;
    uncollect: string;
    report: string;
    detailTab: string;
    commentsTab: string;
    commentsEmpty: string;
    commentsPlaceholder: string;
    replyPlaceholder: string;
    replyAction: string;
    cancelReply: string;
    submitComment: string;
    submittingComment: string;
    commentsLoadError: string;
    commentsDisabled: string;
  };
  onClose: () => void;
  onLike?: (post: CommunityPost) => void;
  onFavorite?: (post: CommunityPost) => void;
  onCollectMaterial?: (post: CommunityPost, materialId: string) => void;
  onReport?: (post: CommunityPost) => void;
  onCommentCountChange?: (postId: string, count: number) => void;
  onAuthorClick?: (author: CommunityAuthor) => void;
  onFollowAuthor?: (author: CommunityAuthor, value: boolean) => void;
  currentUserId?: string;
}

export const CommunityPostDetailDialog = ({
  post,
  labels,
  onClose,
  onLike,
  onFavorite,
  onCollectMaterial,
  onReport,
  onCommentCountChange,
  onAuthorClick,
  onFollowAuthor,
  currentUserId = '',
}: CommunityPostDetailDialogProps) => {
  const { requireAuth } = useRequireAuth();
  const [savingSkill, setSavingSkill] = React.useState(false);
  const [skillSaved, setSkillSaved] = React.useState(false);
  const [skillMsg, setSkillMsg] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'detail' | 'comments'>('detail');
  const [comments, setComments] = React.useState<CommunityComment[]>([]);
  const [commentsTotal, setCommentsTotal] = React.useState(0);
  const [isCommentsLoading, setIsCommentsLoading] = React.useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = React.useState(false);
  const [deletingCommentId, setDeletingCommentId] = React.useState('');
  const [commentsError, setCommentsError] = React.useState('');
  const [commentDraft, setCommentDraft] = React.useState('');
  const [replyDraft, setReplyDraft] = React.useState('');
  const [replyingTo, setReplyingTo] = React.useState<CommunityComment | null>(null);
  const [brokenAvatarUrls, setBrokenAvatarUrls] = React.useState<Record<string, true>>({});
  const [activeMediaIndex, setActiveMediaIndex] = React.useState(0);
  const detailVideoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    setSavingSkill(false);
    setSkillSaved(false);
    setSkillMsg('');
    setActiveTab('detail');
    setComments([]);
    setCommentsTotal(Number(post?.comment_count || 0));
    setIsCommentsLoading(false);
    setIsSubmittingComment(false);
    setDeletingCommentId('');
    setCommentsError('');
    setCommentDraft('');
    setReplyDraft('');
    setReplyingTo(null);
    setBrokenAvatarUrls({});
    const videoIndex = post?.media.findIndex((item) => item.kind === 'video') ?? -1;
    setActiveMediaIndex(videoIndex >= 0 ? videoIndex : 0);
  }, [post?.id]);

  React.useEffect(() => {
    const el = detailVideoRef.current;
    const currentMedia = post?.media[activeMediaIndex];
    if (!el || currentMedia?.kind !== 'video') return;
    const timer = window.setTimeout(() => {
      const promise = el.play();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [post?.id, activeMediaIndex]);

  const saveSharedSkill = React.useCallback(async () => {
    const skill = post?.shared_skill;
    if (!skill) return;
    setSavingSkill(true);
    setSkillMsg('');
    try {
      await assetsApi.createSeedSkillAsset({
        seed: skill.seed !== undefined && skill.seed !== null ? String(skill.seed) : '',
        seed_skill: skill as Record<string, unknown>,
        display_name: String(skill.name || 'Seed Skill'),
      });
      setSkillSaved(true);
      setSkillMsg('已保存到素材库');
    } catch (err) {
      setSkillMsg(err instanceof Error ? err.message : '保存失败，请确认已登录');
    } finally {
      setSavingSkill(false);
    }
  }, [post?.shared_skill, post?.id]);

  const postId = post?.id || '';
  const isPlaceholderPost = Boolean(post?.is_placeholder);

  const syncCommentCount = React.useCallback((count: number) => {
    if (!post?.id) return;
    setCommentsTotal(count);
    if (post.comment_count !== count) {
      onCommentCountChange?.(post.id, count);
    }
  }, [onCommentCountChange, post?.comment_count, post?.id]);

  const loadComments = React.useCallback(async () => {
    if (!postId) return;
    if (isPlaceholderPost) {
      setComments([]);
      syncCommentCount(Number(post?.comment_count || 0));
      setCommentsError(labels.commentsDisabled);
      return;
    }
    setIsCommentsLoading(true);
    setCommentsError('');
    try {
      const response = await communityApi.listComments(postId);
      setComments(response.items);
      syncCommentCount(response.total);
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : labels.commentsLoadError);
    } finally {
      setIsCommentsLoading(false);
    }
  }, [isPlaceholderPost, labels.commentsDisabled, labels.commentsLoadError, post?.comment_count, postId, syncCommentCount]);

  React.useEffect(() => {
    if (activeTab !== 'comments' || !postId) return;
    void loadComments();
  }, [activeTab, loadComments, postId]);

  const submitComment = React.useCallback(async (content: string, parentId?: string | null) => {
    if (!post?.id || !content.trim()) return;
    if (post.is_placeholder) {
      setCommentsError(labels.commentsDisabled);
      return;
    }
    if (!requireAuth()) return;
    setIsSubmittingComment(true);
    setCommentsError('');
    try {
      const response = await communityApi.createComment(post.id, { content: content.trim(), parentId: parentId || null });
      syncCommentCount(response.total);
      await loadComments();
      return true;
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : labels.commentsLoadError);
      return false;
    } finally {
      setIsSubmittingComment(false);
    }
  }, [labels.commentsDisabled, labels.commentsLoadError, loadComments, post, requireAuth, syncCommentCount]);

  const handleSubmitRootComment = React.useCallback(async () => {
    const ok = await submitComment(commentDraft, null);
    if (ok) setCommentDraft('');
  }, [commentDraft, submitComment]);

  const handleSubmitReply = React.useCallback(async () => {
    if (!replyingTo) return;
    const ok = await submitComment(replyDraft, replyingTo.id);
    if (ok) {
      setReplyDraft('');
      setReplyingTo(null);
    }
  }, [replyDraft, replyingTo, submitComment]);

  const updateCommentLikeState = React.useCallback((commentId: string, updater: (comment: CommunityComment) => CommunityComment) => {
    setComments((prev) => prev.map((comment) => {
      if (comment.id === commentId) return updater(comment);
      if (comment.replies.some((reply) => reply.id === commentId)) {
        return {
          ...comment,
          replies: comment.replies.map((reply) => (reply.id === commentId ? updater(reply) : reply)),
        };
      }
      return comment;
    }));
  }, []);

  const handleCommentLike = React.useCallback(async (comment: CommunityComment) => {
    if (isPlaceholderPost) {
      setCommentsError(labels.commentsDisabled);
      return;
    }
    if (!requireAuth()) return;
    const nextValue = !comment.is_liked;
    updateCommentLikeState(comment.id, (current) => ({
      ...current,
      is_liked: nextValue,
      like_count: Math.max(0, current.like_count + (nextValue ? 1 : -1)),
      heat_score: Math.max(0, current.heat_score + (nextValue ? 1 : -1)),
    }));
    try {
      const response = await communityApi.setCommentReaction(postId, comment.id, 'like', nextValue);
      const data = response?.data || {};
      updateCommentLikeState(comment.id, (current) => ({
        ...current,
        is_liked: data.is_liked === undefined ? current.is_liked : Boolean(data.is_liked),
        like_count: Number(data.like_count ?? current.like_count),
        heat_score: Number(data.heat_score ?? current.heat_score),
      }));
    } catch (err) {
      updateCommentLikeState(comment.id, (current) => ({
        ...current,
        is_liked: comment.is_liked,
        like_count: comment.like_count,
        heat_score: comment.heat_score,
      }));
      setCommentsError(err instanceof Error ? err.message : labels.commentsLoadError);
    }
  }, [isPlaceholderPost, labels.commentsDisabled, labels.commentsLoadError, postId, requireAuth, updateCommentLikeState]);

  const handleDeleteComment = React.useCallback(async (comment: CommunityComment) => {
    if (!comment.can_delete) return;
    if (isPlaceholderPost) {
      setCommentsError(labels.commentsDisabled);
      return;
    }
    if (!requireAuth()) return;
    if (!window.confirm('确认删除这条评论吗？')) return;
    setDeletingCommentId(comment.id);
    setCommentsError('');
    try {
      const response = await communityApi.deleteComment(postId, comment.id);
      if (replyingTo?.id === comment.id || replyingTo?.parent_id === comment.id) {
        setReplyingTo(null);
        setReplyDraft('');
      }
      syncCommentCount(response.total);
      await loadComments();
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : labels.commentsLoadError);
    } finally {
      setDeletingCommentId('');
    }
  }, [isPlaceholderPost, labels.commentsDisabled, labels.commentsLoadError, loadComments, postId, replyingTo?.id, replyingTo?.parent_id, requireAuth, syncCommentCount]);

  if (!post) return null;

  const activeMedia = post.media[activeMediaIndex] || post.media[0];
  const mediaCount = post.media.length;
  const hasMultipleMedia = mediaCount > 1;
  const canGoPreviousMedia = activeMediaIndex > 0;
  const canGoNextMedia = activeMediaIndex < mediaCount - 1;
  const goToPreviousMedia = () => setActiveMediaIndex((current) => Math.max(0, current - 1));
  const goToNextMedia = () => setActiveMediaIndex((current) => Math.min(Math.max(mediaCount - 1, 0), current + 1));
  const authorMeta = post.author as typeof post.author & {
    post_count?: number;
    works_count?: number;
    follower_count?: number;
    fans_count?: number;
  };
  const authorName = post.author.name || 'creator';
  const authorPostCount = Number(authorMeta.post_count ?? authorMeta.works_count ?? 1);
  const authorFollowerCount = Number(authorMeta.follower_count ?? authorMeta.fans_count ?? 0);
  const isOwnPostAuthor = Boolean(currentUserId && post.author.id && String(currentUserId) === String(post.author.id));
  const isFollowingAuthor = Boolean(post.author.is_following);
  const postTypeLabel = post.post_type === 'experience' ? '创作经验' : '素材分享';
  const currentCommentTotal = Number(commentsTotal || post.comment_count || 0);
  const creationDetails = post.creation_details;
  const creationDetailRows: Array<[string, string]> = creationDetails ? [
    ['生成类型', CREATION_FEATURE_LABELS[creationDetails.feature_type || ''] || creationDetails.feature_type],
    ['生成模型', creationDetails.model],
    ['画面比例', creationDetails.aspect_ratio],
    ['视频时长', creationDetails.duration !== undefined ? `${creationDetails.duration} 秒` : undefined],
    ['分辨率', creationDetails.resolution],
    ['语言', creationDetails.language],
    ['声音', creationDetails.sound === true || creationDetails.sound === 'on' ? '开启' : creationDetails.sound === false || creationDetails.sound === 'off' ? '关闭' : creationDetails.sound],
    ['Prompt 类型', creationDetails.prompt_type],
    ['风格', creationDetails.style],
    ['镜头数', creationDetails.shot_count !== undefined ? String(creationDetails.shot_count) : undefined],
    ['生成数量', creationDetails.output_count !== undefined ? String(creationDetails.output_count) : undefined],
    ['运镜', creationDetails.camera],
    ['节奏', creationDetails.pacing],
    ['负面提示词', creationDetails.negative_prompt],
  ].filter((row): row is [string, string] => typeof row[1] === 'string' && row[1].trim().length > 0) : [];

  const renderAvatar = (name: string, avatarUrl?: string, author?: CommunityAuthor, sizeClass = 'h-9 w-9') => {
    const normalizedUrl = String(avatarUrl || '').trim();
    const canRenderImage = Boolean(normalizedUrl) && !brokenAvatarUrls[normalizedUrl];
    const content = canRenderImage ? (
      <img
        src={normalizedUrl}
        alt={name}
        className="h-full w-full object-cover"
        onError={() => {
          setBrokenAvatarUrls((prev) => (prev[normalizedUrl] ? prev : { ...prev, [normalizedUrl]: true }));
        }}
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center">
        <User className="h-4 w-4 text-zinc-700" />
      </div>
    );
    const className = `${sizeClass} shrink-0 overflow-hidden rounded-full border border-white/10 bg-zinc-900`;

    if (author && onAuthorClick) {
      return (
        <button type="button" onClick={() => onAuthorClick(author)} className={`${className} hover:border-orange-300/50`}>
          {content}
        </button>
      );
    }

    return <div className={className}>{content}</div>;
  };

  const threadIncludesReplyTarget = (comment: CommunityComment) => (
    replyingTo?.id === comment.id || comment.replies.some((reply) => reply.id === replyingTo?.id)
  );

  const renderReplyComposer = (comment: CommunityComment) => {
    if (!replyingTo || !threadIncludesReplyTarget(comment)) return null;
    const replyTargetName = replyingTo.author.name || '创作者';
    return (
      <div className="mt-3 rounded-xl border border-orange-400/20 bg-orange-500/5 p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold text-orange-100">
          <span>{labels.replyAction} @{replyTargetName}</span>
          <button type="button" onClick={() => { setReplyingTo(null); setReplyDraft(''); }} className="text-zinc-400 hover:text-white">
            {labels.cancelReply}
          </button>
        </div>
        <textarea
          value={replyDraft}
          onChange={(event) => setReplyDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void handleSubmitReply();
            }
          }}
          placeholder={`${labels.replyPlaceholder} @${replyTargetName}`}
          className="min-h-[88px] w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-orange-400/40"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={isSubmittingComment || !replyDraft.trim()}
            onClick={() => void handleSubmitReply()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-black text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmittingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSubmittingComment ? labels.submittingComment : labels.submitComment}
          </button>
        </div>
      </div>
    );
  };

  const renderCommentsPanel = () => (
    <section className="pt-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-black text-zinc-100">评论 {currentCommentTotal}</div>
        </div>
        <textarea
          value={commentDraft}
          onChange={(event) => setCommentDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void handleSubmitRootComment();
            }
          }}
          placeholder={labels.commentsPlaceholder}
          className="min-h-[104px] w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-orange-400/40"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={isSubmittingComment || !commentDraft.trim()}
            onClick={() => void handleSubmitRootComment()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-black text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmittingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSubmittingComment ? labels.submittingComment : labels.submitComment}
          </button>
        </div>
      </div>

      {commentsError ? (
        <div className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-100">
          {commentsError}
        </div>
      ) : null}

      {isCommentsLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
        </div>
      ) : comments.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          {labels.commentsEmpty}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {comments.map((comment) => (
            <article key={comment.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                {renderAvatar(comment.author.name || 'creator', comment.author.avatar_url, comment.author)}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-black text-zinc-100">{comment.author.name || '创作者'}</span>
                    <span className="text-xs font-bold text-zinc-500">{comment.created_at}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{comment.content}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => void handleCommentLike(comment)}
                      className={`inline-flex items-center gap-1 ${comment.is_liked ? 'text-red-300' : 'text-zinc-400 hover:text-red-300'}`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${comment.is_liked ? 'fill-current' : ''}`} />
                      {comment.like_count}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setReplyingTo(comment); setReplyDraft(''); }}
                      className="inline-flex items-center gap-1 text-zinc-400 hover:text-orange-200"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      {labels.replyAction}
                    </button>
                    {comment.can_delete ? (
                      <button
                        type="button"
                        disabled={deletingCommentId === comment.id}
                        onClick={() => void handleDeleteComment(comment)}
                        className="inline-flex items-center gap-1 text-zinc-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingCommentId === comment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        删除
                      </button>
                    ) : null}
                    <span className="text-zinc-500">回复 {comment.reply_count}</span>
                  </div>

                  {comment.replies.length > 0 ? (
                    <div className="mt-4 space-y-3 rounded-xl border border-white/8 bg-black/20 p-3">
                      {comment.replies.map((reply) => (
                        <div key={reply.id} className="flex items-start gap-3">
                          {renderAvatar(reply.author.name || 'creator', reply.author.avatar_url, reply.author)}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-bold text-zinc-100">{reply.author.name || '创作者'}</span>
                              <span className="text-xs font-bold text-zinc-500">{reply.created_at}</span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                              {reply.reply_to_user?.name ? <span className="mr-1 text-orange-200">回复 @{reply.reply_to_user.name}</span> : null}
                              {reply.content}
                            </p>
                            <button
                              type="button"
                              onClick={() => void handleCommentLike(reply)}
                              className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${reply.is_liked ? 'text-red-300' : 'text-zinc-400 hover:text-red-300'}`}
                            >
                              <Heart className={`h-3.5 w-3.5 ${reply.is_liked ? 'fill-current' : ''}`} />
                              {reply.like_count}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setReplyingTo(reply); setReplyDraft(''); }}
                              className="mt-2 ml-3 inline-flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-orange-200"
                            >
                              <Reply className="h-3.5 w-3.5" />
                              {labels.replyAction}
                            </button>
                            {reply.can_delete ? (
                              <button
                                type="button"
                                disabled={deletingCommentId === reply.id}
                                onClick={() => void handleDeleteComment(reply)}
                                className="mt-2 ml-3 inline-flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingCommentId === reply.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                删除
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {renderReplyComposer(comment)}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={onClose}>
      <section
        className="grid h-[min(82vh,760px)] w-full max-w-6xl grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="community-media-stage group/media relative flex min-h-0 items-center justify-center">
          {activeMedia?.kind === 'video' ? (
            <video key={activeMedia.id || activeMedia.url} ref={detailVideoRef} src={activeMedia.url} className="block max-h-full max-w-full object-contain" controls autoPlay playsInline preload="auto" />
          ) : activeMedia?.url ? (
            <img key={activeMedia.id || activeMedia.url} src={activeMedia.url} alt={post.title} className="block max-h-full max-w-full object-contain" />
          ) : (
            <div className="h-full w-full bg-zinc-900" />
          )}

          {hasMultipleMedia ? (
            <>
              <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1.5 text-sm font-black text-white opacity-0 backdrop-blur transition-opacity group-hover/media:opacity-100">
                {activeMediaIndex + 1}/{mediaCount}
              </div>
              {canGoPreviousMedia ? (
                <button
                  type="button"
                  aria-label="上一张"
                  onClick={goToPreviousMedia}
                  className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/65 group-hover/media:opacity-100"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              ) : null}
              {canGoNextMedia ? (
                <button
                  type="button"
                  aria-label="下一张"
                  onClick={goToNextMedia}
                  className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/65 group-hover/media:opacity-100"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              ) : null}
              <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5">
                {post.media.map((item, index) => (
                  <button
                    key={item.id || item.url || index}
                    type="button"
                    aria-label={`查看第 ${index + 1} 张`}
                    onClick={() => setActiveMediaIndex(index)}
                    className={`community-media-dot ${index === activeMediaIndex ? 'community-media-dot-active' : ''}`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <aside className="flex min-h-0 flex-col border-l border-white/10">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {renderAvatar(authorName, post.author.avatar_url, post.author, 'h-12 w-12')}
              <div className="min-w-0">
                <div className="truncate text-base font-black text-zinc-100">{authorName}</div>
                <div className="mt-1 flex items-center gap-3 text-xs font-bold text-zinc-500">
                  <span>作品: {Number.isFinite(authorPostCount) ? authorPostCount : 1}</span>
                  <span className="h-3 w-px bg-white/10" />
                  <span>粉丝: {Number.isFinite(authorFollowerCount) ? authorFollowerCount : 0}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!isOwnPostAuthor ? (
                <button
                  type="button"
                  onClick={() => onFollowAuthor?.(post.author, !isFollowingAuthor)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black shadow-sm transition ${isFollowingAuthor ? 'border border-white/10 bg-white/10 text-zinc-100 hover:bg-white/15' : 'bg-orange-500 text-white shadow-orange-950/20 hover:bg-orange-400'}`}
                >
                  <UserPlus className="h-4 w-4" />
                  {isFollowingAuthor ? '已关注' : '关注'}
                </button>
              ) : null}
              <button type="button" title={labels.close} aria-label={labels.close} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="custom-scroll flex-1 overflow-y-auto px-5 py-5">
            <section>
              <h2 className="community-text-wrap text-2xl font-black leading-8 text-white">{post.title || '未命名作品'}</h2>
              {post.body ? <p className="community-text-wrap mt-4 whitespace-pre-wrap text-base leading-7 text-zinc-100">{post.body}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-zinc-500">
                <span>{postTypeLabel}</span>
                {post.edited_at ? (
                  <span>编辑于 {post.edited_at}</span>
                ) : post.created_at ? (
                  <span>发布于 {post.created_at}</span>
                ) : null}
              </div>
              <div className="mt-5 flex items-end gap-8 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveTab('detail')}
                  className={`community-detail-tab ${activeTab === 'detail' ? 'community-detail-tab-active' : ''}`}
                >
                  {labels.detailTab}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('comments')}
                  className={`community-detail-tab ${activeTab === 'comments' ? 'community-detail-tab-active' : ''}`}
                >
                  {labels.commentsTab} ({currentCommentTotal})
                </button>
              </div>
            </section>

            {activeTab === 'detail' ? (
              <section className="pt-5">
                {creationDetails ? (
                  <div className="rounded-lg border border-orange-300/20 bg-orange-400/[0.06] px-4 py-4">
                    <div className="flex items-center gap-2 text-xs font-black text-orange-100">
                      <SlidersHorizontal className="h-4 w-4" /> 创作详情
                    </div>
                    {creationDetailRows.length > 0 ? (
                      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3">
                        {creationDetailRows.map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <div className="text-[10px] font-bold text-zinc-500">{label}</div>
                            <div className="community-text-wrap mt-1 text-xs font-bold text-zinc-200">{value}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {creationDetails.constraints?.length ? (
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <div className="text-[10px] font-bold text-zinc-500">生成约束</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {creationDetails.constraints.map((constraint, index) => (
                            <span key={`${constraint}-${index}`} className="rounded bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-300">{constraint}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {creationDetails.prompt_public && creationDetails.prompt ? (
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <div className="text-[10px] font-bold text-zinc-500">公开 Prompt</div>
                        <div className="community-text-wrap mt-2 whitespace-pre-wrap rounded-lg bg-black/25 px-3 py-3 text-xs leading-6 text-zinc-300">{creationDetails.prompt}</div>
                      </div>
                    ) : (
                      <div className="mt-4 border-t border-white/10 pt-3 text-[11px] text-zinc-500">作者未公开 Prompt</div>
                    )}
                  </div>
                ) : null}

                {post.shared_skill ? (
                  <div className={creationDetails ? 'mt-5' : ''}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-200">
                        <Sparkles className="h-3.5 w-3.5" /> 分享的创作 Skill
                      </span>
                      <button
                        type="button"
                        onClick={() => void saveSharedSkill()}
                        disabled={savingSkill || skillSaved}
                        className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-400/20 disabled:opacity-60"
                      >
                        {skillSaved ? '已保存到素材库' : savingSkill ? '保存中...' : '保存到素材库'}
                      </button>
                    </div>
                    <div
                      className="community-text-wrap whitespace-pre-wrap rounded-lg bg-white/[0.03] px-4 py-3 text-xs leading-6 text-zinc-300"
                      style={{ fontFamily: '"楷体", KaiTi, STKaiti, "楷体_GB2312", serif' }}
                    >
                      {formatSharedSkill(post.shared_skill)}
                    </div>
                    {skillMsg ? <div className="mt-1.5 text-[11px] font-bold text-amber-200/80">{skillMsg}</div> : null}
                  </div>
                ) : null}

                {post.materials.length > 0 ? (
                  <div className={`${post.shared_skill || creationDetails ? 'mt-5 border-t border-dashed border-white/15 pt-4' : 'mt-0'} grid gap-2`}>
                    <div className="text-xs font-black text-zinc-400">可收集素材</div>
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
              </section>
            ) : renderCommentsPanel()}
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
