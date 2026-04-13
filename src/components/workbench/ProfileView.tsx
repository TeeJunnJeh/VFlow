import React, { useState, useRef, useEffect } from 'react';
import { Edit3, User as UserIcon, Settings2, LogOut, Flame, Gem, Zap, KeyRound } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/auth';
import { billingApi } from '../../services/billing';
import { videoApi } from '../../services/video';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { DropdownSelect } from '../common/DropdownSelect';
import { AppDialog } from '../common/AppDialog';
import { getWorkbenchPreferences, setWorkbenchPreferences, type WorkbenchPreferences } from '../../utils/preferences';
import { isStrongPassword } from '../../utils/passwordRules';

interface ProfileViewProps {
  theme: 'dark' | 'light' | 'dim';
  setTheme: (t: 'dark' | 'light' | 'dim') => void;
  isDebugModeEnabled: boolean;
}

type OpenClawKeyState = {
  phone: string | null;
  enabled: boolean;
  hasKey: boolean;
  maskedKey: string;
  updatedAt: string | null;
};

export const ProfileView: React.FC<ProfileViewProps> = ({ theme, setTheme, isDebugModeEnabled }) => {
  const { t } = useLanguage();
  const { user, updateUser, logout } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [newNickname, setNewNickname] = useState(user?.name || '');
  const [showBilling, setShowBilling] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isResettingVideoEstimate, setIsResettingVideoEstimate] = useState(false);
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
      theme: (stored.theme === 'light' || stored.theme === 'dim' || stored.theme === 'dark') ? stored.theme : theme,
    };
  };

  const [isPreferencesExpanded, setIsPreferencesExpanded] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState<WorkbenchPreferences>(() => buildPrefsDraft());

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

  const handleThemeSelect = async (nextTheme: 'dark' | 'light' | 'dim') => {
    setPrefsDraft((prev) => ({ ...prev, theme: nextTheme }));
    setTheme(nextTheme);

    const nextPrefs = { ...buildPrefsDraft(), theme: nextTheme };
    setWorkbenchPreferences(nextPrefs, user?.id ?? null);

    try {
      const res = await authApi.updateProfile({ theme: nextTheme });
      updateUser({ theme: res.data.theme });
    } catch (err: any) {
      openInfo(t.profile_error || 'Error', err?.message || 'Failed to save theme');
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

    if (next.theme !== theme) {
      setTheme(next.theme);
      try {
        const res = await authApi.updateProfile({ theme: next.theme });
        updateUser({ theme: res.data.theme });
      } catch (err) {
        console.error('Failed to save theme preference', err);
      }
    }
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
      openInfo(t.profile_error || 'Error', err?.message || 'Failed to load OpenClaw key status');
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
        setBillingError(err?.message || 'Failed to load billing');
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    };

    loadBilling();
    return () => {
      cancelled = true;
    };
  }, [showBilling]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const res = await authApi.updateProfile({ avatar: file });
        if (res.data?.avatar) updateUser({ avatar: res.data.avatar });
      } catch (err) { openInfo('Error', 'Failed to upload'); }
    }
  };

  const handleUpdateName = async () => {
     setIsEditingNickname(false);
     if (newNickname.trim() && newNickname.trim() !== user?.name) {
          try {
            const res = await authApi.updateProfile({ name: newNickname.trim() });
            updateUser({ name: res.data.name });
          } catch (e) { openInfo('Error', 'Error updating name'); }
     }
  };

  const handleUseDefaultAvatar = async () => {
    try {
      await authApi.updateProfile({ avatarClear: true });
      updateUser({ avatar: '' });
    } catch (err) {
      openInfo('Error', 'Failed to reset avatar');
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
      openInfo(t.profile_error || 'Error', err?.message || 'Failed to regenerate key');
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
      openInfo(t.profile_error || 'Error', err?.message || 'Failed to toggle key status');
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
      openInfo(t.profile_error || 'Error', err?.message || 'Failed to copy key');
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
                        openInfo('Error', 'Failed to update plan via debug'); 
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
                        openInfo('Error', 'Failed to update credits via debug'); 
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
                                <h2 className="text-2xl font-bold text-white tracking-tight break-words max-w-full">{user?.name || 'User'}</h2>
                                <Edit3 className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </div>
                        )}
                        <div className="mt-2 text-center">
                            <button onClick={handleUseDefaultAvatar} className="text-[10px] font-bold text-zinc-500 hover:text-orange-500 transition-colors uppercase tracking-widest py-1 border-b border-white/5">{t.profile_use_default_avatar}</button>
                        </div>
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
                     <div className="space-y-4 bg-white/2 rounded-2xl p-6 border border-white/5 shadow-inner">
                        <div className="flex items-end justify-between px-1">
                            <div className="space-y-1">
                                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t.profile_balance || 'Balance'}</div>
                                <div className="text-4xl font-black text-white italic tracking-tighter">
                                    {user?.plan === 'pro' ? '∞' : (user?.credits || 0)} <span className="text-[10px] not-italic text-zinc-500 font-bold uppercase ml-1">{t.v_points || 'V-Points'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-xs font-bold text-zinc-600 mb-1">LIMIT: {user?.plan === 'pro' ? '∞' : user?.plan === 'plus' ? 500 : 100} V</div>
                              <button
                                onClick={() => setShowBilling(true)}
                                className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-yellow-400/40 text-yellow-100 bg-yellow-500/20 hover:bg-yellow-500/30 shadow-[0_0_20px_rgba(250,204,21,0.20)] hover:shadow-[0_0_24px_rgba(250,204,21,0.30)] transition"
                              >
                                {t.profile_billing_title || '账单明细'}
                              </button>
                            </div>
                        </div>
                        <div className="h-4 w-full bg-zinc-900 rounded-full border border-white/5 p-1 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ease-out relative ${user?.plan === 'pro' ? 'bg-gradient-to-r from-purple-600 via-orange-500 to-yellow-400' : user?.plan === 'plus' ? 'bg-gradient-to-r from-blue-700 via-indigo-500 to-yellow-400' : 'bg-gradient-to-r from-zinc-700 via-zinc-500 to-yellow-500/70'}`} style={{ width: `${user?.plan === 'pro' ? 100 : Math.min(((user?.credits || 0) / (user?.plan === 'plus' ? 500 : 100)) * 100, 100)}%` }}>
                                <div className="absolute inset-0 bg-white/10 animate-pulse" />
                            </div>
                        </div>
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
                           className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-yellow-400/30 text-yellow-100/90 bg-yellow-500/10 hover:bg-yellow-500/20 transition"
                         >
                           {t.profile_back || '返回'}
                         </button>
                       </div>

                       <div className="flex-1 bg-white/2 rounded-2xl p-6 border border-white/5 shadow-inner overflow-y-auto">
                         {billingLoading && (
                           <div className="text-xs text-zinc-500">Loading...</div>
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
                                  <div className={`text-base font-black ${tx.amount > 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 p-4 flex items-center justify-between">
                                <div className="flex flex-col">
                                  <span className="text-sm font-semibold text-yellow-100">
                                    {t.profile_billing_empty || '暂无消费记录'}
                                  </span>
                                  <span className="text-[11px] text-yellow-100/60">
                                    {t.profile_billing_recent || 'recent'}
                                  </span>
                                </div>
                                <div className="text-lg font-black text-yellow-200">0</div>
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
               <div className={`grid grid-cols-1 gap-4 pb-12 ${isDebugModeEnabled ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
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
                          <div className="text-base font-bold text-white">{t.profile_openclaw_title || 'OpenClaw Key'}</div>
                          <div className="text-xs text-zinc-600 mt-0.5">{openClawStatus.enabled ? (t.profile_openclaw_status_enabled || 'Enabled') : (t.profile_openclaw_status_disabled || 'Disabled')} · {openClawStatus.hasKey ? openClawStatus.maskedKey : (t.profile_openclaw_not_generated || 'Not Generated')}</div>
                        </div>
                      </div>
                    </button>
                  )}
                  
                  <button onClick={logout} className="w-full flex items-center justify-between p-6 rounded-2xl bg-red-500/5 hover:bg-red-500/10 transition group/logout border border-red-500/10 hover:border-red-500/20">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500"><LogOut className="w-6 h-6" /></div>
                          <div className="text-left">
                              <div className="text-base font-bold text-red-500">{t.sign_out}</div>
                              <div className="text-xs text-red-500/60 mt-0.5">{t.sign_out_subtitle || 'Sign out of current account'}</div>
                          </div>
                      </div>
                  </button>
               </div>

               {isPreferencesExpanded && (
                 <div className="mt-8 pt-8 border-t border-white/5 animate-in slide-in-from-top-4 duration-500">
                   <div className="space-y-10">
                     {/* 界面主题 */}
                     <section className="space-y-4">
                       <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider">
                         <Settings2 className="w-4 h-4 text-orange-500" /> 界面主题
                       </h3>
                       <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
                        <div className="space-y-2">
                           <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">{t.profile_pref_theme}</div>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { value: 'light', label: t.profile_theme_light || 'Light' },
                              { value: 'dim', label: t.profile_theme_dim || 'Dim' },
                              { value: 'dark', label: t.profile_theme_dark || 'Dark' },
                            ] as const).map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleThemeSelect(opt.value)}
                                className={`rounded-xl border px-3 py-2.5 text-xs font-black uppercase tracking-widest transition ${
                                  prefsDraft.theme === opt.value
                                    ? 'bg-orange-500/15 border-orange-500/35 text-orange-200 shadow-[0_0_18px_rgba(249,115,22,0.12)]'
                                    : 'bg-black/20 border-white/10 text-zinc-300 hover:bg-white/5 hover:border-white/20'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                         </div>
                       </div>
                     </section>

                     {/* 商品图片生成 */}
                     <section className="space-y-4">
                       <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider">
                         <Gem className="w-4 h-4 text-orange-500" /> 商品图片生成
                       </h3>
                       <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
                         <div className="text-xs text-zinc-600 italic">
                           暂无专属配置，后续将支持默认比例与风格预设。
                         </div>
                       </div>
                     </section>

                     {/* 视频生成 */}
                     <section className="space-y-4">
                       <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider">
                         <Zap className="w-4 h-4 text-orange-500" /> 视频生成
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

                         <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                           <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                             高级设置
                           </div>
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

                     {/* Action Buttons */}
                     <div className="flex justify-end gap-3 pt-6">
                       <button
                         className="px-6 py-2 rounded-xl bg-zinc-800 text-white text-sm font-bold hover:bg-zinc-700 transition"
                         onClick={() => setIsPreferencesExpanded(false)}
                       >
                         {t.profile_preferences_cancel || '取消'}
                       </button>
                       <button
                         className="px-8 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 shadow-[0_0_20px_rgba(249,115,22,0.2)] hover:shadow-[0_0_25px_rgba(249,115,22,0.3)] transition"
                         onClick={handleSavePreferences}
                       >
                         {t.profile_preferences_save || '保存设置'}
                       </button>
                     </div>
                   </div>
                 </div>
               )}
            </div>
         </div>
      </div>

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
         <AppDialog isOpen={isInfoOpen} title={infoTitle || 'Notice'} onClose={() => setIsInfoOpen(false)} footer={<><button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setIsInfoOpen(false)}>OK</button></>}>
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
