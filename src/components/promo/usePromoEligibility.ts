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

const sessionNavigatedKey = (campaignId: string, userId: string | number) =>
  `promo_session_navigated_${campaignId}_${userId}`;

interface UsePromoEligibilityResult {
  campaign: PromoCampaign | null;
  loading: boolean;
  /** banner 是否应该显示（活动活跃 + 用户没买完限购） */
  canShow: boolean;
  /** 弹窗是否应该弹（叠加 24 小时去抖 + 本会话点过立即抢购则不再弹） */
  shouldShowModal: (userId: string | number) => boolean;
  /** 用户点 X 关闭后调用：写时间戳，触发 24 小时去抖 */
  markDismissed: (userId: string | number) => void;
  /** 用户点立即抢购跳到计费页时调用：写本会话标记，整个 session 内不再弹 */
  markPurchaseNavigated: (userId: string | number) => void;
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

  const isPurchaseNavigatedInSession = useCallback(
    (userId: string | number) => {
      if (typeof window === 'undefined') return false;
      try {
        return window.sessionStorage.getItem(sessionNavigatedKey(campaignId, userId)) === '1';
      } catch {
        return false;
      }
    },
    [campaignId],
  );

  const markPurchaseNavigated = useCallback(
    (userId: string | number) => {
      if (typeof window === 'undefined') return;
      try {
        window.sessionStorage.setItem(sessionNavigatedKey(campaignId, userId), '1');
      } catch {
        // sessionStorage 不可用（隐私模式）；什么都不做
      }
    },
    [campaignId],
  );

  // banner 是否应该显示：
  // - 可购买（`canPurchase=true`）→ 显示正常版（用户没买过 + 全局未售罄 + 活跃）
  // - 全局售罄（`isSoldOut=true`）→ 仍显示，banner 内部渲染为灰版"已售罄"
  // - 用户已购买（`canPurchase=false && isSoldOut=false`）→ 不再显示
  const canShow = !!campaign && (campaign.canPurchase || campaign.isSoldOut);

  const shouldShowModal = useCallback(
    (userId: string | number) => {
      if (!campaign || !campaign.canPurchase) return false;
      if (PROMO_DEBUG_ALWAYS_SHOW) return true;
      // 本会话内已通过弹窗"立即抢购"跳过计费 → 整个 session 内不再弹
      if (isPurchaseNavigatedInSession(userId)) return false;
      return !isDismissedRecently(userId);
    },
    [campaign, isDismissedRecently, isPurchaseNavigatedInSession],
  );

  return { campaign, loading, canShow, shouldShowModal, markDismissed, markPurchaseNavigated, refresh };
}
