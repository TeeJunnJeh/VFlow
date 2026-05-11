/**
 * Cost preview badge shown beside Generate buttons.
 *
 * Renders nothing when:
 *   - Pricing not yet loaded
 *   - Backend has no rate for this model (mismatched alias)
 * Renders "按量付费" for Seedance (usage-based billing).
 * Renders `-X.Y V点` otherwise.
 *
 * Color matches the workbench cost-tip orange/amber so users have one mental
 * model for "how much will this cost".
 */
import React from 'react';
import { useLanguage } from '../../../../../context/LanguageContext';
import { useCanvasPricing, computeCanvasCostLabel, type CostLabelInput } from '../../usePricing';

interface CostBadgeProps extends CostLabelInput {
  className?: string;
}

export const CostBadge: React.FC<CostBadgeProps> = ({ className = '', ...input }) => {
  const pricing = useCanvasPricing();
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;

  if (!pricing.loaded) return null;

  const { label, usageBased } = computeCanvasCostLabel(
    input,
    pricing,
    { vPoints: tt.v_points, usageBased: tt.wb_usage_based_billing || '按量付费' },
  );

  if (!label) return null;

  return (
    <span
      className={`text-[10px] font-semibold whitespace-nowrap ${
        usageBased ? 'text-amber-300/90' : 'text-orange-300/90'
      } ${className}`}
    >
      {label}
    </span>
  );
};
