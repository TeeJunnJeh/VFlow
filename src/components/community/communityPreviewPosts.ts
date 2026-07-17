import type { CommunityListParams, CommunityListResponse, CommunityPost } from '../../services/community';

const previewPosts: CommunityPost[] = [
  {
    id: 'preview-morning-glass',
    is_placeholder: true,
    title: '窗边的第一帧',
    body: '把杯壁上的高光留到最后。\n光线从左侧进来，像一封没有拆开的信；商品不必急着说服谁，只要安静地站在清晨里。',
    post_type: 'experience',
    author: { id: 'preview-a', name: 'Kiki' },
    cover_url: '/product-gallery-examples/1/result_1.jpeg',
    media: [{ id: 'preview-morning-glass-media', kind: 'image', url: '/product-gallery-examples/1/result_1.jpeg' }],
    materials: [{ id: 'preview-morning-glass-material', name: '清晨玻璃高光参考', type: 'scene', preview_url: '/product-gallery-examples/1/result_1.jpeg', can_collect: true }],
    like_count: 128,
    favorite_count: 36,
    collect_count: 18,
    comment_count: 12,
    is_liked: false,
    is_favorited: true,
    is_collected: false,
    created_at: '2026-07-02 09:12:00',
  },
  {
    id: 'preview-soft-chair',
    is_placeholder: true,
    title: '把产品放进一段午后',
    body: '白底图只是开始。\n真正可被记住的是阴影、织物、空气的密度，以及用户在画面外刚刚坐下的感觉。',
    post_type: 'material_share',
    author: { id: 'preview-b', name: 'Moss Studio' },
    cover_url: '/product-gallery-examples/2/result_2.jpeg',
    media: [{ id: 'preview-soft-chair-media', kind: 'image', url: '/product-gallery-examples/2/result_2.jpeg' }],
    materials: [
      { id: 'preview-soft-chair-scene', name: '午后室内场景', type: 'scene', preview_url: '/product-gallery-examples/2/result_2.jpeg', can_collect: true },
      { id: 'preview-soft-chair-script', name: '柔光陈列提示词', type: 'script', can_collect: true },
    ],
    like_count: 94,
    favorite_count: 22,
    collect_count: 31,
    comment_count: 8,
    is_liked: true,
    is_favorited: false,
    is_collected: false,
    created_at: '2026-07-01 17:45:00',
  },
  {
    id: 'preview-orange-night',
    is_placeholder: true,
    title: '夜色里的一盏橙灯',
    body: '我把背景压暗了一点，让橙色像从产品内部亮起来。\n这类图适合讲安全感，不适合讲参数。',
    post_type: 'experience',
    author: { id: 'preview-c', name: 'Yuan' },
    cover_url: '/product-gallery-examples/3/result_3.jpeg',
    media: [{ id: 'preview-orange-night-media', kind: 'image', url: '/product-gallery-examples/3/result_3.jpeg' }],
    materials: [{ id: 'preview-orange-night-material', name: '橙色夜景光影', type: 'scene', preview_url: '/product-gallery-examples/3/result_3.jpeg', can_collect: true }],
    like_count: 203,
    favorite_count: 57,
    collect_count: 44,
    comment_count: 19,
    is_liked: false,
    is_favorited: false,
    is_collected: true,
    created_at: '2026-06-30 22:08:00',
  },
  {
    id: 'preview-model-wind',
    is_placeholder: true,
    title: '让模特停在风经过的地方',
    body: '动作不需要很大。\n发梢、衣角、视线偏离镜头的一瞬间，足够让一张商业图有了呼吸。',
    post_type: 'material_share',
    author: { id: 'preview-d', name: 'Lin' },
    cover_url: '/cs-guide/model_male_1.jpg',
    media: [{ id: 'preview-model-wind-media', kind: 'image', url: '/cs-guide/model_male_1.jpg' }],
    materials: [{ id: 'preview-model-wind-material', name: '自然站姿模特参考', type: 'model', preview_url: '/cs-guide/model_male_1.jpg', can_collect: true }],
    like_count: 76,
    favorite_count: 19,
    collect_count: 15,
    comment_count: 6,
    is_liked: false,
    is_favorited: true,
    is_collected: false,
    created_at: '2026-06-29 15:20:00',
  },
  {
    id: 'preview-clean-repair',
    is_placeholder: true,
    title: '修掉瑕疵，别修掉生活感',
    body: '清理画面的时候，我会留下一点真实的纹理。\n太完美的图像像塑料，轻微的使用痕迹反而让产品可信。',
    post_type: 'experience',
    author: { id: 'preview-e', name: 'Chen' },
    cover_url: '/smart-repair-examples/product_defect_fix_after.jpg',
    media: [{ id: 'preview-clean-repair-media', kind: 'image', url: '/smart-repair-examples/product_defect_fix_after.jpg' }],
    materials: [{ id: 'preview-clean-repair-material', name: '瑕疵修复参数记录', type: 'script', preview_url: '/smart-repair-examples/product_defect_fix_after.jpg', can_collect: true }],
    like_count: 141,
    favorite_count: 41,
    collect_count: 27,
    comment_count: 14,
    is_liked: true,
    is_favorited: true,
    is_collected: true,
    created_at: '2026-06-28 11:34:00',
  },
  {
    id: 'preview-headphones',
    is_placeholder: true,
    title: '听见产品之前，先看见安静',
    body: '耳机图不一定要放音乐符号。\n把手势放慢，把环境收干净，用户会自动把声音补进画面。',
    post_type: 'material_share',
    author: { id: 'preview-f', name: 'Nora' },
    cover_url: '/intro-page-demo/first_frame_demo.png',
    media: [{ id: 'preview-headphones-media', kind: 'image', url: '/intro-page-demo/first_frame_demo.png' }],
    materials: [{ id: 'preview-headphones-material', name: '耳机生活方式首帧', type: 'product', preview_url: '/intro-page-demo/first_frame_demo.png', can_collect: true }],
    like_count: 188,
    favorite_count: 52,
    collect_count: 39,
    comment_count: 17,
    is_liked: false,
    is_favorited: false,
    is_collected: false,
    created_at: '2026-06-27 20:10:00',
  },
];

export const getCommunityPreviewPosts = (params?: CommunityListParams): CommunityListResponse => {
  const keyword = (params?.q || '').trim().toLowerCase();
  const filtered = previewPosts.filter((post) => {
    if (params?.type && params.type !== 'all' && post.post_type !== params.type) return false;
    if (params?.authorId && post.author.id !== params.authorId) return false;
    if (!keyword) return true;
    const haystack = [
      post.title,
      post.body,
      post.author.name,
      ...post.materials.map((item) => item.name),
    ].join(' ').toLowerCase();
    return haystack.includes(keyword);
  });

  const limit = Math.max(1, Number(params?.limit || filtered.length));
  const offset = Math.max(0, Number(params?.cursor || 0));
  const items = filtered.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    items,
    nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
    total: filtered.length,
  };
};
