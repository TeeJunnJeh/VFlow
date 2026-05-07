// 限时活动横幅（通用组件）：
// - 整张横幅图就是个大按钮
// - 点击 onClick → 调用方决定打开弹窗 or 直接抢购
// - 任意活动复用
import React from 'react';
import type { PromoCampaign } from '../../services/promoApi';

interface PromoBannerProps {
  campaign: PromoCampaign;
  onClick: () => void;
  className?: string;
}

export const PromoBanner: React.FC<PromoBannerProps> = ({ campaign, onClick, className = '' }) => {
  if (!campaign.bannerImage) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!campaign.canPurchase}
      className={`group block w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition hover:border-orange-400/40 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      aria-label={campaign.name}
    >
      <img
        src={campaign.bannerImage}
        alt={campaign.name}
        className="block w-full object-cover transition group-hover:scale-[1.01]"
        draggable={false}
      />
    </button>
  );
};
