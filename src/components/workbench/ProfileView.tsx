import React, { useState, useRef } from 'react';
import { Edit3, User as UserIcon, Settings2, LogOut, Flame, Gem, Zap } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/auth';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

interface ProfileViewProps {
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ theme, setTheme }) => {
  const { t } = useLanguage();
  const { user, updateUser, logout } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [newNickname, setNewNickname] = useState(user?.name || '');

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const res = await authApi.updateProfile({ avatar: file });
        if (res.data?.avatar) updateUser({ avatar: res.data.avatar });
      } catch (err) { alert("Failed to upload"); }
    }
  };

  const handleUpdateName = async () => {
     setIsEditingNickname(false);
     if (newNickname.trim() && newNickname.trim() !== user?.name) {
        try {
           const res = await authApi.updateProfile({ name: newNickname.trim() });
           updateUser({ name: res.data.name });
        } catch (e) { alert("Error updating name"); }
     }
  };

  const handleUseDefaultAvatar = async () => {
    updateUser({ avatar: '' });
  };

  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.profile_title}</h1>
          <p className="text-zinc-500 text-xs mt-1">{t.profile_subtitle}</p>
        </div>
        
        <div className="flex items-center gap-6">
          {/* --- DEBUG TOOLBAR --- */}
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
                      alert("Failed to update plan via debug"); 
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
                      alert("Failed to update credits via debug"); 
                    } 
                  } 
                }} 
              />
              <span className="text-[8px] text-zinc-600">V</span>
            </div>
          </div>
          {/* --- END DEBUG TOOLBAR --- */}

          <LanguageSwitcher />
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-10 custom-scroll">
         <div className="max-w-4xl mx-auto">
            <div className="glass-panel p-12 rounded-[40px] border border-white/5 relative overflow-hidden group">
               {/* Background Glow Effect */}
               <div className={`absolute top-0 right-0 w-[400px] h-[400px] blur-[120px] rounded-full transition-all duration-1000 ${user?.plan === 'pro' ? 'bg-orange-500/10' : user?.plan === 'plus' ? 'bg-indigo-500/10' : 'bg-zinc-500/5'}`} />
               
               <div className="flex flex-col md:flex-row items-center md:items-start gap-12 relative z-10 w-full">
                  
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
                            <div className="text-xs font-bold text-zinc-600 mb-1">LIMIT: {user?.plan === 'pro' ? '∞' : user?.plan === 'plus' ? 500 : 100} V</div>
                        </div>
                        <div className="h-4 w-full bg-zinc-900 rounded-full border border-white/5 p-1 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ease-out relative ${user?.plan === 'pro' ? 'bg-gradient-to-r from-purple-600 via-orange-500 to-yellow-400' : user?.plan === 'plus' ? 'bg-gradient-to-r from-blue-700 via-indigo-500 to-cyan-400' : 'bg-gradient-to-r from-zinc-700 via-zinc-500 to-emerald-500/50'}`} style={{ width: `${user?.plan === 'pro' ? 100 : Math.min(((user?.credits || 0) / (user?.plan === 'plus' ? 500 : 100)) * 100, 100)}%` }}>
                                <div className="absolute inset-0 bg-white/10 animate-pulse" />
                            </div>
                        </div>
                     </div>
                  </div>
               </div>
               
               <hr className="mt-6 mb-6 border-white/5" />
               
               {/* Footer Buttons */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-12">
                  <div onClick={async () => { const newTheme = theme === 'dark' ? 'light' : 'dark'; setTheme(newTheme); try { const res = await authApi.updateProfile({ theme: newTheme }); updateUser({ theme: res.data.theme }); } catch (err) { console.error("Failed to save theme preference", err); } }} className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition group/item cursor-pointer shadow-sm hover:shadow-orange-500/5">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover/item:text-orange-500 transition-colors"><Settings2 className="w-6 h-6" /></div>
                          <div className="text-left">
                              <div className="text-base font-bold text-white">{t.profile_theme || 'Appearance'}</div>
                              <div className="text-xs text-zinc-600 mt-0.5 uppercase tracking-widest font-black">{theme === 'dark' ? t.profile_theme_dark : t.profile_theme_light}</div>
                          </div>
                      </div>
                      <div className={`w-5 h-5 text-zinc-700 transition-transform ${theme === 'light' ? 'rotate-180' : ''}`}><Settings2 className="w-5 h-5"/></div>
                  </div>
                  
                  <button onClick={logout} className="w-full flex items-center justify-between p-6 rounded-2xl bg-red-500/5 hover:bg-red-500/10 transition group/logout border border-red-500/10 hover:border-red-500/20">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500"><LogOut className="w-6 h-6" /></div>
                          <div className="text-left">
                              <div className="text-base font-bold text-red-500">{t.sign_out}</div>
                              <div className="text-xs text-red-500/60 mt-0.5">{t.sign_out_subtitle || 'Sign out of current account'}</div>
                          </div>
                      </div>
                      <LogOut className="w-5 h-5 text-red-500/30 group-hover:text-red-500 group-hover:translate-x-1 transition-all" />
                  </button>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};