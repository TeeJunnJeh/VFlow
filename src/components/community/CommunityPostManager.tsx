import React from 'react';
import { ArrowLeft, Bookmark, Eye, Heart, Library, Loader2, MessageCircle, Pencil, Play, Search, Trash2 } from 'lucide-react';
import type { CommunityPost, CommunityPostType } from '../../services/community';

type ManagerFilter = 'all' | CommunityPostType;

interface CommunityPostManagerProps {
  posts: CommunityPost[];
  isLoading: boolean;
  filter: ManagerFilter;
  query: string;
  onBack: () => void;
  onFilterChange: (filter: ManagerFilter) => void;
  onQueryChange: (query: string) => void;
  onEdit: (post: CommunityPost) => void;
  onDelete: (post: CommunityPost) => void;
}

const FILTERS: ManagerFilter[] = ['all', 'material_share', 'experience'];

export const CommunityPostManager = ({
  posts, isLoading, filter, query, onBack, onFilterChange, onQueryChange, onEdit, onDelete,
}: CommunityPostManagerProps) => {
  const label = (value: ManagerFilter) => value === 'all' ? '全部' : value === 'material_share' ? '素材分享' : '创作经验';
  const visiblePosts = posts.filter((post) => {
    if (filter !== 'all' && post.post_type !== filter) return false;
    const keyword = query.trim().toLowerCase();
    return !keyword || `${post.title} ${post.body}`.toLowerCase().includes(keyword);
  });

  return (
    <div className="w-full">
      <button type="button" onClick={onBack} className="community-manager-ghost-btn mb-6 inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-white/10">
        <ArrowLeft className="h-4 w-4" /> 返回社区
      </button>
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h1 className="community-manager-title text-2xl font-black text-zinc-900 dark:text-zinc-100">笔记管理</h1>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索已发布的笔记" className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none focus:border-orange-400 dark:border-white/10 dark:bg-black/30 dark:text-zinc-100" />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          {FILTERS.map((value) => {
            const count = value === 'all' ? posts.length : posts.filter((post) => post.post_type === value).length;
            return (
              <button key={value} type="button" onClick={() => onFilterChange(value)} className={`community-manager-filter rounded-full px-5 py-2.5 text-sm font-bold transition ${filter === value ? 'community-manager-filter-active bg-zinc-200 text-zinc-950 dark:bg-white/15 dark:text-white' : 'community-manager-filter-inactive bg-transparent text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5'}`}>
                {label(value)} {count}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center gap-2 text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" />加载中...</div>
        ) : visiblePosts.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-sm font-bold text-zinc-400 dark:border-white/10">暂无笔记</div>
        ) : (
          <div className="space-y-4">
            {visiblePosts.map((post) => (
              <article key={post.id} className="flex gap-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900/70">
                <div className="relative h-36 w-28 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                  {post.cover_url ? <img src={post.cover_url} alt={post.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Library className="h-7 w-7 text-zinc-300" /></div>}
                  {post.media.some((media) => media.kind === 'video') ? (
                    <span className="pointer-events-none absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-black/55 text-white shadow-md">
                      <Play className="ml-0.5 h-4 w-4 fill-current" />
                    </span>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="community-manager-post-title truncate text-lg font-black text-zinc-900 dark:text-zinc-100">{post.title || '无标题'}</h2>
                      <p className="mt-2 text-sm text-zinc-500">{post.edited_at ? `编辑于 ${post.edited_at}` : `发布于 ${post.created_at}`}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => onEdit(post)} className="community-manager-edit-btn inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 hover:border-orange-300 hover:text-orange-600 dark:border-white/10 dark:text-zinc-300"><Pencil className="h-3.5 w-3.5" />编辑</button>
                      <button type="button" onClick={() => onDelete(post)} className="community-manager-delete-btn inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-500 hover:bg-red-50 dark:border-red-400/20 dark:text-red-300"><Trash2 className="h-3.5 w-3.5" />删除</button>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-6 text-sm font-medium text-zinc-500">
                    <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" />{post.view_count || 0}</span>
                    <span className="inline-flex items-center gap-1.5"><Heart className="h-4 w-4" />{post.like_count}</span>
                    <span className="inline-flex items-center gap-1.5"><Bookmark className="h-4 w-4" />{post.favorite_count}</span>
                    <span className="inline-flex items-center gap-1.5"><MessageCircle className="h-4 w-4" />{post.comment_count}</span>
                    <span className="inline-flex items-center gap-1.5"><Library className="h-4 w-4" />{post.materials.length}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
