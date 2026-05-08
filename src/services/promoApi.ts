// src/services/promoApi.ts
//
// 限时活动包客户端：
// - listActive(): 当前用户能看见的所有活跃活动（按时间窗过滤）
// - getEligibility(id): 单个活动的资格信息（含 purchased_count / can_purchase）
//
// 活动 ID 当前在前端硬编码（如 'promo_39_9_598v'），后端在 billing/promo_campaigns.py
// 中央配置；以后加新活动只要后端改配置 + 前端在合适位置调 hook 即可。

import { apiRequest } from './apiClient';

const API_BASE_URL = '/api/billing';

export interface PromoCampaign {
  id: string;
  name: string;
  /** 元，字符串形式（避免浮点）。前端用 parseFloat 即可 */
  amountYuan: string;
  bonusCredits: number;
  activeFrom: string | null;
  activeTo: string | null;
  isActive: boolean;
  modalImage: string;
  bannerImage: string;
  ctaTextZh: string;
  ctaTextEn: string;
  purchaseLimitPerUser: number;
  purchasedCount: number;
  /** 全局售卖上限；null = 不限 */
  totalLimit: number | null;
  /** 全局已售出（仅算 PAID） */
  soldCount: number;
  /** 剩余库存；null = 不限 */
  remaining: number | null;
  /** 是否已售罄 */
  isSoldOut: boolean;
  canPurchase: boolean;
}

interface RawPromoCampaign {
  id?: unknown;
  name?: unknown;
  amount_yuan?: unknown;
  bonus_credits?: unknown;
  active_from?: unknown;
  active_to?: unknown;
  is_active?: unknown;
  modal_image?: unknown;
  banner_image?: unknown;
  cta_text_zh?: unknown;
  cta_text_en?: unknown;
  purchase_limit_per_user?: unknown;
  purchased_count?: unknown;
  total_limit?: unknown;
  sold_count?: unknown;
  remaining?: unknown;
  is_sold_out?: unknown;
  can_purchase?: unknown;
}

function normalize(raw: RawPromoCampaign): PromoCampaign {
  const totalLimit = raw.total_limit == null ? null : Number(raw.total_limit);
  const remaining = raw.remaining == null ? null : Number(raw.remaining);
  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    amountYuan: String(raw.amount_yuan || '0'),
    bonusCredits: Number(raw.bonus_credits || 0),
    activeFrom: raw.active_from ? String(raw.active_from) : null,
    activeTo: raw.active_to ? String(raw.active_to) : null,
    isActive: Boolean(raw.is_active),
    modalImage: String(raw.modal_image || ''),
    bannerImage: String(raw.banner_image || ''),
    ctaTextZh: String(raw.cta_text_zh || '立即抢购'),
    ctaTextEn: String(raw.cta_text_en || 'Grab Now'),
    purchaseLimitPerUser: Number(raw.purchase_limit_per_user || 1),
    purchasedCount: Number(raw.purchased_count || 0),
    totalLimit: Number.isFinite(totalLimit) ? (totalLimit as number) : null,
    soldCount: Number(raw.sold_count || 0),
    remaining: Number.isFinite(remaining) ? (remaining as number) : null,
    isSoldOut: Boolean(raw.is_sold_out),
    canPurchase: Boolean(raw.can_purchase),
  };
}

export const promoApi = {
  /** 当前活跃的所有活动（已按时间窗过滤）。 */
  listActive: async (): Promise<PromoCampaign[]> => {
    const json = await apiRequest<{ data?: { items?: RawPromoCampaign[] } }>(
      `${API_BASE_URL}/promos/active/`,
      { fallbackMessage: 'Failed to load active promos' },
    );
    const items = json?.data?.items;
    if (!Array.isArray(items)) return [];
    return items.map(normalize).filter((it) => it.id);
  },

  /** 单个活动对当前用户的资格（活动不存在 → 抛错）。 */
  getEligibility: async (campaignId: string): Promise<PromoCampaign> => {
    const json = await apiRequest<{ data?: RawPromoCampaign }>(
      `${API_BASE_URL}/promos/${encodeURIComponent(campaignId)}/eligibility/`,
      { fallbackMessage: 'Failed to load promo eligibility' },
    );
    return normalize(json?.data || {});
  },
};
