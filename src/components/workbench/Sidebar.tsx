import React from 'react';
import {
  Clapperboard,
  CreditCard,
  Flame,
  Folder,
  FolderOpen,
  History,
  Image as ImageIcon,
  LayoutGrid,
  LogIn,
  PencilLine,
  Sparkles,
  SunMoon,
  Shirt,
  User as UserIcon,
  Video,
  Wand2,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/auth';
import type { ViewType } from './types';

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isDebugModeEnabled: boolean;
  theme: 'dark' | 'light' | 'dim' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'dim' | 'system') => void;
}

const PRODUCT_IMAGE_VIEWS: ViewType[] = [
  'product_images_clothing_swap',
  'product_images_first_frame',
  'product_images_smart_repair',
  'product_images_gallery',
  'product_images_text_separation',
];

export const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, isDebugModeEnabled, theme, setTheme }) => {
  const { t, language } = useLanguage();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const isZh = language === 'zh';
  const tx = (key: string, fallback: string) => ((t as any)[key] as string) || fallback;
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);
  const themeCycle: Array<'light' | 'dark' | 'dim' | 'system'> = ['system', 'light', 'dark', 'dim'];

  const handleCycleTheme = React.useCallback(() => {
    const currentIndex = themeCycle.indexOf(theme);
    const nextTheme = themeCycle[(currentIndex + 1 + themeCycle.length) % themeCycle.length];
    setTheme(nextTheme);
    updateUser({ theme: nextTheme });
    void authApi.updateProfile({ theme: nextTheme }).catch((err) => {
      console.error('Failed to persist sidebar theme switch', err);
    });
  }, [setTheme, theme, updateUser]);

  const nextTheme = themeCycle[(themeCycle.indexOf(theme) + 1 + themeCycle.length) % themeCycle.length];
  const themeButtonLabel = nextTheme === 'light'
    ? tr('切换到日间', 'Switch to light')
    : nextTheme === 'dark'
      ? tr('切换到夜间', 'Switch to dark')
      : nextTheme === 'dim'
        ? tr('切换到暗淡', 'Switch to dim')
        : tr('切换到跟随系统', 'Switch to system');

  const isProductImagesView = PRODUCT_IMAGE_VIEWS.includes(activeView);
  const [isProductImagesSectionOpen, setIsProductImagesSectionOpen] = React.useState(isProductImagesView);

  React.useEffect(() => {
    if (isProductImagesView) {
      setIsProductImagesSectionOpen(true);
    }
  }, [isProductImagesView]);

  const navigateToView = React.useCallback((view: ViewType) => {
    setActiveView(view);
    if (!PRODUCT_IMAGE_VIEWS.includes(view)) {
      setIsProductImagesSectionOpen(false);
    }
  }, [setActiveView]);

  const productImageOptions: Array<{ view: ViewType; label: string; icon: any }> = [
    { view: 'product_images_clothing_swap', label: tx('wb_nav_product_clothing_swap', tr('AI 换装', 'AI Clothing Swap')), icon: Shirt },
    { view: 'product_images_first_frame', label: tx('wb_nav_product_first_frame', tr('AI 首帧图', 'AI First Frame')), icon: Clapperboard },
    { view: 'product_images_smart_repair', label: tx('wb_nav_product_smart_repair', tr('AI 智能修复', 'AI Smart Repair')), icon: Wrench },
    { view: 'product_images_gallery', label: tx('wb_nav_product_gallery', tr('AI 商品套图', 'AI Product Gallery')), icon: LayoutGrid },
    { view: 'product_images_text_separation', label: tx('wb_nav_product_text_separation', tr('AI 海报编辑', 'AI Poster Editor')), icon: PencilLine },
  ];

  const InternalNav = ({ icon: Icon, view, label }: { icon: any; view: ViewType; label: string }) => (
    <button
      type="button"
      onClick={() => {
        navigateToView(view);
      }}
      className={`h-12 w-full rounded-xl flex items-center justify-center cursor-pointer transition group relative ${
        activeView === view ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <div className={`transition-colors ${activeView === view ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
        <Icon className={`w-5 h-5 transition-all ${activeView === view ? 'stroke-[2.5px]' : ''}`} />
      </div>
      {activeView === view && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />}
      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
        {label}
      </div>
    </button>
  );

  const ProductImagesNav = () => {
    const active = isProductImagesView;

    return (
      <button
        type="button"
        onClick={() => {
          if (active) {
            setIsProductImagesSectionOpen((prev) => !prev);
            return;
          }
          setIsProductImagesSectionOpen(true);
          setActiveView('product_images_first_frame');
        }}
        className={`h-12 w-full rounded-xl flex items-center justify-center cursor-pointer transition group relative ${
          active ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        aria-expanded={isProductImagesSectionOpen}
        aria-controls="product-images-subnav"
        title={tx('wb_nav_product_images', tr('商品图片生成', 'Product Images'))}
      >
        <div className={`transition-colors ${active ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
          <ImageIcon className={`w-5 h-5 transition-all ${active ? 'stroke-[2.5px]' : ''}`} />
        </div>
        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />}
        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
          {tx('wb_nav_product_images', tr('商品图片生成', 'Product Images'))}
        </div>
      </button>
    );
  };

  return (
    <aside className="bg-zinc-950 border-r border-white/5 flex z-30 shrink-0">
      <div className="w-16 lg:w-20 flex flex-col items-center py-6 gap-6 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-orange-500 flex items-center justify-center font-bold italic text-black mb-2 shadow-lg shadow-orange-500/20">
          VF
        </div>

        <div className="flex flex-col gap-4 w-full px-2">
          <ProductImagesNav />
          <InternalNav icon={Video} view="workbench" label={t.wb_nav_workbench} />
          <InternalNav icon={activeView === 'assets' ? FolderOpen : Folder} view="assets" label={t.wb_nav_assets} />
          <InternalNav icon={History} view="history" label={t.wb_nav_history} />
          {isDebugModeEnabled && <InternalNav icon={Sparkles} view="agent" label={t.wb_nav_agent} />}
          <InternalNav icon={CreditCard} view="billing" label={t.wb_nav_billing || 'Billing'} />
        </div>

        <div className="mt-auto pb-6 w-full px-2 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleCycleTheme}
            className="w-10 h-10 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 border group relative border-white/5 bg-zinc-900/50 hover:border-white/20"
            title={themeButtonLabel}
          >
            <div className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
              <SunMoon className="w-5 h-5" />
            </div>
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
              {themeButtonLabel}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              navigateToView('replay_lab');
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

          <button
            type="button"
            onClick={() => {
              if (!user) {
                navigate('/login?returnUrl=/app');
                return;
              }
              navigateToView('profile');
            }}
            className={`w-10 h-10 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 border group relative ${
              !user
                ? 'border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20'
                : activeView === 'profile'
                  ? 'border-orange-500 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                  : 'border-white/5 bg-zinc-900/50 hover:border-white/20'
            }`}
          >
            {!user ? (
              <div className="text-orange-500 transition-colors">
                <LogIn className="w-5 h-5" />
              </div>
            ) : user.avatar ? (
              <img src={user.avatar} className="w-full h-full object-cover rounded-xl" alt="Profile" />
            ) : (
              <div className={`transition-colors ${activeView === 'profile' ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                <UserIcon className="w-5 h-5" />
              </div>
            )}

            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
              {!user ? ((t as any).guest_login_button || 'Log In') : t.profile_title}
            </div>
          </button>
        </div>
      </div>

      {isProductImagesSectionOpen ? (
        <div
          id="product-images-subnav"
          className="w-48 border-l border-white/5 bg-zinc-950/70 px-3 py-6 shrink-0"
        >
          <div className="flex flex-col gap-1"
            role="menu"
            aria-label={tx('wb_nav_product_images', tr('商品图片生成', 'Product Images'))}
          >
            {productImageOptions.map((opt) => {
              const selected = activeView === opt.view;
              const ItemIcon = opt.icon;
              return (
                <button
                  key={opt.view}
                  type="button"
                  onClick={() => setActiveView(opt.view)}
                  className={`wb-product-subnav-item relative h-12 w-full rounded-xl flex items-center px-4 pl-9 text-left text-sm transition group ${
                    selected
                      ? 'wb-product-subnav-item--active text-violet-300 bg-violet-500/10'
                      : 'wb-product-subnav-item--inactive text-zinc-500 hover:text-violet-300'
                  }`}
                  role="menuitem"
                  aria-current={selected ? 'page' : undefined}
                >
                  <ItemIcon className={`mr-3 h-4 w-4 shrink-0 ${selected ? 'text-violet-300' : 'text-zinc-400 group-hover:text-violet-300'}`} />
                  {selected ? <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-violet-400" /> : null}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </aside>
  );
};

