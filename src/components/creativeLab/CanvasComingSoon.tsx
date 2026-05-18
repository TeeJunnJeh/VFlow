import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * 无限画布功能临时下线占位页。
 * 创意实验室「无限画布」入口暂不开放真实画布（CanvasEditor），仅显示测试中提示。
 */
export const CanvasComingSoon: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="flex-1 h-full min-h-0 flex items-center justify-center">
      <div className="text-zinc-400 text-sm font-medium">
        {(t as any).wb_canvas_coming_soon || '无限画布功能测试中，待开放'}
      </div>
    </div>
  );
};
