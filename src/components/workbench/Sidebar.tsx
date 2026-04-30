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
import { type ThemeMode } from '../../utils/theme';
import type { ViewType } from './types';

const PRODUCT_IMAGES_SECTION_ANIMATION_MS = 300;
const PRODUCT_IMAGES_SECTION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const PRODUCT_IMAGES_LAST_VIEW_STORAGE_KEY = 'vflow_product_images_last_view';
const PRODUCT_IMAGES_SUBNAV_MIN_WIDTH = 192;
const PRODUCT_IMAGES_SUBNAV_MAX_WIDTH = 320;
const PRODUCT_IMAGES_SUBNAV_LABEL_PADDING = 104;

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isDebugModeEnabled: boolean;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const PRODUCT_IMAGE_VIEWS: ViewType[] = [
  'product_images_clothing_swap',
  'product_images_first_frame',
  'product_images_smart_repair',
  'product_images_gallery',
  'product_images_text_separation',
];

const isProductImageViewType = (view: string | null | undefined): view is ViewType => (
  typeof view === 'string' && PRODUCT_IMAGE_VIEWS.includes(view as ViewType)
);

const readLastProductImageView = (): ViewType => {
  if (typeof window === 'undefined') return 'product_images_first_frame';
  try {
    const savedView = window.localStorage.getItem(PRODUCT_IMAGES_LAST_VIEW_STORAGE_KEY);
    return isProductImageViewType(savedView) ? savedView : 'product_images_first_frame';
  } catch {
    return 'product_images_first_frame';
  }
};

export const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, isDebugModeEnabled, theme, setTheme }) => {
  const { t, language } = useLanguage();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';

  const handleCycleTheme = React.useCallback(() => {
    setTheme(nextTheme);
    updateUser({ theme: nextTheme });
    
    // 仅在用户登录时才尝试同步到后端
    if (user) {
      void authApi.updateProfile({ theme: nextTheme }).catch((err) => {
        console.error('Failed to persist sidebar theme switch', err);
      });
    }
  }, [nextTheme, setTheme, updateUser, user]);

  const themeButtonLabel = nextTheme === 'light'
    ? t.sidebar_switch_to_light
    : t.sidebar_switch_to_dark;

  const isProductImagesView = PRODUCT_IMAGE_VIEWS.includes(activeView);
  const [isProductImagesSectionOpen, setIsProductImagesSectionOpen] = React.useState(isProductImagesView);
  const [productImagesSubnavWidth, setProductImagesSubnavWidth] = React.useState(PRODUCT_IMAGES_SUBNAV_MIN_WIDTH);
  const productImageLabelRefs = React.useRef<Array<HTMLSpanElement | null>>([]);

  React.useEffect(() => {
    if (isProductImagesView) {
      setIsProductImagesSectionOpen(true);
      try {
        window.localStorage.setItem(PRODUCT_IMAGES_LAST_VIEW_STORAGE_KEY, activeView);
      } catch {
        // ignore storage write failures
      }
    }
  }, [activeView, isProductImagesView]);

  const navigateToView = React.useCallback((view: ViewType) => {
    setActiveView(view);
    if (!PRODUCT_IMAGE_VIEWS.includes(view)) {
      setIsProductImagesSectionOpen(false);
    }
  }, [setActiveView]);

  const productImageOptions: Array<{ view: ViewType; label: string; icon: any }> = [
    { view: 'product_images_clothing_swap', label: t.wb_nav_product_clothing_swap, icon: Shirt },
    { view: 'product_images_first_frame', label: t.wb_nav_product_first_frame, icon: Clapperboard },
    { view: 'product_images_smart_repair', label: t.wb_nav_product_smart_repair, icon: Wrench },
    { view: 'product_images_gallery', label: t.wb_nav_product_gallery, icon: LayoutGrid },
    { view: 'product_images_text_separation', label: t.wb_nav_product_text_separation, icon: PencilLine },
  ];

  React.useLayoutEffect(() => {
    const widestLabel = productImageLabelRefs.current.reduce((max, node) => {
      if (!node) return max;
      return Math.max(max, Math.ceil(node.scrollWidth || node.getBoundingClientRect().width || 0));
    }, 0);
    const nextWidth = Math.min(
      PRODUCT_IMAGES_SUBNAV_MAX_WIDTH,
      Math.max(PRODUCT_IMAGES_SUBNAV_MIN_WIDTH, widestLabel + PRODUCT_IMAGES_SUBNAV_LABEL_PADDING)
    );
    setProductImagesSubnavWidth(nextWidth);
  }, [language, productImageOptions]);

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
          setActiveView(readLastProductImageView());
        }}
        className={`h-12 w-full rounded-xl flex items-center justify-center cursor-pointer transition group relative ${
          active ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300'
        }`}
        aria-expanded={isProductImagesSectionOpen}
        aria-controls="product-images-subnav"
      >
        <div className={`transition-colors ${active ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
          <ImageIcon className={`w-5 h-5 transition-all ${active ? 'stroke-[2.5px]' : ''}`} />
        </div>
        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />}
        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-800 text-zinc-100 text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
          {t.wb_nav_product_images}
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

      <div
        id="product-images-subnav"
        className={`shrink-0 overflow-hidden bg-zinc-950/70 transition-[width,opacity,border-color] ${
          isProductImagesSectionOpen
            ? 'border-l border-white/5 opacity-100'
            : 'border-l border-transparent opacity-0'
        }`}
        style={{
          width: isProductImagesSectionOpen ? `${productImagesSubnavWidth}px` : '0rem',
          transitionDuration: `${PRODUCT_IMAGES_SECTION_ANIMATION_MS}ms`,
          transitionTimingFunction: PRODUCT_IMAGES_SECTION_EASING,
        }}
        aria-hidden={!isProductImagesSectionOpen}
      >
        <div
          className="px-3 py-6"
          style={{ width: `${productImagesSubnavWidth}px` }}
        >
          <div
            className={`flex flex-col gap-1 transition-opacity ${
              isProductImagesSectionOpen
                ? 'opacity-100'
                : 'opacity-0'
            }`}
            style={{
              transitionDuration: `${PRODUCT_IMAGES_SECTION_ANIMATION_MS}ms`,
              transitionTimingFunction: PRODUCT_IMAGES_SECTION_EASING,
            }}
            role="menu"
            aria-label={t.wb_nav_product_images}
          >
            {productImageOptions.map((opt) => {
              const selected = activeView === opt.view;
              const ItemIcon = opt.icon;
              return (
                <button
                  key={opt.view}
                  type="button"
                  onClick={() => setActiveView(opt.view)}
                  className={`wb-product-subnav-item relative h-12 w-full rounded-xl flex items-center px-4 pl-9 text-left text-sm font-bold transition group ${
                    selected
                      ? 'wb-product-subnav-item--active text-violet-300 bg-violet-500/10'
                      : 'wb-product-subnav-item--inactive text-zinc-500 hover:text-violet-300'
                  }`}
                  role="menuitem"
                  aria-current={selected ? 'page' : undefined}
                  tabIndex={isProductImagesSectionOpen ? 0 : -1}
                >
                  <ItemIcon className={`mr-3 h-4 w-4 shrink-0 ${selected ? 'text-violet-300' : 'text-zinc-400 group-hover:text-violet-300'}`} />
                  {selected ? <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-violet-400" /> : null}
                  <span
                    ref={(node) => {
                      productImageLabelRefs.current[productImageOptions.findIndex((item) => item.view === opt.view)] = node;
                    }}
                    className="whitespace-nowrap"
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
};

