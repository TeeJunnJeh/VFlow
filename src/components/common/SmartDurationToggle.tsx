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
      className={`smart-duration-toggle relative h-5 w-9 shrink-0 rounded-full border transition-colors ${checked ? 'is-checked' : ''} disabled:opacity-50`}
    >
      <span className={`smart-duration-toggle__thumb absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  </div>
);
