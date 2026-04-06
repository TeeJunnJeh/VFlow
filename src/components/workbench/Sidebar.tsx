import React from 'react';
import {
  CreditCard,
  Flame,
  FolderOpen,
  History,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  ScanText,
  Shirt,
  Sparkles,
  User as UserIcon,
  Video,
  WandSparkles,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import type { ViewType } from './types';

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isDebugModeEnabled: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, isDebugModeEnabled }) => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isZh = language === 'zh';
  const tx = (key: string, fallback: string) => ((t as any)[key] as string) || fallback;
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);

  const isProductImagesView =
    activeView === 'product_images_clothing_swap' ||
    activeView === 'product_images_first_frame' ||
    activeView === 'product_images_smart_repair' ||
    activeView === 'product_images_gallery' ||
    activeView === 'product_images_text_separation';

  const [isProductImagesMenuOpen, setIsProductImagesMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (isProductImagesView) setIsProductImagesMenuOpen(true);
  }, [isProductImagesView]);

  const InternalNav = ({ icon: Icon, view, label }: { icon: any; view: ViewType; label: string }) => (
    <div
      onClick={() => {
        setActiveView(view);
        setIsProductImagesMenuOpen(false);
      }}
      className={`h-12 w-full rounded-xl flex items-center justify-center cursor-pointer transition group relative ${
        activeView === view ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <Icon className={`w-5 h-5 transition-all ${activeView === view ? 'stroke-[2.5px]' : ''}`} />
      {activeView === view && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />}
      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
        {label}
      </div>
    </div>
  );

  const ProductImagesNav = () => {
    const active = isProductImagesView;
    return (
      <div
        onClick={() => {
          if (!isProductImagesMenuOpen) {
            setIsProductImagesMenuOpen(true);
          }
          if (!isProductImagesView) {
            setActiveView('product_images_first_frame');
          }
        }}
        className={`h-12 w-full rounded-xl flex items-center justify-center cursor-pointer transition group relative ${
          active ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <ImageIcon className={`w-5 h-5 transition-all ${active ? 'stroke-[2.5px]' : ''}`} />
        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />}
        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
          {tx('wb_nav_product_images', tr('商品图片生成', 'Product Images'))}
        </div>
      </div>
    );
  };

  const ProductSubNav = ({ icon: Icon, view, label }: { icon: any; view: ViewType; label: string }) => (
    <button
      type="button"
      onClick={() => setActiveView(view)}
      className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${
        activeView === view
          ? 'border-orange-500/60 bg-orange-500/10 text-orange-200'
          : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5'
      }`}
    >
      <span className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 shrink-0" />
        <span>{label}</span>
      </span>
    </button>
  );

  return (
    <aside className="bg-zinc-950 border-r border-white/5 flex z-30 shrink-0">
      <div className="w-16 lg:w-20 flex flex-col items-center py-6 gap-6 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-orange-500 flex items-center justify-center font-bold italic text-black mb-2 shadow-lg shadow-orange-500/20">
          VF
        </div>

        <div className="flex flex-col gap-4 w-full px-2">
          <ProductImagesNav />
          <InternalNav icon={Video} view="workbench" label={t.wb_nav_workbench} />
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
            className={`w-10 h-10 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 border group relative ${
              activeView === 'replay_lab'
                ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                : 'border-white/5 bg-zinc-900/50 hover:border-white/20'
            }`}
            title={t.wb_replay_dev_entry || 'Replay Lab'}
          >
            <div className={`transition-colors ${activeView === 'replay_lab' ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
              <Flame className="w-5 h-5" />
            </div>
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
              {t.wb_replay_dev_entry || 'Replay Lab'}
            </div>
          </button>

          <div
            onClick={() => {
              setActiveView('profile');
              setIsProductImagesMenuOpen(false);
            }}
            className={`w-10 h-10 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 border group relative ${
              activeView === 'profile'
                ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                : 'border-white/5 bg-zinc-900/50 hover:border-white/20'
            }`}
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

      {isProductImagesMenuOpen && (
        <div className="w-52 border-l border-white/5 bg-zinc-950/95 backdrop-blur-sm px-3 py-6">
          <div className="px-1 text-sm font-semibold tracking-wide text-zinc-500">
            {tx('wb_nav_product_images', tr('商品图片生成', 'Product Images'))}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <ProductSubNav icon={Shirt} view="product_images_clothing_swap" label={tx('wb_nav_product_clothing_swap', tr('AI 换装', 'AI Clothing Swap'))} />
            <ProductSubNav icon={ImagePlus} view="product_images_first_frame" label={tx('wb_nav_product_first_frame', tr('AI 首帧图', 'AI First Frame'))} />
            <ProductSubNav icon={WandSparkles} view="product_images_smart_repair" label={tx('wb_nav_product_smart_repair', tr('AI智能修复', 'AI Smart Repair'))} />
            <ProductSubNav icon={LayoutGrid} view="product_images_gallery" label={tx('wb_nav_product_gallery', tr('AI 商品套图', 'AI Product Gallery'))} />
            <ProductSubNav icon={ScanText} view="product_images_text_separation" label={tr('文本分离', 'Text Separation')} />
          </div>
        </div>
      )}
    </aside>
  );
};
