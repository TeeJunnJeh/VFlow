import React from 'react';

interface SmartDurationToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const SmartDurationToggle: React.FC<SmartDurationToggleProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
}) => (
  <div className={`inline-flex items-center gap-2 text-[11px] font-medium ${disabled ? 'text-zinc-600' : 'text-zinc-400'}`}>
    <span>{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${checked
        ? 'border-orange-500 bg-orange-500'
        : 'border-white/15 bg-zinc-700'
      } disabled:opacity-50`}
    >
      <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[17px]' : 'translate-x-0.5'}`} />
    </button>
  </div>
);
