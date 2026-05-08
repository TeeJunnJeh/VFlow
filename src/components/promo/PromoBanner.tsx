// 限时活动横幅（通用组件）：
// - 整张横幅图就是个大按钮
// - 点击 onClick → 调用方决定打开弹窗 or 直接抢购
// - 售罄时灰版 + "已售罄"覆盖 + 禁用点击
// - 任意活动复用
import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { PromoCampaign } from '../../services/promoApi';

interface PromoBannerProps {
  campaign: PromoCampaign;
  onClick: () => void;
  className?: string;
}

export const PromoBanner: React.FC<PromoBannerProps> = ({ campaign, onClick, className = '' }) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  if (!campaign.bannerImage) return null;
  const soldOut = campaign.isSoldOut;
  const disabled = !campaign.canPurchase;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative block w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition hover:border-orange-400/40 hover:shadow-lg disabled:cursor-not-allowed ${
        disabled ? 'opacity-90' : ''
      } ${className}`}
      aria-label={campaign.name}
    >
      <img
        src={campaign.bannerImage}
        alt={campaign.name}
        draggable={false}
        className={`block w-full object-cover transition group-hover:scale-[1.01] ${
          soldOut ? 'opacity-50 grayscale' : ''
        }`}
      />
      {soldOut && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="rounded-xl border border-white/30 bg-black/70 px-6 py-2 text-lg font-black tracking-wide text-white shadow-2xl">
            {isZh ? '已售罄' : 'Sold Out'}
          </span>
        </div>
      )}
    </button>
  );
};
