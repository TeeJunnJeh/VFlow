/**
 * Shared "Use as input" toggle pill — used in TextNode + ImageNode headers.
 * Drives `data.useAsInput` semantics that downstream `collectUpstreamInputs`
 * reads when walking incoming-edge paths.
 */
import React from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';

interface InputToggleProps {
  active: boolean;
  onChange: (next: boolean) => void;
}

export const InputToggle: React.FC<InputToggleProps> = ({ active, onChange }) => {
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const label = tt.canvas_use_as_input || 'Input';
  const hint = tt.canvas_use_as_input_hint
    || 'Flow this node into downstream prompts. Walks edges; Image terminates the path.';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!active);
      }}
      title={hint}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-colors ${
        active
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
          : 'bg-zinc-800 text-zinc-500 border-white/10 hover:text-zinc-300 hover:border-white/25'
      }`}
    >
      <ArrowDownToLine className="w-3 h-3" />
      {label}
    </button>
  );
};
