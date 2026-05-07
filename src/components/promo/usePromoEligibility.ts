// 限时活动资格 hook：
// - 加载当前用户对某活动的资格（是否买过、是否还在活跃期）
// - 提供"近 24 小时内是否被 X 关闭过"的去抖判断 + 标记
//
// 用 localStorage（而不是 sessionStorage）持久化关闭时间戳：
// 用户关掉浏览器再打开仍走同一个 24h 窗，更符合用户感受。
import { useCallback, useEffect, useState } from 'react';
import { promoApi, type PromoCampaign } from '../../services/promoApi';

/**
 * 调试开关：true = 弹窗常显示（忽略 24 小时去抖、忽略 sidebar 触发条件），方便联调；
 *           买过的用户依然不会弹（canPurchase=false 永远生效）。
 * 上线前改回 false。
 */
export const PROMO_DEBUG_ALWAYS_SHOW = false;

const DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000;

const dismissKey = (campaignId: string, userId: string | number) =>
  `promo_dismissed_${campaignId}_${userId}`;

interface UsePromoEligibilityResult {
  campaign: PromoCampaign | null;
  loading: boolean;
  /** banner 是否应该显示（活动活跃 + 用户没买完限购） */
  canShow: boolean;
  /** 弹窗是否应该弹（叠加 24 小时去抖） */
  shouldShowModal: (userId: string | number) => boolean;
  /** 用户点 X 关闭后调用：写时间戳 */
  markDismissed: (userId: string | number) => void;
  /** 强制刷新（购买成功后调用，让 banner / 弹窗状态及时更新） */
  refresh: () => Promise<void>;
}

export function usePromoEligibility(campaignId: string): UsePromoEligibilityResult {
  const [campaign, setCampaign] = useState<PromoCampaign | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    if (!campaignId) {
      setCampaign(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const c = await promoApi.getEligibility(campaignId);
      setCampaign(c);
    } catch {
      // 静默失败：未登录 / 网络错误时按"无活动"处理，不打扰用户
      setCampaign(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isDismissedRecently = useCallback(
    (userId: string | number) => {
      if (typeof window === 'undefined') return false;
      try {
        const ts = Number(window.localStorage.getItem(dismissKey(campaignId, userId)) || '0');
        return Date.now() - ts < DISMISS_WINDOW_MS;
      } catch {
        return false;
      }
    },
    [campaignId],
  );

  const markDismissed = useCallback(
    (userId: string | number) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(dismissKey(campaignId, userId), String(Date.now()));
      } catch {
        // localStorage 不可用（隐私模式）；什么都不做
      }
    },
    [campaignId],
  );

  // banner / 弹窗的"是否能展示"统一靠 campaign.canPurchase（后端给的）：
  // 用户买过 → can_purchase=false → 弹窗 + banner 永久消失。
  // 这条逻辑在调试模式下也保留——只是去掉 24h 去抖。
  const canShow = !!campaign && campaign.canPurchase;

  const shouldShowModal = useCallback(
    (userId: string | number) => {
      if (!campaign || !campaign.canPurchase) return false;
      if (PROMO_DEBUG_ALWAYS_SHOW) return true;
      return !isDismissedRecently(userId);
    },
    [campaign, isDismissedRecently],
  );

  return { campaign, loading, canShow, shouldShowModal, markDismissed, refresh };
}
