import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { authApi, type InviterPreview } from '../../services/auth';
import { useLanguage } from '../../context/LanguageContext';

interface InviteCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  entryLabel?: string;
  hint?: React.ReactNode;
}

export const InviteCodeField: React.FC<InviteCodeFieldProps> = ({ value, onChange, disabled, entryLabel, hint }) => {
  const { t } = useLanguage();
  // Auto-expand if an initial value is already present (captured from URL ?invite_code=).
  const [expanded, setExpanded] = useState(() => Boolean(value));
  const [checking, setChecking] = useState(false);
  const [valid, setValid] = useState<null | boolean>(null);
  const [inviter, setInviter] = useState<InviterPreview | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const code = value.trim();
    if (!code) {
      setChecking(false);
      setValid(null);
      setInviter(null);
      return;
    }
    setChecking(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await authApi.validateInviteCode(code);
        setValid(res.valid);
        setInviter(res.inviter || null);
      } catch {
        setValid(false);
        setInviter(null);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value]);

  if (!expanded) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={disabled}
          className="text-xs text-zinc-400 hover:text-violet-300 transition font-bold flex items-center gap-1 disabled:opacity-40"
        >
          <ChevronRight size={12} />
          {entryLabel || t.invite_code_field_entry}
        </button>
        <span className="text-[11px] text-zinc-500">
          {t.invite_code_field_bonus_hint}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded(false)}
        disabled={disabled}
        className="text-xs text-zinc-400 hover:text-violet-300 transition font-bold flex items-center gap-1 disabled:opacity-40"
      >
        <ChevronDown size={12} />
        {t.invite_code_field_label}
      </button>
      <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder={t.invite_apply_invite_code_placeholder}
          disabled={disabled}
          maxLength={16}
          className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none tracking-widest"
        />
      </div>
      {hint && (
        <div className="text-[11px] text-zinc-500 px-1 leading-relaxed">{hint}</div>
      )}
      {value.trim().length > 0 && (
        <div className="text-[11px] font-semibold px-1">
          {checking && <span className="text-zinc-400">{t.invite_code_checking}</span>}
          {!checking && valid === true && (
            <span className="text-emerald-400">
              {t.invite_code_valid_hint.replace('{name}', inviter?.nickname || inviter?.invite_code || '')}
            </span>
          )}
          {!checking && valid === false && (
            <span className="text-amber-400">{t.invite_code_invalid_hint}</span>
          )}
        </div>
      )}
    </div>
  );
};
