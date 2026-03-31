import React from 'react';
import { Video, Image as ImageIcon, History, Sparkles, User as UserIcon, CreditCard, Flame, FolderOpen, LayoutGrid, Shirt, ImagePlus } from 'lucide-react';
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

  const isProductImagesView =
    activeView === 'product_images_clothing_swap'
    || activeView === 'product_images_first_frame'
    || activeView === 'product_images_gallery';

  const [isProductImagesMenuOpen, setIsProductImagesMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (isProductImagesView) setIsProductImagesMenuOpen(true);
  }, [isProductImagesView]);

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

  const ProductImagesNav = () => {
    const active = isProductImagesView;
    return (
      <div
        onClick={() => setActiveView('product_images_first_frame')}
        className={`h-12 w-full rounded-xl flex items-center justify-center cursor-pointer transition group relative ${active ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        <ImageIcon className={`w-5 h-5 transition-all ${active ? 'stroke-[2.5px]' : ''}`} />
        {active && (<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />)}
        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
          商品图片生成
        </div>
      </div>
    );
  };

  return (
    <aside className="bg-zinc-950 border-r border-white/5 flex z-30 shrink-0">
      <div className="w-16 lg:w-20 flex flex-col items-center py-6 gap-6 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-orange-500 flex items-center justify-center font-bold italic text-black mb-2 shadow-lg shadow-orange-500/20">
          VF
        </div>

        <div className="flex flex-col gap-4 w-full px-2">
          <InternalNav icon={Video} view="workbench" label={t.wb_nav_workbench} />
          <ProductImagesNav />
          <InternalNav icon={FolderOpen} view="assets" label={t.wb_nav_assets} />
          <InternalNav icon={History} view="history" label={t.wb_nav_history} />
          {isDebugModeEnabled && <InternalNav icon={Sparkles} view="agent" label={t.wb_nav_agent} />}
          <InternalNav icon={CreditCard} view="billing" label={t.wb_nav_billing || 'Billing'} />
        </div>

        <div className="mt-auto pb-6 w-full px-2 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setActiveView('replay_lab');
              setIsProductImagesMenuOpen(false);
            }}
            className={`w-10 h-10 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 border group relative ${activeView === 'replay_lab' ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'border-white/5 bg-zinc-900/50 hover:border-white/20'}`}
            title={t.wb_replay_dev_entry || '正在开发'}
          >
            <div className={`transition-colors ${activeView === 'replay_lab' ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
              <Flame className="w-5 h-5" />
            </div>
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
              {t.wb_replay_dev_entry || '正在开发'}
            </div>
          </button>

          <div
            onClick={() => {
              setActiveView('profile');
              setIsProductImagesMenuOpen(false);
            }}
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
      </div>


    </aside>
  );
};
