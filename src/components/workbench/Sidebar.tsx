import React from 'react';
import { Zap, Image as ImageIcon, LayoutTemplate, History, Sparkles, User as UserIcon, CreditCard } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
// 1. Import the type
import type { ViewType } from './types'; 

// 2. Remove the old "export type ViewType = ..." definition from here completely.

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isDebugModeEnabled: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, isDebugModeEnabled }) => {
  // ... (keep the rest of the component code exactly the same)
  const { t } = useLanguage();
  const { user } = useAuth();

  const InternalNav = ({ icon: Icon, view, label }: { icon: any, view: ViewType, label: string }) => (
    <div 
      onClick={() => setActiveView(view)} 
      className={`h-12 w-full rounded-xl flex items-center justify-center cursor-pointer transition group relative ${activeView === view ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300'}`} 
    >
      <Icon className={`w-5 h-5 transition-all ${activeView === view ? 'stroke-[2.5px]' : ''}`} />
      {activeView === view && (<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />)}
      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
        {label}
      </div>
    </div>
  );

  return (
     <aside className="w-16 lg:w-20 bg-zinc-950 border-r border-white/5 flex flex-col items-center py-6 gap-6 z-30 shrink-0">
       {/* ... existing JSX ... */}
       <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-orange-500 flex items-center justify-center font-bold italic text-black mb-2 shadow-lg shadow-orange-500/20">
        VF
      </div>
      <div className="flex flex-col gap-4 w-full px-2">
        <InternalNav icon={Zap} view="workbench" label={t.wb_nav_workbench} />
        <InternalNav icon={ImageIcon} view="assets" label={t.wb_nav_assets} />
        <InternalNav icon={LayoutTemplate} view="templates" label={t.wb_nav_templates} />
        <InternalNav icon={History} view="history" label={t.wb_nav_history} />
        {isDebugModeEnabled && <InternalNav icon={Sparkles} view="agent" label={t.wb_nav_agent} />}
        <InternalNav icon={CreditCard} view="billing" label={t.wb_nav_billing || 'Billing'} />
      </div>
      <div className="mt-auto pb-6 w-full px-2 flex flex-col items-center gap-4">
        <div 
          onClick={() => setActiveView('profile')}
          className={`w-10 h-10 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 border group relative ${activeView === 'profile' ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'border-white/5 bg-zinc-900/50 hover:border-white/20'}`}
        >
          {user?.avatar ? (
            <img src={user.avatar} className="w-full h-full object-cover" alt="Profile" />
          ) : (
            <div className={`transition-colors ${activeView === 'profile' ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
              <UserIcon className="w-5 h-5" />
            </div>
          )}

          <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
            {t.profile_title}
          </div>
        </div>
      </div>
    </aside>
  );
};
