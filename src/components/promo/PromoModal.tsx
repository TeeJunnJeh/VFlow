// 限时活动弹窗（通用组件）：
// - 不复用 AppDialog 的白底标题栏，避免和图片本身的设计风格冲突
// - 只忠实渲染整张活动图（图本身就含「立即抢购」按钮）
// - 整张图任意位置可点 → 触发 onPurchase
// - 右上角自己画一个 X 关闭
// - 点遮罩空白处也关闭（标准 modal 体验）
// - Esc 也关
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { PromoCampaign } from '../../services/promoApi';

interface PromoModalProps {
  isOpen: boolean;
  campaign: PromoCampaign;
  onClose: () => void;
  onPurchase: () => void;
}

export const PromoModal: React.FC<PromoModalProps> = ({ isOpen, campaign, onClose, onPurchase }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (!campaign.modalImage) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
      role="dialog"
      aria-label={campaign.name}
    >
      <div
        className="relative max-h-[calc(100vh-3rem)] max-w-[min(75vw,420px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={campaign.modalImage}
          alt={campaign.name}
          onClick={() => {
            if (campaign.canPurchase) onPurchase();
          }}
          draggable={false}
          // 不加 rounded / shadow / bg —— 保留透明 PNG 的不规则裁切，
          // 否则 shadow 会基于图片矩形外框投阴影，看起来像一圈黑边。
          className={`block max-h-[calc(100vh-3rem)] w-auto max-w-full select-none ${
            campaign.canPurchase ? 'cursor-pointer' : 'cursor-default'
          }`}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-lg transition hover:bg-black hover:scale-105"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
