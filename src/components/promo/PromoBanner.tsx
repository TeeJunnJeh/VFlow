// 限时活动横幅（通用组件）：
// - 整张横幅图就是个大按钮
// - 点击 onClick → 调用方决定打开弹窗 or 直接抢购
// - 售罄时灰版 + "已售罄"覆盖 + 禁用点击
// - 暗夜模式自动用 banner_dark.png（同目录 + _dark 后缀），白天模式用原图
// - 任意活动复用
import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { PromoCampaign } from '../../services/promoApi';

interface PromoBannerProps {
  campaign: PromoCampaign;
  onClick: () => void;
  className?: string;
}

// 监听 <html> class 变化，识别白天 / 暗夜模式（与 WorkbenchView 同一套机制）
const useIsLightTheme = (): boolean => {
  const [isLight, setIsLight] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('theme-light');
  });
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const sync = () => setIsLight(root.classList.contains('theme-light'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isLight;
};

// 把 ".../banner.png" 替换成 ".../banner_dark.png"。仅替换最后一段文件名，避免误伤路径。
const toDarkBannerUrl = (url: string): string =>
  url.replace(/banner\.(png|jpg|jpeg|webp)(\?.*)?$/i, 'banner_dark.$1$2');

export const PromoBanner: React.FC<PromoBannerProps> = ({ campaign, onClick, className = '' }) => {
  const { language } = useLanguage();
  const isLight = useIsLightTheme();
  const isZh = language === 'zh';
  if (!campaign.bannerImage) return null;
  const bannerSrc = isLight ? campaign.bannerImage : toDarkBannerUrl(campaign.bannerImage);
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
        src={bannerSrc}
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
