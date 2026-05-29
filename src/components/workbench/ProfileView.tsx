import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Edit3, User as UserIcon, Settings2, LogOut, Flame, Gem, Zap, KeyRound, Gift, Copy, Check, FileText } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { authApi, type InviteSummary } from '../../services/auth';
import { billingApi } from '../../services/billing';
import { videoApi } from '../../services/video';
import { tiktokApi } from '../../services/tiktok';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { DropdownSelect } from '../common/DropdownSelect';
import { AppDialog } from '../common/AppDialog';
import { getWorkbenchPreferences, setWorkbenchPreferences, type WorkbenchPreferences } from '../../utils/preferences';
import { isStrongPassword } from '../../utils/passwordRules';
import { normalizeThemeMode, type ThemeMode } from '../../utils/theme';
import { formatCreditAmount, formatSignedCreditAmount, roundCreditTenths } from '../../utils/credits';
import {
  TIKTOK_AUTH_COMPLETE_EVENT,
  closeTikTokAuthPopup,
  navigateTikTokAuthPopup,
  openTikTokAuthPopup,
  type TikTokAuthResult,
} from '../../utils/tiktokAuthPopup';

interface ProfileViewProps {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  isDebugModeEnabled: boolean;
}

type OpenClawKeyState = {
  phone: string | null;
  enabled: boolean;
  hasKey: boolean;
  maskedKey: string;
  updatedAt: string | null;
};

type TikTokStatusData = {
  authorized?: boolean;
  tiktok_unavailable?: boolean;
  message?: string;
  scope?: string | null;
  tiktok_user?: {
    display_name?: string | null;
    avatar_url?: string | null;
    open_id?: string | null;
  } | null;
};

export const ProfileView: React.FC<ProfileViewProps> = ({ theme, setTheme, isDebugModeEnabled }) => {
  const { t } = useLanguage();
  const { user, updateUser, logout } = useAuth();
  const isLightTheme = theme === 'light';
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [newNickname, setNewNickname] = useState(user?.name || '');
  const [showBilling, setShowBilling] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isResettingVideoEstimate, setIsResettingVideoEstimate] = useState(false);
  const [isBindingTikTok, setIsBindingTikTok] = useState(false);
  const [isLoadingTikTokStatus, setIsLoadingTikTokStatus] = useState(false);
  const [isRevokingTikTok, setIsRevokingTikTok] = useState(false);
  const [tiktokStatus, setTikTokStatus] = useState<TikTokStatusData | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmNextPassword, setConfirmNextPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isOpenClawDialogOpen, setIsOpenClawDialogOpen] = useState(false);
  const [isOpenClawLoading, setIsOpenClawLoading] = useState(false);
  const [openClawKey, setOpenClawKey] = useState('');
  const [openClawStatus, setOpenClawStatus] = useState<OpenClawKeyState>({
    phone: null,
    enabled: false,
    hasKey: false,
    maskedKey: '',
    updatedAt: null,
  });
  const requiresCurrentPassword = user?.hasPassword === true;
  const { isInfoOpen, setIsInfoOpen, infoTitle, infoMessage, openInfo } = useProfileInfo();

  const loadTikTokStatus = React.useCallback(async () => {
    if (!user?.id) {
      setTikTokStatus(null);
      return null;
    }
    setIsLoadingTikTokStatus(true);
    try {
      const result = await tiktokApi.getStatus();
      const data = (result?.data || null) as TikTokStatusData | null;
      setTikTokStatus(data);
      return data;
    } catch {
      return null;
    } finally {
      setIsLoadingTikTokStatus(false);
    }
  }, [user?.id]);

  const showTikTokBindingSummary = async () => {
    const result = await tiktokApi.getStatus();
    const data = (result?.data || {}) as TikTokStatusData;
    setTikTokStatus(data);
    const userInfo = data?.tiktok_user || {};
    const message = [
      `${t.profile_tiktok_bound || 'TikTok account is already bound'}: ${userInfo.display_name || '-'}`,
      `${t.profile_tiktok_scope_label || 'Scopes'}: ${data?.scope || '-'}`,
    ].filter(Boolean).join('\n');
    openInfo(t.profile_success || 'Success', message);
  };

  useEffect(() => {
    void loadTikTokStatus();
  }, [loadTikTokStatus]);

  useEffect(() => {
    const onTikTokAuthComplete = (event: Event) => {
      const detail = (event as CustomEvent<TikTokAuthResult>).detail;
      if (detail?.status !== 'success') return;
      void showTikTokBindingSummary().catch(() => {
        openInfo(t.profile_success || 'Success', t.profile_tiktok_auth_complete || 'TikTok authorization completed.');
      });
    };

    window.addEventListener(TIKTOK_AUTH_COMPLETE_EVENT, onTikTokAuthComplete);
    return () => window.removeEventListener(TIKTOK_AUTH_COMPLETE_EVENT, onTikTokAuthComplete);
  }, [t]);

  const freezeRemainingLabel = (() => {
    const total = Math.max(0, Number(user?.frozenRemainingSeconds || 0));
    if (!total) return '0 分钟';
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.max(1, Math.ceil((total % 3600) / 60));
    if (days > 0) return `${days}天 ${hours}小时`;
    if (hours > 0) return `${hours}小时 ${minutes}分钟`;
    return `${minutes}分钟`;
  })();

  const localizedFreezeRemainingLabel = (() => {
    const total = Math.max(0, Number(user?.frozenRemainingSeconds || 0));
    if (!total) return (t.profile_freeze_remaining_minutes || '{minutes} min').replace('{minutes}', '0');
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.max(1, Math.ceil((total % 3600) / 60));
    if (days > 0) return (t.profile_freeze_remaining_days || '{days}d {hours}h').replace('{days}', String(days)).replace('{hours}', String(hours));
    if (hours > 0) return (t.profile_freeze_remaining_hours || '{hours}h {minutes}m').replace('{hours}', String(hours)).replace('{minutes}', String(minutes));
    return (t.profile_freeze_remaining_minutes || '{minutes} min').replace('{minutes}', String(minutes));
  })();

  const buildPrefsDraft = (): WorkbenchPreferences => {
    const stored = getWorkbenchPreferences(user?.id ?? null);
    const creationMode = stored.creationMode === 'replay' ? 'replay' : 'fast';
    const selectedModelId =
      creationMode === 'replay'
        ? 'seedance2.0'
        : stored.selectedModelId === 'sora2' || stored.selectedModelId === 'sora2pro' || stored.selectedModelId === 'kling'
          ? stored.selectedModelId
          : 'kling';

    const rawDuration = typeof stored.genDuration === 'number' ? stored.genDuration : 10;
    const duration = rawDuration === 5 || rawDuration === 10 || rawDuration === 15 ? rawDuration : 10;

    return {
      deliveryRegion: stored.deliveryRegion || '中国',
      targetLanguage: stored.targetLanguage || 'en',
      videoType: stored.videoType || 'UGC种草',
      aspectRatio: stored.aspectRatio === '16:9' ? '16:9' : '9:16',
      genDuration: duration,
      soundSetting: stored.soundSetting === 'off' ? 'off' : 'on',
      creationMode,
      selectedModelId,
      scriptVariantCount:
        typeof stored.scriptVariantCount === 'number' && stored.scriptVariantCount > 0 ? stored.scriptVariantCount : 1,
      theme: normalizeThemeMode(stored.theme, theme),
    };
  };

  const [isPreferencesExpanded, setIsPreferencesExpanded] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState<WorkbenchPreferences>(() => buildPrefsDraft());

  // Invite code is loaded lazily when the invite dialog opens.
  const [inviteSummary, setInviteSummary] = useState<InviteSummary | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [isGiftRedeemDialogOpen, setIsGiftRedeemDialogOpen] = useState(false);
  const [giftRedeemCode, setGiftRedeemCode] = useState('');
  const [isGiftRedeeming, setIsGiftRedeeming] = useState(false);

  useEffect(() => {
    if (!isInviteDialogOpen) return;
    let mounted = true;
    setInviteLoading(true);
    setInviteError('');
    setInviteCodeCopied(false);
    setInviteLinkCopied(false);
    authApi
      .getInviteSummary()
      .then((data) => { if (mounted) setInviteSummary(data); })
      .catch((err: any) => { if (mounted) setInviteError(err?.message || t.profile_invite_load_failed || 'Failed to load invite summary'); })
      .finally(() => { if (mounted) setInviteLoading(false); });
    return () => { mounted = false; };
  }, [isInviteDialogOpen, t.profile_invite_load_failed]);

  const inviteShareLink = useMemo(() => {
    if (!inviteSummary) return '';
    if (typeof window === 'undefined') return inviteSummary.invite_code;
    try {
      const url = new URL(window.location.origin);
      url.searchParams.set('invite_code', inviteSummary.invite_code);
      return url.toString();
    } catch {
      return `${window.location.origin}/?invite_code=${encodeURIComponent(inviteSummary.invite_code)}`;
    }
  }, [inviteSummary]);

  const copyInvite = async (value: string, target: 'code' | 'link') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
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
      setInviteCodeCopied(true);
      setTimeout(() => setInviteCodeCopied(false), 1800);
    } else {
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 1800);
    }
  };

  const handleOpenGiftRedeem = () => {
    if (!user?.id) {
      openInfo(t.profile_notice || 'Notice', t.profile_gift_redeem_login_required || '请先登录后使用礼包兑换码');
      return;
    }
    setGiftRedeemCode('');
    setIsGiftRedeemDialogOpen(true);
  };

  const handleGiftRedeem = async () => {
    if (isGiftRedeeming) return;
    if (!user?.id) {
      openInfo(t.profile_notice || 'Notice', t.profile_gift_redeem_login_required || '请先登录后使用礼包兑换码');
      return;
    }
    const code = giftRedeemCode.trim();
    if (!code) {
      openInfo(t.profile_notice || 'Notice', t.profile_gift_redeem_empty || '请输入兑换码');
      return;
    }

    setIsGiftRedeeming(true);
    try {
      const res: any = await billingApi.redeemCode(code);
      const data = res?.data || {};
      const nextBalance = Number(data.balance ?? user.credits ?? 0);
      const nextTenths = Number(data.balance_credit_tenths ?? Math.round(nextBalance * 10));
      updateUser({
        credits: roundCreditTenths(nextBalance),
        creditTenths: nextTenths,
      });
      setIsGiftRedeemDialogOpen(false);
      setGiftRedeemCode('');
      const amountLabel = formatCreditAmount(data.credits ?? 0);
      openInfo(
        t.profile_success || 'Success',
        (t.profile_gift_redeem_success || '兑换成功，已到账 {amount} V 点').replace('{amount}', amountLabel),
      );
    } catch (err: any) {
      openInfo(t.profile_error || 'Error', err?.message || t.profile_gift_redeem_failed || '兑换失败');
    } finally {
      setIsGiftRedeeming(false);
    }
  };

  const togglePreferences = () => {
    if (!isPreferencesExpanded) {
      setPrefsDraft(buildPrefsDraft());
    }
    setIsPreferencesExpanded(!isPreferencesExpanded);
  };

  const handleResetVideoEstimate = async () => {
    if (isResettingVideoEstimate) return;

    const confirmText = t.profile_reset_video_estimate_confirm || '确认要重置视频生成时间预估吗？这会清空你历史的平均耗时统计。';
    if (!window.confirm(confirmText)) return;

    setIsResettingVideoEstimate(true);
    try {
      const resp: any = await videoApi.resetVideoTimeEstimates();
      const deleted = Number(resp?.data?.deleted_count) || 0;
      openInfo(t.profile_success || 'Success', (t.profile_reset_video_estimate_success || '已重置视频生成时间预估').replace('{n}', String(deleted)));
    } catch (err: any) {
      openInfo(t.profile_error || 'Error', err?.message || (t.profile_reset_video_estimate_failed || '重置失败'));
    } finally {
      setIsResettingVideoEstimate(false);
    }
  };

  const handleSavePreferences = async () => {
    const next: WorkbenchPreferences = {
      ...prefsDraft,
      creationMode: prefsDraft.creationMode === 'replay' ? 'replay' : 'fast',
      selectedModelId: prefsDraft.creationMode === 'replay' ? 'seedance2.0' : prefsDraft.selectedModelId,
      genDuration: (() => {
        const raw = Number(prefsDraft.genDuration) || 10;
        const rounded = Math.round(raw);
        return rounded === 5 || rounded === 10 || rounded === 15 ? rounded : 10;
      })(),
      scriptVariantCount: Math.max(1, Math.round(Number(prefsDraft.scriptVariantCount) || 1)),
      videoType: (prefsDraft.videoType || '').trim() ? prefsDraft.videoType : 'UGC种草',
      aspectRatio: prefsDraft.aspectRatio === '16:9' ? '16:9' : '9:16',
      deliveryRegion: (prefsDraft.deliveryRegion || '').trim() ? prefsDraft.deliveryRegion : '中国',
      targetLanguage: (prefsDraft.targetLanguage || '').trim() ? prefsDraft.targetLanguage : 'en',
    };

    setWorkbenchPreferences(next, user?.id ?? null);
    setIsPreferencesExpanded(false);
  };

  const loadOpenClawStatus = async () => {
    try {
      const resp = await authApi.getOpenClawKeyStatus();
      setOpenClawStatus({
        phone: resp.data?.phone || null,
        enabled: resp.data?.enabled === true,
        hasKey: resp.data?.has_key === true,
        maskedKey: resp.data?.masked_key || '',
        updatedAt: resp.data?.updated_at || null,
      });
    } catch (err: any) {
      openInfo(t.profile_error || 'Error', err?.message || t.profile_openclaw_load_failed || 'Failed to load OpenClaw key status');
    }
  };

  useEffect(() => {
    if (!isDebugModeEnabled) return;
    loadOpenClawStatus();
  }, [isDebugModeEnabled]);

  useEffect(() => {
    if (!showBilling) return;

    let cancelled = false;
    const loadBilling = async () => {
      setBillingLoading(true);
      setBillingError(null);
      try {
        const res = await billingApi.listTransactions(20, 0);
        if (cancelled) return;
        const items = res?.data?.items;
        setBillingItems(Array.isArray(items) ? items : []);
      } catch (err: any) {
        if (cancelled) return;
        setBillingItems([]);
        setBillingError(err?.message || t.profile_billing_load_failed || 'Failed to load billing');
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    };

    loadBilling();
    return () => {
      cancelled = true;
    };
  }, [showBilling, t.profile_billing_load_failed]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const res = await authApi.updateProfile({ avatar: file });
        if (res.data?.avatar) updateUser({ avatar: res.data.avatar });
      } catch (err) { openInfo(t.profile_error || 'Error', t.profile_avatar_upload_failed || 'Failed to upload'); }
    }
  };

  const handleUpdateName = async () => {
     setIsEditingNickname(false);
     if (newNickname.trim() && newNickname.trim() !== user?.name) {
          try {
            const res = await authApi.updateProfile({ name: newNickname.trim() });
            updateUser({ name: res.data.name });
          } catch (e) { openInfo(t.profile_error || 'Error', t.profile_name_update_failed || 'Error updating name'); }
     }
  };

  const handleUseDefaultAvatar = async () => {
    try {
      await authApi.updateProfile({ avatarClear: true });
      updateUser({ avatar: '' });
    } catch (err) {
      openInfo(t.profile_error || 'Error', t.profile_avatar_reset_failed || 'Failed to reset avatar');
    }
  };

  const handleBindTikTok = async () => {
    let authPopup: Window | null = null;
    setIsBindingTikTok(true);
    try {
      const status = await tiktokApi.getStatus();
      if (status?.data?.tiktok_unavailable) {
        openInfo(
          t.profile_notice || 'Notice',
          status?.data?.message || t.profile_tiktok_unavailable || 'TikTok publishing is not available for this account yet.',
        );
        return;
      }

      if (status?.data?.authorized) {
        await showTikTokBindingSummary();
        return;
      }

      authPopup = openTikTokAuthPopup({
        loadingTitle: t.app_tiktok_popup_loading_title,
        loadingDescription: t.app_tiktok_popup_loading_desc,
      });
      const auth = await tiktokApi.getAuthUrl();
      if (auth.unavailable || !auth.authUrl) {
        closeTikTokAuthPopup(authPopup);
        openInfo(
          t.profile_notice || 'Notice',
          auth.message || t.profile_tiktok_unavailable || 'TikTok publishing is not available for this account yet.',
        );
        return;
      }

      const popupWindow = navigateTikTokAuthPopup(authPopup, auth.authUrl);
      if (!popupWindow) {
        openInfo(t.profile_notice || 'Notice', t.app_tiktok_popup_blocked);
        return;
      }
      openInfo(t.profile_notice || 'Notice', t.profile_tiktok_auth_opened || 'TikTok authorization opened. Return to VFlow after authorization.');
    } catch (err: any) {
      closeTikTokAuthPopup(authPopup);
      openInfo(t.profile_error || 'Error', err?.message || t.profile_tiktok_bind_failed || 'Failed to open TikTok authorization');
    } finally {
      setIsBindingTikTok(false);
    }
  };

  const handleRevokeTikTok = async () => {
    const confirmed = window.confirm(t.profile_tiktok_unbind_confirm || 'Disconnect the currently bound TikTok account?');
    if (!confirmed) return;

    setIsRevokingTikTok(true);
    try {
      const result = await tiktokApi.revokeAuth();
      setTikTokStatus({ authorized: false });
      openInfo(t.profile_success || 'Success', result?.message || t.profile_tiktok_unbind_success || 'TikTok account disconnected.');
    } catch (err: any) {
      openInfo(t.profile_error || 'Error', err?.message || t.profile_tiktok_unbind_failed || 'Failed to disconnect TikTok account');
    } finally {
      setIsRevokingTikTok(false);
    }
  };

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNextPassword('');
    setConfirmNextPassword('');
  };

  const handleChangePassword = async () => {
    if (requiresCurrentPassword && !currentPassword) {
      openInfo('Error', t.profile_err_fill_current_password || '请填写当前密码');
      return;
    }
    if (!nextPassword) {
      openInfo('Error', t.profile_err_fill_new_password || '请输入新密码');
      return;
    }
    if (nextPassword !== confirmNextPassword) {
      openInfo('Error', t.profile_err_password_mismatch || '两次输入的新密码不一致');
      return;
    }
    if (!isStrongPassword(nextPassword)) {
      openInfo('Error', t.password_rule_hint);
      return;
    }

    setIsChangingPassword(true);
    try {
      await authApi.changePassword({
        currentPassword,
        newPassword: nextPassword,
        confirmPassword: confirmNextPassword,
      });
      updateUser({ hasPassword: true });
      setIsPasswordDialogOpen(false);
      resetPasswordForm();
      openInfo('Success', t.profile_password_change_success || '密码修改成功');
    } catch (err: any) {
      openInfo('Error', err?.message || t.profile_password_change_failed || '修改密码失败');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleRegenerateOpenClawKey = async () => {
    setIsOpenClawLoading(true);
    try {
      const resp = await authApi.regenerateOpenClawKey();
      const fullKey = resp.data?.key || '';
      setOpenClawKey(fullKey);
      await loadOpenClawStatus();
      if (fullKey) {
        await navigator.clipboard.writeText(fullKey);
        openInfo(t.profile_success || 'Success', t.profile_openclaw_regenerate_success || '密钥已更新并复制到剪贴板');
      }
    } catch (err: any) {
      openInfo(t.profile_error || 'Error', err?.message || t.profile_openclaw_regenerate_failed || 'Failed to regenerate key');
    } finally {
      setIsOpenClawLoading(false);
    }
  };

  const handleToggleOpenClaw = async () => {
    setIsOpenClawLoading(true);
    try {
      await authApi.toggleOpenClawKey(!openClawStatus.enabled);
      await loadOpenClawStatus();
    } catch (err: any) {
      openInfo(t.profile_error || 'Error', err?.message || t.profile_openclaw_toggle_failed || 'Failed to toggle key status');
    } finally {
      setIsOpenClawLoading(false);
    }
  };

  const handleCopyOpenClawKey = async () => {
    setIsOpenClawLoading(true);
    try {
      const resp = await authApi.revealOpenClawKey();
      const fullKey = resp.data?.key || '';
      if (!fullKey) {
        openInfo(t.profile_notice || 'Notice', t.profile_openclaw_not_generated || '尚未生成密钥');
        return;
      }
      setOpenClawKey(fullKey);
      await navigator.clipboard.writeText(fullKey);
      openInfo(t.profile_success || 'Success', t.profile_openclaw_copy_success || '密钥已复制');
    } catch (err: any) {
      openInfo(t.profile_error || 'Error', err?.message || t.profile_openclaw_copy_failed || 'Failed to copy key');
    } finally {
      setIsOpenClawLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.profile_title}</h1>
          <p className="text-zinc-500 text-xs mt-1">{t.profile_subtitle}</p>
        </div>
        
        <div className="flex items-center gap-6">
          {isDebugModeEnabled && (
            <div className="flex items-center gap-2 bg-zinc-900/80 border border-white/5 p-1 rounded-xl">
              <div className="text-[10px] font-bold text-zinc-600 px-2 uppercase tracking-widest">{t.profile_debug || 'Debug'}</div>
              <div className="flex gap-1">
                {['free', 'plus', 'pro'].map((p) => (
                  <button 
                    key={p} 
                    onClick={async (e) => { 
                      e.stopPropagation(); 
                      const newPlan = p as any; 
                      let newCredits = user?.credits; 
                      if (newPlan === 'free') newCredits = 50; 
                      else if (newPlan === 'plus') newCredits = 200; 
                      else if (newPlan === 'pro') newCredits = 9999; 
                      
                      try { 
                        const res = await authApi.updateProfile({ tier: newPlan, credits: newCredits }); 
                        let resolvedPlan: any = 'free'; 
                        if (res.data.tier === 'PRO') resolvedPlan = 'plus'; 
                        else if (res.data.tier === 'ENTERPRISE') resolvedPlan = 'pro'; 
                        updateUser({ plan: resolvedPlan, credits: res.data.balance }); 
                      } catch (err) { 
                        openInfo(t.profile_error || 'Error', t.profile_debug_update_plan_failed || 'Failed to update plan via debug'); 
                      } 
                    }} 
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition ${user?.plan === p ? 'bg-orange-500/20 border-orange-500/50 text-orange-500' : 'bg-transparent border-white/5 text-zinc-500 hover:text-white'}`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="w-px h-3 bg-white/5 mx-1" />
              <div className="flex items-center gap-1 pr-1">
                <input 
                  type="number" 
                  className="w-12 bg-zinc-800 text-[10px] px-1 py-0.5 rounded text-white border border-white/10 outline-none focus:border-orange-500" 
                  defaultValue={100} 
                      onKeyDown={async (e) => { 
                    if (e.key === 'Enter') { 
                      const val = Number((e.currentTarget as HTMLInputElement).value); 
                      try { 
                        const res = await authApi.updateProfile({ credits: val }); 
                        updateUser({ credits: res.data.balance }); 
                      } catch (err) { 
                        openInfo(t.profile_error || 'Error', t.profile_debug_update_credits_failed || 'Failed to update credits via debug'); 
                      } 
                    } 
                  }} 
                />
                <span className="text-[8px] text-zinc-600">V</span>
              </div>
            </div>
          )}

          <LanguageSwitcher />
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-10 custom-scroll">
         <div className="max-w-4xl mx-auto">
            <div className="glass-panel p-12 rounded-[40px] border border-white/5 relative overflow-hidden group">
               {/* Background Glow Effect */}
               <div className={`absolute top-0 right-0 w-[400px] h-[400px] blur-[120px] rounded-full transition-all duration-1000 ${user?.plan === 'pro' ? 'bg-orange-500/10' : user?.plan === 'plus' ? 'bg-indigo-500/10' : 'bg-zinc-500/5'}`} />
               
               <div className="relative z-10 w-full" style={{ perspective: 1400 }}>
                 <div
                   className="relative w-full transition-transform duration-700"
                   style={{ transformStyle: 'preserve-3d', transform: showBilling ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                 >
                   {/* FRONT: Profile */}
                   <div className="flex flex-col md:flex-row items-center md:items-start gap-12 w-full" style={{ backfaceVisibility: 'hidden' }}>
                  
                  {/* LEFT COLUMN: Avatar & Name */}
                  <div className="flex flex-col items-center gap-6 w-48 shrink-0">
                     <div className="relative group/avatar">
                        <input type="file" ref={avatarInputRef} className="hidden" onChange={handleAvatarUpload} accept="image/*" />
                        <div onClick={() => avatarInputRef.current?.click()} className={`w-32 h-32 rounded-[32px] bg-zinc-900 border flex items-center justify-center overflow-hidden transition-all duration-700 cursor-pointer ${user?.plan === 'pro' ? 'border-orange-500/40 shadow-[0_0_30px_rgba(249,115,22,0.1)]' : user?.plan === 'plus' ? 'border-indigo-500/40 shadow-[0_0_30px_rgba(99,102,241,0.1)]' : 'border-white/10 shadow-none'}`}>
                            {user?.avatar ? (<img src={user.avatar} className="w-full h-full object-cover" />) : (<UserIcon className="w-12 h-12 text-zinc-700" />)}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]"><Edit3 className="w-8 h-8 text-white" /></div>
                        </div>
                     </div>
                     <div className="text-center group/name relative w-full">
                        {isEditingNickname ? (
                            <input type="text" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} onBlur={handleUpdateName} onKeyDown={(e) => { if(e.key === 'Enter') handleUpdateName(); if(e.key === 'Escape') setIsEditingNickname(false); }} autoFocus className="text-xl font-bold text-white bg-white/5 border border-orange-500/50 rounded-lg px-2 py-1 outline-none text-center w-full" />
                        ) : (
                            <div className="flex items-center justify-center gap-2 group cursor-pointer" onClick={() => setIsEditingNickname(true)}>
                                <h2 className="text-2xl font-bold text-white tracking-tight break-words max-w-full">{user?.name || t.profile_guest_name || 'User'}</h2>
                                <Edit3 className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </div>
                        )}
                        <div className="mt-2 text-center">
                            <button onClick={handleUseDefaultAvatar} className="text-[10px] font-bold text-zinc-500 hover:text-orange-500 transition-colors uppercase tracking-widest py-1 border-b border-white/5">{t.profile_use_default_avatar}</button>
                        </div>
                        {tiktokStatus?.authorized ? (
                          <div className="mt-4 w-full rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-3 text-left">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-black/30 overflow-hidden flex items-center justify-center border border-white/10 shrink-0">
                                {tiktokStatus.tiktok_user?.avatar_url ? (
                                  <img src={tiktokStatus.tiktok_user.avatar_url} className="h-full w-full object-cover" />
                                ) : (
                                  <Check className="h-4 w-4 text-emerald-300" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                                  {t.profile_tiktok_connected || 'Connected TikTok'}
                                </div>
                                <div className="truncate text-xs font-bold text-zinc-100">
                                  {tiktokStatus.tiktok_user?.display_name || t.profile_tiktok_unknown_account || 'TikTok account'}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 truncate text-[10px] text-zinc-500">
                              {(t.profile_tiktok_scope_label || 'Scopes')}: {tiktokStatus.scope || 'user.info.basic,video.upload'}
                            </div>
                            <button
                              type="button"
                              onClick={handleRevokeTikTok}
                              disabled={isRevokingTikTok || isBindingTikTok}
                              className="mt-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-bold text-zinc-200 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {isRevokingTikTok ? (t.profile_tiktok_unbinding || 'Disconnecting...') : (t.profile_tiktok_unbind_action || 'Disconnect')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={handleBindTikTok}
                            disabled={isBindingTikTok || isLoadingTikTokStatus || Boolean(tiktokStatus?.tiktok_unavailable)}
                            className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-orange-500/40 hover:bg-orange-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <div className="flex items-center gap-2">
                              {isBindingTikTok || isLoadingTikTokStatus ? (
                                <span className="h-4 w-4 rounded-full border-2 border-orange-300/40 border-t-orange-300 animate-spin shrink-0" />
                              ) : (
                                <KeyRound className="h-4 w-4 text-orange-300 shrink-0" />
                              )}
                              <span className="min-w-0">
                                <span className="block text-[11px] font-black uppercase tracking-wider text-zinc-200">
                                  {isBindingTikTok ? (t.profile_tiktok_binding || 'Opening...') : (t.profile_tiktok_bind_action || 'Bind TikTok')}
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-4 text-zinc-500">
                                  {tiktokStatus?.tiktok_unavailable
                                    ? (tiktokStatus.message || t.profile_tiktok_unavailable || 'TikTok publishing is not available for this account yet.')
                                    : (t.profile_tiktok_bind_desc || 'Authorize TikTok draft publishing.')}
                                </span>
                              </span>
                            </div>
                          </button>
                        )}
                     </div>
                  </div>
                  
                  {/* RIGHT COLUMN: Plan Details & Balance (RESTORED SECTION) */}
                  <div className="flex-1 w-full space-y-10 py-2">
                     <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-black tracking-[0.15em] border transition-all duration-700 ${user?.plan === 'pro' ? 'bg-orange-500/20 text-orange-500 border-orange-500/20' : user?.plan === 'plus' ? 'bg-indigo-500/20 text-indigo-500 border-indigo-500/20' : 'bg-zinc-800 text-zinc-400 border-white/5'}`}>
                                {user?.plan === 'pro' ? <Flame className="w-3.5 h-3.5" /> : user?.plan === 'plus' ? <Gem className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                                {(user?.plan === 'pro' ? (t.profile_plan_pro_name || 'pro user') : user?.plan === 'plus' ? (t.profile_plan_plus_name || 'plus user') : (t.profile_plan_free_name || 'free user')).toUpperCase()}
                            </div>
                        </div>
                        <p className="text-sm text-zinc-500 leading-relaxed max-w-xl">
                            {user?.plan === 'pro' ? (t.plan_desc_pro || t.profile_plan_pro || 'You are enjoying full PRO features, including ultra-long video generation and unlimited tasks.') : user?.plan === 'plus' ? (t.plan_desc_plus || t.profile_plan_plus || 'You are on the PLUS plan with extended generation limits.') : (t.plan_desc_free || t.profile_plan_free || 'You are on the Free plan. Upgrade to unlock more features.')}
                        </p>
                     </div>

                     {/* Balance Section */}
                     <div className={`space-y-4 rounded-2xl p-6 border shadow-inner ${user?.isFrozen ? 'bg-zinc-800/70 border-zinc-600/40' : 'bg-white/2 border-white/5'}`}>
                        <div className="flex items-end justify-between px-1">
                            <div className="space-y-1">
                                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t.profile_balance || 'Balance'}</div>
                                <div className={`text-4xl font-black italic tracking-tighter ${user?.isFrozen ? 'text-zinc-300' : 'text-white'}`}>
                                    {user?.plan === 'pro' ? '∞' : formatCreditAmount(user?.credits || 0)} <span className="text-[10px] not-italic text-zinc-500 font-bold uppercase ml-1">{t.v_points || 'V-Points'}</span>
                                </div>
                            </div>
                                {user?.isFrozen ? (
                                  <div className="inline-flex items-center gap-2 rounded-full border border-zinc-500/40 bg-zinc-700/70 px-3 py-1 text-[11px] font-semibold text-zinc-200">
                                    <span>{t.profile_frozen_badge || 'Frozen'}</span>
                                    <span className="text-zinc-400">{(t.profile_frozen_remaining || 'Remaining {time}').replace('{time}', localizedFreezeRemainingLabel)}</span>
                                  </div>
                                ) : null}
                            <div className="flex items-center gap-3">
                              <div className="text-xs font-bold text-zinc-600 mb-1">{(t.profile_credit_limit || 'Limit: {limit} V').replace('{limit}', String(user?.plan === 'pro' ? '∞' : user?.plan === 'plus' ? 500 : 100))}</div>
                              <button
                                onClick={() => setShowBilling(true)}
                                className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border transition ${
                                  user?.isFrozen
                                    ? 'border-zinc-500/40 text-zinc-200 bg-zinc-700/60 hover:bg-zinc-700/80 shadow-none'
                                    : isLightTheme
                                      ? 'border-amber-400/60 text-amber-900 bg-amber-100/85 hover:bg-amber-200/85 shadow-[0_0_20px_rgba(245,158,11,0.14)] hover:shadow-[0_0_24px_rgba(245,158,11,0.22)]'
                                      : 'border-yellow-400/40 text-yellow-100 bg-yellow-500/20 hover:bg-yellow-500/30 shadow-[0_0_20px_rgba(250,204,21,0.20)] hover:shadow-[0_0_24px_rgba(250,204,21,0.30)]'
                                }`}
                              >
                                {t.profile_billing_title || '账单明细'}
                              </button>
                            </div>
                        </div>
                        <div className={`h-4 w-full rounded-full border p-1 overflow-hidden ${user?.isFrozen ? 'bg-zinc-900 border-zinc-700/70' : 'bg-zinc-900 border-white/5'}`}>
                            <div className={`h-full rounded-full transition-all duration-1000 ease-out relative ${user?.isFrozen ? 'bg-gradient-to-r from-zinc-600 via-zinc-500 to-zinc-400' : user?.plan === 'pro' ? 'bg-gradient-to-r from-purple-600 via-orange-500 to-yellow-400' : user?.plan === 'plus' ? 'bg-gradient-to-r from-blue-700 via-indigo-500 to-yellow-400' : 'bg-gradient-to-r from-zinc-700 via-zinc-500 to-yellow-500/70'}`} style={{ width: `${user?.plan === 'pro' ? 100 : Math.min(((user?.credits || 0) / (user?.plan === 'plus' ? 500 : 100)) * 100, 100)}%` }}>
                                <div className="absolute inset-0 bg-white/10 animate-pulse" />
                            </div>
                        </div>
                        {user?.isFrozen ? (
                          <div className="text-xs text-zinc-400 leading-relaxed">
                            {(t.profile_frozen_desc || 'During account freeze, V-points cannot be used for generation or collection. Remaining freeze time: {time}.').replace('{time}', localizedFreezeRemainingLabel)}
                          </div>
                        ) : null}
                     </div>
                  </div>
               </div>

                   {/* BACK: Billing */}
                   <div
                     className="absolute inset-0 w-full h-full"
                     style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                   >
                     <div className="flex flex-col h-full">
                       <div className="flex items-center justify-between mb-6">
                         <div>
                           <h3 className="text-2xl font-bold tracking-tight text-white">
                             {t.profile_billing_title || '账单明细'}
                           </h3>
                           <p className="text-xs text-zinc-500">{t.profile_billing_recent || 'recent'}</p>
                         </div>
                         <button
                           onClick={() => setShowBilling(false)}
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border transition ${
                            isLightTheme
                              ? 'border-amber-400/60 text-amber-900 bg-amber-100/80 hover:bg-amber-200/80'
                              : 'border-yellow-400/30 text-yellow-100/90 bg-yellow-500/10 hover:bg-yellow-500/20'
                          }`}
                         >
                           {t.profile_back || '返回'}
                         </button>
                       </div>

                       <div className="flex-1 bg-white/2 rounded-2xl p-6 border border-white/5 shadow-inner overflow-y-auto">
                         {billingLoading && (
                           <div className="text-xs text-zinc-500">{t.profile_loading || 'Loading...'}</div>
                         )}
                         {!billingLoading && billingError && (
                           <div className="text-xs text-red-400">{billingError}</div>
                         )}
                        {!billingLoading && !billingError && (
                          <div className="space-y-3">
                            {billingItems.length > 0 ? (
                              billingItems.map((tx: any) => (
                                <div key={tx.id} className="flex items-center justify-between text-sm border-b border-white/5 pb-3">
                                  <div className="flex flex-col">
                                    <span className="text-zinc-200 font-semibold">
                                      {tx.description || tx.type_label || tx.type}
                                    </span>
                                    <span className="text-[11px] text-zinc-600">
                                      {tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}
                                    </span>
                                  </div>
                                  <div className={`text-base font-black ${Number(tx.amount || 0) > 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                    {formatSignedCreditAmount(tx.amount)}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div
                                className={`rounded-xl border p-4 flex items-center justify-between ${
                                  isLightTheme
                                    ? 'border-amber-300/80 bg-amber-50/95'
                                    : 'border-yellow-400/30 bg-yellow-500/10'
                                }`}
                              >
                                <div className="flex flex-col">
                                  <span className={`text-sm font-semibold ${isLightTheme ? 'text-amber-900' : 'text-yellow-100'}`}>
                                    {t.profile_billing_empty || '暂无消费记录'}
                                  </span>
                                  <span className={`text-[11px] ${isLightTheme ? 'text-amber-700/80' : 'text-yellow-100/60'}`}>
                                    {t.profile_billing_recent || 'recent'}
                                  </span>
                                </div>
                                <div className={`text-lg font-black ${isLightTheme ? 'text-amber-700' : 'text-yellow-200'}`}>0</div>
                              </div>
                            )}
                          </div>
                        )}
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
               
               <hr className="mt-6 mb-6 border-white/5" />
               
               {/* Footer Buttons */}
               <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={togglePreferences}
                    className={`w-full flex items-center justify-between p-6 rounded-2xl bg-white/5 border transition group/item cursor-pointer shadow-sm hover:shadow-orange-500/5 ${isPreferencesExpanded ? 'border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.1)]' : 'border-white/5 hover:border-white/10'}`}
                  >
                      <div className="flex items-center gap-4 w-full">
                          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover/item:text-orange-500 transition-colors"><Settings2 className="w-6 h-6" /></div>
                          <div className="text-left w-full">
                              <div className="text-base font-bold text-white">{ t.profile_preferences || '项目配置偏好' }</div>
                              <div className="text-xs text-zinc-600 mt-0.5">{ t.profile_preferences_desc || '项目级别的默认配置设置' }</div>
                          </div>
                      </div>
                  </button>

                  <button onClick={() => setIsPasswordDialogOpen(true)} className="w-full flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition group/password shadow-sm hover:shadow-orange-500/5">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover/password:text-orange-500 transition-colors"><KeyRound className="w-6 h-6" /></div>
                          <div className="text-left">
                              <div className="text-base font-bold text-white">{t.profile_change_password_title || '修改密码'}</div>
                              <div className="text-xs text-zinc-600 mt-0.5">{t.profile_change_password_desc || '支持密码登录账号管理'}</div>
                          </div>
                      </div>
                  </button>

                  {isDebugModeEnabled && (
                    <button
                      onClick={() => {
                        setIsOpenClawDialogOpen(true);
                        setOpenClawKey('');
                      }}
                      className="w-full flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition group/key shadow-sm hover:shadow-orange-500/5"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover/key:text-orange-500 transition-colors"><KeyRound className="w-6 h-6" /></div>
                        <div className="text-left">
                          <div className="text-base font-bold text-white">{t.profile_openclaw_title}</div>
                          <div className="text-xs text-zinc-600 mt-0.5">{openClawStatus.enabled ? (t.profile_openclaw_status_enabled || 'Enabled') : (t.profile_openclaw_status_disabled || 'Disabled')} · {openClawStatus.hasKey ? openClawStatus.maskedKey : (t.profile_openclaw_not_generated || 'Not Generated')}</div>
                        </div>
                      </div>
                    </button>
                  )}

                  <a href="/doc" target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition group/docs shadow-sm hover:shadow-orange-500/5">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover/docs:text-orange-500 transition-colors"><FileText className="w-6 h-6" /></div>
                          <div className="text-left">
                              <div className="text-base font-bold text-white">{t.profile_product_docs_title}</div>
                              <div className="text-xs text-zinc-600 mt-0.5">{t.profile_product_docs_desc}</div>
                          </div>
                      </div>
                  </a>

                  <button
                    type="button"
                    onClick={() => setIsInviteDialogOpen(true)}
                    className="w-full flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition group/invite shadow-sm hover:shadow-orange-500/5"
                  >
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover/invite:text-orange-500 transition-colors"><Gift className="w-6 h-6" /></div>
                          <div className="text-left">
                              <div className="text-base font-bold text-white">{t.profile_pref_invite_section_title || '邀请码'}</div>
                              <div className="text-xs text-zinc-600 mt-0.5">{t.profile_invite_card_desc}</div>
                          </div>
                      </div>
                  </button>
               </div>
                  
               <div className="mt-8 space-y-5 pb-12">
                 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleOpenGiftRedeem}
                    className="w-full flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition group/giftRedeem shadow-sm hover:shadow-orange-500/5"
                  >
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover/giftRedeem:text-orange-500 transition-colors"><Gift className="w-6 h-6" /></div>
                          <div className="text-left">
                              <div className="text-base font-bold text-white">{t.profile_gift_redeem_button || '礼包兑换码'}</div>
                              <div className="text-xs text-zinc-600 mt-0.5">{t.profile_gift_redeem_desc || '输入兑换码领取 V 点'}</div>
                          </div>
                      </div>
                  </button>

                  <button onClick={logout} className="w-full flex items-center justify-between p-6 rounded-2xl bg-red-500/5 hover:bg-red-500/10 transition group/logout border border-red-500/10 hover:border-red-500/20">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500"><LogOut className="w-6 h-6" /></div>
                          <div className="text-left">
                              <div className="text-base font-bold text-red-500">{t.sign_out}</div>
                              <div className="text-xs text-red-500/60 mt-0.5">{t.sign_out_subtitle}</div>
                          </div>
                      </div>
                  </button>
                 </div>

                  <div className="flex items-center justify-center gap-2 text-base font-semibold text-zinc-500">
                    <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500 transition-colors">{t.login_agreement_user}</a>
                    <span className="text-zinc-700">{'\u00b7'}</span>
                    <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500 transition-colors">{t.login_agreement_privacy}</a>
                  </div>
               </div>

               {isPreferencesExpanded && (
                 <AppDialog
                   isOpen={isPreferencesExpanded}
                   title={t.profile_preferences_title || t.profile_preferences}
                   onClose={() => setIsPreferencesExpanded(false)}
                   widthClassName="max-w-4xl"
                   footer={
                     <>
                       <button
                         className="px-6 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-900 text-sm font-bold shadow-sm hover:bg-zinc-50 hover:border-zinc-300 transition"
                         onClick={() => setIsPreferencesExpanded(false)}
                       >
                         {t.profile_preferences_cancel}
                       </button>
                       <button
                         className="px-8 py-2.5 rounded-xl border border-orange-500 bg-orange-500 text-white text-sm font-bold shadow-sm shadow-orange-500/20 hover:bg-orange-600 hover:border-orange-600 transition"
                         onClick={handleSavePreferences}
                       >
                         {t.profile_preferences_save}
                       </button>
                     </>
                   }
                 >
                   <div className="max-h-[62vh] space-y-10 overflow-y-auto pr-1">


                     {/* 商品图片生成 */}
                     <section className="space-y-4">
                       <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider">
                         <Gem className="w-4 h-4 text-orange-500" /> {t.profile_image_generation_title}
                       </h3>
                       <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
                         <div className="text-xs text-zinc-600 italic">
                          {t.profile_image_generation_desc}
                         </div>
                       </div>
                     </section>

                     {/* 视频生成 */}
                     <section className="space-y-4">
                       <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider">
                         <Zap className="w-4 h-4 text-orange-500" /> {t.profile_video_generation_title}
                       </h3>
                       <div className="bg-white/2 border border-white/5 rounded-2xl p-8">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                           <div className="space-y-2">
                             <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.profile_pref_delivery_region}</div>
                             <DropdownSelect
                               value={prefsDraft.deliveryRegion}
                               options={[
                                 { value: '中国', label: t.wb_region_cn },
                                 { value: '美国', label: t.wb_region_us },
                                 { value: '东南亚', label: t.wb_region_sea },
                                 { value: '欧洲', label: t.wb_region_eu },
                                 { value: '法国', label: t.wb_region_fr },
                                 { value: '日本', label: t.wb_region_jp },
                                 { value: '韩国', label: t.wb_region_kr },
                                 { value: '墨西哥', label: t.wb_region_mx },
                               ]}
                               onChange={(v) => setPrefsDraft((prev) => ({ ...prev, deliveryRegion: v }))}
                               buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 hover:bg-white/5"
                               iconClassName="w-4 h-4 text-zinc-500"
                               optionClassName="text-xs"
                             />
                           </div>

                           <div className="space-y-2">
                             <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.profile_pref_video_language}</div>
                             <DropdownSelect
                               value={prefsDraft.targetLanguage}
                               options={[
                                 { value: 'en', label: t.lang_en },
                                 { value: 'zh', label: t.lang_zh },
                                 { value: 'es', label: t.lang_es },
                                 { value: 'fr', label: t.lang_fr },
                                 { value: 'ja', label: t.lang_ja },
                                 { value: 'ko', label: t.lang_ko },
                                 { value: 'ms', label: t.lang_ms },
                                 { value: 'vi', label: t.lang_vi },
                                 { value: 'id', label: t.lang_id },
                               ]}
                               onChange={(v) => setPrefsDraft((prev) => ({ ...prev, targetLanguage: v }))}
                               buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 hover:bg-white/5"
                               iconClassName="w-4 h-4 text-zinc-500"
                               optionClassName="text-xs"
                             />
                           </div>

                           <div className="space-y-2">
                             <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.profile_pref_video_type}</div>
                             <DropdownSelect
                               value={prefsDraft.videoType}
                               options={[
                                 { value: 'UGC种草', label: t.wb_video_type_ugc },
                                 { value: '产品口播', label: t.wb_video_type_talking },
                                 { value: '产品演示', label: t.wb_video_type_demo },
                                 { value: '痛点-解决', label: t.wb_video_type_problem_solution },
                                 { value: '前后对比', label: t.wb_video_type_before_after },
                                 { value: '反应展示', label: t.wb_video_type_reaction },
                                 { value: '故事讲述', label: t.wb_video_type_story },
                               ]}
                               onChange={(v) => setPrefsDraft((prev) => ({ ...prev, videoType: v }))}
                               buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 hover:bg-white/5"
                               iconClassName="w-4 h-4 text-zinc-500"
                               optionClassName="text-xs"
                             />
                           </div>

                           <div className="space-y-2">
                             <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.aspect_ratio}</div>
                             <DropdownSelect
                               value={prefsDraft.aspectRatio}
                               options={[
                                 { value: '9:16', label: t.mobile },
                                 { value: '16:9', label: t.landscape },
                               ]}
                               onChange={(v) => setPrefsDraft((prev) => ({ ...prev, aspectRatio: (v === '16:9' ? '16:9' : '9:16') }))}
                               buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 hover:bg-white/5"
                               iconClassName="w-4 h-4 text-zinc-500"
                               optionClassName="text-xs"
                             />
                           </div>

                           <div className="space-y-2">
                             <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.profile_pref_duration}</div>
                             <DropdownSelect
                               value={String(prefsDraft.genDuration)}
                               options={[
                                 { value: '5', label: '5s' },
                                 { value: '10', label: '10s' },
                                 { value: '15', label: '15s' },
                               ]}
                               onChange={(v) => {
                                 const next = Number(v);
                                 setPrefsDraft((prev) => ({ ...prev, genDuration: next === 5 || next === 10 || next === 15 ? next : 10 }));
                               }}
                               buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 hover:bg-white/5"
                               iconClassName="w-4 h-4 text-zinc-500"
                               optionClassName="text-xs"
                             />
                           </div>

                           <div className="space-y-2">
                             <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.profile_pref_sound}</div>
                             <DropdownSelect
                               value={prefsDraft.soundSetting}
                               options={[
                                 { value: 'on', label: t.profile_pref_sound_on },
                                 { value: 'off', label: t.profile_pref_sound_off },
                               ]}
                               onChange={(v) => setPrefsDraft((prev) => ({ ...prev, soundSetting: v as any }))}
                               buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 hover:bg-white/5"
                               iconClassName="w-4 h-4 text-zinc-500"
                               optionClassName="text-xs"
                             />
                           </div>

                           <div className="space-y-2">
                             <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.profile_pref_quality}</div>
                             <DropdownSelect
                               value={prefsDraft.creationMode}
                               options={[
                                 { value: 'fast', label: t.profile_pref_quality_fast },
                                 { value: 'replay', label: t.profile_pref_quality_replay },
                               ]}
                               onChange={(v) => {
                                 setPrefsDraft((prev) => ({
                                   ...prev,
                                   creationMode: v as any,
                                   selectedModelId: v === 'replay' ? 'seedance2.0' : prev.selectedModelId,
                                 }));
                               }}
                               buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 hover:bg-white/5"
                               iconClassName="w-4 h-4 text-zinc-500"
                               optionClassName="text-xs"
                             />
                           </div>

                           <div className="space-y-2">
                             <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.profile_pref_model}</div>
                             <DropdownSelect
                               value={prefsDraft.creationMode === 'replay' ? 'seedance2.0' : prefsDraft.selectedModelId}
                               disabled={prefsDraft.creationMode === 'replay'}
                               options={
                                 prefsDraft.creationMode === 'replay'
                                   ? [{ value: 'seedance2.0', label: 'SeeDance 2.0' }]
                                   : [
                                       { value: 'kling', label: 'Kling' },
                                       { value: 'sora2', label: 'Sora 2' },
                                       { value: 'sora2pro', label: 'Sora 2 Pro' },
                                     ]
                               }
                               onChange={(v) => setPrefsDraft((prev) => ({ ...prev, selectedModelId: v as any }))}
                               buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 hover:bg-white/5"
                               iconClassName="w-4 h-4 text-zinc-500"
                               optionClassName="text-xs"
                             />
                           </div>
                         </div>

                        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-end">
                           <button
                             className="bg-red-500/10 text-red-300 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 disabled:opacity-60 transition"
                             onClick={handleResetVideoEstimate}
                             disabled={isResettingVideoEstimate}
                           >
                             {isResettingVideoEstimate ? (t.profile_reset_video_estimate_submitting || '重置中...') : (t.profile_reset_video_estimate_btn || '重置视频耗时预估')}
                           </button>
                         </div>
                       </div>
                     </section>

                  </div>
                 </AppDialog>
               )}
            </div>
         </div>
      </div>

       {isGiftRedeemDialogOpen && (
         <AppDialog
           isOpen={isGiftRedeemDialogOpen}
           title={t.profile_gift_redeem_title || '礼包兑换码'}
           onClose={() => {
             if (isGiftRedeeming) return;
             setIsGiftRedeemDialogOpen(false);
             setGiftRedeemCode('');
           }}
           footer={
             <>
               <button
                 className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 disabled:opacity-60"
                 onClick={() => {
                   setIsGiftRedeemDialogOpen(false);
                   setGiftRedeemCode('');
                 }}
                 disabled={isGiftRedeeming}
               >
                 {t.profile_password_cancel || 'Cancel'}
               </button>
               <button
                 className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600 disabled:opacity-60"
                 onClick={handleGiftRedeem}
                 disabled={isGiftRedeeming}
               >
                 {isGiftRedeeming ? (t.profile_gift_redeem_submitting || '兑换中...') : (t.profile_gift_redeem_submit || '确认兑换')}
               </button>
             </>
           }
         >
           <div className="space-y-3">
             <p className="text-xs text-zinc-500">{t.profile_gift_redeem_desc || '输入兑换码领取 V 点'}</p>
             <input
               value={giftRedeemCode}
               onChange={(e) => setGiftRedeemCode(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') handleGiftRedeem();
               }}
               placeholder={t.profile_gift_redeem_placeholder || '请输入兑换码'}
               disabled={isGiftRedeeming}
               className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-400/60 disabled:opacity-60"
             />
           </div>
         </AppDialog>
       )}

       {isInviteDialogOpen && (
         <AppDialog
           isOpen={isInviteDialogOpen}
          title={t.profile_pref_invite_section_title || '邀请码'}
           onClose={() => setIsInviteDialogOpen(false)}
         >
           <div className="space-y-4">
             {inviteLoading ? (
               <div className="py-4 text-center text-xs text-zinc-500">{t.profile_pref_invite_loading || 'Loading...'}</div>
             ) : inviteError ? (
               <div className="py-4 text-center text-xs text-red-400">{inviteError}</div>
             ) : inviteSummary ? (
               <>
                 <div className="flex items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                   <div className="w-10 h-10 rounded-lg bg-violet-500/25 flex items-center justify-center shrink-0">
                     <Gift className="profile-invite-light-deep-purple w-5 h-5 text-violet-200" />
                   </div>
                   <div className="text-xs text-zinc-200 leading-relaxed space-y-1">
                     <div>
                       {t.invite_reward_progress
                         .replace('{invited}', String(inviteSummary.invited_count ?? 0))
                         .replace('{cap}', String(inviteSummary.cap ?? 10))
                         .replace('{earned}', String(inviteSummary.total_reward_earned ?? 0))}
                     </div>
                     <div className="profile-invite-light-deep-purple text-[11px] text-violet-200/90">
                       {t.invite_reward_invitee_bonus_hint.replace(
                         '{amount}',
                         String(inviteSummary.invitee_reward ?? inviteSummary.reward_per_invite ?? 0),
                       )}
                     </div>
                   </div>
                 </div>

                 <div className="space-y-1.5">
                   <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                     {t.invite_reward_code_label}
                   </div>
                   <div className="flex items-stretch rounded-lg border border-white/10 bg-zinc-950 overflow-hidden">
                     <div className="flex-1 px-3 py-2.5 text-sm font-mono tracking-widest text-white truncate">
                       {inviteSummary.invite_code}
                     </div>
                     <button
                       type="button"
                       onClick={() => copyInvite(inviteSummary.invite_code, 'code')}
                       className="px-3 border-l border-white/10 text-xs font-bold text-violet-200 hover:bg-violet-500/15 transition flex items-center gap-1.5"
                     >
                       {inviteCodeCopied ? <Check size={14} /> : <Copy size={14} />}
                       {inviteCodeCopied ? t.invite_reward_copied : t.invite_reward_copy}
                     </button>
                   </div>
                 </div>

                 <div className="space-y-1.5">
                   <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                     {t.invite_reward_link_label}
                   </div>
                   <div className="flex items-stretch rounded-lg border border-white/10 bg-zinc-950 overflow-hidden">
                     <div className="flex-1 px-3 py-2.5 text-xs text-zinc-300 truncate">{inviteShareLink}</div>
                     <button
                       type="button"
                       onClick={() => copyInvite(inviteShareLink, 'link')}
                       className="px-3 border-l border-white/10 text-xs font-bold text-violet-200 hover:bg-violet-500/15 transition flex items-center gap-1.5"
                     >
                       {inviteLinkCopied ? <Check size={14} /> : <Copy size={14} />}
                       {inviteLinkCopied ? t.invite_reward_copied : t.invite_reward_copy}
                     </button>
                   </div>
                 </div>
               </>
             ) : (
               <div className="py-4 text-center text-xs text-zinc-500">{t.profile_pref_invite_empty || 'No invite info available'}</div>
             )}
           </div>
         </AppDialog>
       )}

       {isPasswordDialogOpen && (
         <AppDialog
           isOpen={isPasswordDialogOpen}
           title={t.profile_password_title || 'Change password'}
           onClose={() => {
             setIsPasswordDialogOpen(false);
             resetPasswordForm();
           }}
           footer={
             <>
               <button
                 className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
                 onClick={() => {
                   setIsPasswordDialogOpen(false);
                   resetPasswordForm();
                 }}
               >
                 {t.profile_password_cancel || 'Cancel'}
               </button>
               <button
                 className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-bold border border-white/10 hover:bg-zinc-800 hover:border-white/20 disabled:opacity-60"
                 onClick={handleChangePassword}
                 disabled={isChangingPassword}
               >
                 {isChangingPassword ? (t.profile_password_submitting || 'Submitting...') : (t.profile_password_confirm || 'Confirm')}
               </button>
             </>
           }
         >
           <div className="space-y-3">
             {!requiresCurrentPassword && (
             <p className="text-xs text-zinc-500">{t.profile_password_first_time_hint || 'First time setting password, current password is not required.'}</p>
             )}
             <p className="text-xs text-zinc-500">{t.password_rule_hint}</p>
             {requiresCurrentPassword && (
               <input
                 type="password"
                 value={currentPassword}
                 onChange={(e) => setCurrentPassword(e.target.value)}
                 placeholder={t.profile_password_current_placeholder || 'Current password'}
                 className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/30"
               />
             )}
               <input
                 type="password"
                 value={nextPassword}
                 onChange={(e) => setNextPassword(e.target.value)}
                 placeholder={t.profile_password_new_placeholder || 'New password'}
                 className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/30"
               />
               <input
                 type="password"
                 value={confirmNextPassword}
                 onChange={(e) => setConfirmNextPassword(e.target.value)}
                 placeholder={t.profile_password_confirm_placeholder || 'Confirm new password'}
                 className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/30"
               />
           </div>
         </AppDialog>
       )}
       {isInfoOpen && (
        <AppDialog isOpen={isInfoOpen} title={infoTitle || t.profile_notice} onClose={() => setIsInfoOpen(false)} footer={<><button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setIsInfoOpen(false)}>{t.profile_ok}</button></>}>
           <div className="whitespace-pre-line text-sm text-zinc-300">{infoMessage}</div>
         </AppDialog>
       )}
       {isOpenClawDialogOpen && (
         <AppDialog
           isOpen={isOpenClawDialogOpen}
           title={t.profile_openclaw_title || 'OpenClaw 查询密钥管理'}
           onClose={() => {
             setIsOpenClawDialogOpen(false);
             setOpenClawKey('');
           }}
           footer={
             <>
               <button
                 className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
                 onClick={() => {
                   setIsOpenClawDialogOpen(false);
                   setOpenClawKey('');
                 }}
               >
                 {t.profile_openclaw_btn_close || '关闭'}
               </button>
             </>
           }
         >
           <div className="space-y-3 text-sm text-zinc-300">
             <div className="rounded-lg border border-white/10 bg-zinc-900/50 p-3">
               <div>{t.profile_openclaw_phone || '手机号'}: <span className="text-white">{openClawStatus.phone || (t.profile_openclaw_unbound || '未绑定')}</span></div>
               <div className="mt-1">{t.profile_openclaw_status || '状态'}: <span className={openClawStatus.enabled ? 'text-emerald-400' : 'text-zinc-500'}>{openClawStatus.enabled ? (t.profile_openclaw_status_enabled || '已启用') : (t.profile_openclaw_status_disabled || '未启用')}</span></div>
               <div className="mt-1">{t.profile_openclaw_key || '密钥'}: <span className="text-white">{openClawKey || openClawStatus.maskedKey || (t.profile_openclaw_not_generated || '未生成')}</span></div>
               <div className="mt-1">{t.profile_openclaw_update_time || '更新时间'}: <span className="text-zinc-400">{openClawStatus.updatedAt ? new Date(openClawStatus.updatedAt).toLocaleString() : '-'}</span></div>
             </div>

             <div className="flex flex-wrap gap-2">
               <button
                 onClick={handleToggleOpenClaw}
                 disabled={isOpenClawLoading}
                 className="px-3 py-2 rounded-lg text-xs font-bold bg-white/5 text-white border border-white/10 hover:bg-white/10 disabled:opacity-60"
               >
                 {openClawStatus.enabled ? (t.profile_openclaw_btn_disable || '禁用') : (t.profile_openclaw_btn_enable || '启用')}
               </button>
               
               {openClawStatus.enabled && (
                 <>
                   <button
                     onClick={handleRegenerateOpenClawKey}
                     disabled={isOpenClawLoading}
                     className="px-3 py-2 rounded-lg text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 disabled:opacity-60"
                   >
                     {t.profile_openclaw_btn_regenerate || '生成/换新密钥'}
                   </button>
                   <button
                     onClick={handleCopyOpenClawKey}
                     disabled={isOpenClawLoading}
                     className="px-3 py-2 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-60"
                   >
                     {t.profile_openclaw_btn_copy || '复制密钥'}
                   </button>
                 </>
               )}
             </div>

             <div className="text-xs text-zinc-500 leading-relaxed">
               {t.profile_openclaw_hint || 'OpenClaw 仅支持只读查询与下载链接获取。调用时需同时提供手机号和密钥。'}
             </div>
           </div>
         </AppDialog>
       )}
    </div>
  );
};

  // Info dialog state/hooks
  function useProfileInfo() {
    const [isInfoOpen, setIsInfoOpen] = React.useState(false);
    const [infoTitle, setInfoTitle] = React.useState('');
    const [infoMessage, setInfoMessage] = React.useState<string | null>(null);
    const openInfo = (title: string, message: string | null = null) => {
      setInfoTitle(title || '');
      setInfoMessage(message || null);
      setIsInfoOpen(true);
    };
    return { isInfoOpen, setIsInfoOpen, infoTitle, infoMessage, openInfo };
  }
