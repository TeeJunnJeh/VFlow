import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Gift } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { authApi, type InviteSummary } from '../../services/auth';
import { useLanguage } from '../../context/LanguageContext';

interface InviteRewardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDismissPermanent?: () => void;
}

const buildShareLink = (code: string): string => {
  if (typeof window === 'undefined') return code;
  try {
    const url = new URL(window.location.origin);
    url.searchParams.set('invite_code', code);
    return url.toString();
  } catch {
    return `${window.location.origin}/?invite_code=${encodeURIComponent(code)}`;
  }
};

export const InviteRewardDialog: React.FC<InviteRewardDialogProps> = ({ isOpen, onClose, onDismissPermanent }) => {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<InviteSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDismissConfirmOpen, setIsDismissConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    setLoading(true);
    setError('');
    setCopiedCode(false);
    setCopiedLink(false);
    setIsDismissConfirmOpen(false);
    authApi
      .getInviteSummary()
      .then((data) => {
        if (!mounted) return;
        setSummary(data);
      })
      .catch((err: any) => {
        if (!mounted) return;
        setError(err?.message || 'Failed to load invite summary');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  const shareLink = useMemo(() => (summary ? buildShareLink(summary.invite_code) : ''), [summary]);

  const copy = async (value: string, target: 'code' | 'link') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(textarea);
    }
    if (target === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    }
  };

  const amount = summary?.reward_per_invite ?? 500;
  const cap = summary?.cap ?? 10;
  const invited = summary?.invited_count ?? 0;
  const earned = summary?.total_reward_earned ?? 0;
  const isCapped = summary?.is_capped === true;

  const title = isCapped
    ? t.invite_reward_capped_title
    : t.invite_reward_title.replace('{amount}', String(amount));

  const handleDismissConfirm = () => {
    setIsDismissConfirmOpen(false);
    if (onDismissPermanent) onDismissPermanent();
    onClose();
  };

  return (
    <>
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={
        isCapped
          ? t.invite_reward_capped_desc.replace('{earned}', String(earned))
          : t.invite_reward_subtitle
              .replace('{amount}', String(amount))
              .replace('{cap}', String(cap))
      }
      overlayClassName="z-[130]"
      footer={
        <>
          {onDismissPermanent && (
            <button
              type="button"
              onClick={() => setIsDismissConfirmOpen(true)}
              className="mr-auto text-xs text-zinc-500 hover:text-zinc-300 border-b border-dashed border-zinc-600 hover:border-zinc-400 pb-0.5 transition"
            >
              {t.invite_reward_dismiss}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-violet-500/80 hover:bg-violet-500 text-white text-xs font-bold transition"
          >
            {t.invite_reward_close}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="py-8 text-center text-xs text-zinc-400">...</div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-red-400">{error}</div>
      ) : summary ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/25 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-violet-200" />
            </div>
            <div className="text-xs text-zinc-200 leading-relaxed">
              {t.invite_reward_progress
                .replace('{invited}', String(invited))
                .replace('{cap}', String(cap))
                .replace('{earned}', String(earned))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              {t.invite_reward_code_label}
            </div>
            <div className="flex items-stretch rounded-lg border border-white/10 bg-zinc-950 overflow-hidden">
              <div className="flex-1 px-3 py-2.5 text-sm font-mono tracking-widest text-white truncate">
                {summary.invite_code}
              </div>
              <button
                type="button"
                onClick={() => copy(summary.invite_code, 'code')}
                className="px-3 border-l border-white/10 text-xs font-bold text-violet-200 hover:bg-violet-500/15 transition flex items-center gap-1.5"
              >
                {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                {copiedCode ? t.invite_reward_copied : t.invite_reward_copy}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              {t.invite_reward_link_label}
            </div>
            <div className="flex items-stretch rounded-lg border border-white/10 bg-zinc-950 overflow-hidden">
              <div className="flex-1 px-3 py-2.5 text-xs text-zinc-300 truncate">{shareLink}</div>
              <button
                type="button"
                onClick={() => copy(shareLink, 'link')}
                className="px-3 border-l border-white/10 text-xs font-bold text-violet-200 hover:bg-violet-500/15 transition flex items-center gap-1.5"
              >
                {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                {copiedLink ? t.invite_reward_copied : t.invite_reward_copy}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppDialog>

    <AppDialog
      isOpen={isDismissConfirmOpen}
      onClose={() => setIsDismissConfirmOpen(false)}
      title={t.invite_reward_dismiss_title}
      overlayClassName="z-[140]"
      widthClassName="max-w-sm"
      footer={
        <>
          <button
            type="button"
            onClick={() => setIsDismissConfirmOpen(false)}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition"
          >
            {t.invite_reward_dismiss_cancel}
          </button>
          <button
            type="button"
            onClick={handleDismissConfirm}
            className="px-4 py-2 rounded-lg bg-violet-500/80 hover:bg-violet-500 text-white text-xs font-bold transition"
          >
            {t.invite_reward_dismiss_confirm}
          </button>
        </>
      }
    >
      <div className="text-sm text-zinc-300 leading-relaxed">
        {t.invite_reward_dismiss_desc}
      </div>
    </AppDialog>
    </>
  );
};
