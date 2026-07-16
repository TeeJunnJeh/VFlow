import React from 'react';
import { Bookmark, Flag, Heart, Library, Sparkles, User, UserPlus, X } from 'lucide-react';
import { assetsApi } from '../../services/assets';
import type { CommunityPost, CommunitySharedSkill } from '../../services/community';

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
  const [savingSkill, setSavingSkill] = React.useState(false);
  const [skillSaved, setSkillSaved] = React.useState(false);
  const [skillMsg, setSkillMsg] = React.useState('');
  const detailVideoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    setSavingSkill(false);
    setSkillSaved(false);
    setSkillMsg('');
  }, [post?.id]);

  React.useEffect(() => {
    const el = detailVideoRef.current;
    if (!el || !post?.media.some((item) => item.kind === 'video')) return;
    const timer = window.setTimeout(() => {
      const promise = el.play();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [post?.id]);

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

  if (!post) return null;

  const primaryMedia = post.media.find((item) => item.kind === 'video') || post.media[0];
  const authorMeta = post.author as typeof post.author & {
    post_count?: number;
    works_count?: number;
    follower_count?: number;
    fans_count?: number;
  };
  const authorName = post.author.name || 'creator';
  const authorPostCount = Number(authorMeta.post_count ?? authorMeta.works_count ?? 1);
  const authorFollowerCount = Number(authorMeta.follower_count ?? authorMeta.fans_count ?? 0);
  const postTypeLabel = post.post_type === 'experience' ? '创作经验' : '素材分享';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={onClose}>
      <section
        className="grid h-[min(82vh,760px)] w-full max-w-6xl grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative flex min-h-0 items-center justify-center bg-black">
          {primaryMedia?.kind === 'video' ? (
            <video ref={detailVideoRef} src={primaryMedia.url} className="block max-h-full max-w-full object-contain" controls autoPlay playsInline preload="auto" />
          ) : primaryMedia?.url ? (
            <img src={primaryMedia.url} alt={post.title} className="block max-h-full max-w-full object-contain" />
          ) : (
            <div className="h-full w-full bg-zinc-900" />
          )}
        </div>

        <aside className="flex min-h-0 flex-col border-l border-white/10">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-zinc-900">
                {post.author.avatar_url ? (
                  <img src={post.author.avatar_url} alt={authorName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <User className="h-6 w-6 text-zinc-700" />
                  </div>
                )}
              </div>
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
              <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-500 px-3 text-xs font-black text-white shadow-sm shadow-orange-950/20 hover:bg-orange-400">
                <UserPlus className="h-4 w-4" />
                关注
              </button>
              <button type="button" title={labels.close} aria-label={labels.close} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="custom-scroll flex-1 overflow-y-auto px-5 py-5">
            <section className="border-b border-white/10 pb-5">
              <h2 className="text-2xl font-black leading-8 text-white">{post.title || '未命名作品'}</h2>
              {post.body ? <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-zinc-100">{post.body}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-zinc-500">
                <span>{postTypeLabel}</span>
                {post.created_at ? <span>{post.created_at}</span> : null}
              </div>
            </section>

            <section className="pt-5">
              {post.shared_skill ? (
                <div className="border-t border-dashed border-white/15 pt-4 first:border-t-0 first:pt-0">
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
                    className="whitespace-pre-wrap rounded-lg bg-white/[0.03] px-4 py-3 text-xs leading-6 text-zinc-300"
                    style={{ fontFamily: '"楷体", KaiTi, STKaiti, "楷体_GB2312", serif' }}
                  >
                    {formatSharedSkill(post.shared_skill)}
                  </div>
                  {skillMsg ? <div className="mt-1.5 text-[11px] font-bold text-amber-200/80">{skillMsg}</div> : null}
                </div>
              ) : null}

              {post.materials.length > 0 ? (
                <div className="mt-5 grid gap-2 border-t border-dashed border-white/15 pt-4">
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
