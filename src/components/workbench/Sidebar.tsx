import React from 'react';
import {
  Clapperboard,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Flame,
  Folder,
  FolderOpen,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  LogIn,
  PencilLine,
  Sparkles,
  SunMoon,
  Shirt,
  User as UserIcon,
  UserRound,
  Video,
  Wand2,
  Wrench,
  MessageSquare,
  UsersRound,
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
const CREATIVE_LAB_LAST_VIEW_STORAGE_KEY = 'vflow_creative_lab_last_view';
const PRODUCT_GALLERY_GUIDE_TRIGGER_KEY = 'vflow_product_gallery_guide_trigger';
const PRODUCT_IMAGES_SUBNAV_MIN_WIDTH = 176;
const PRODUCT_IMAGES_SUBNAV_MAX_WIDTH = 190;
const PRODUCT_IMAGES_SUBNAV_LABEL_PADDING = 50;

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isDebugModeEnabled: boolean;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const PRODUCT_IMAGE_VIEWS: ViewType[] = [
  'product_images_clothing_swap',
  'product_images_first_frame',
  'product_images_smart_repair',
  'product_images_gallery',
  'product_images_text_separation',
  'product_images_ai_model',
];

const CREATIVE_LAB_VIEWS: ViewType[] = [
  'creative_lab_replay',
  'creative_lab_script_extract',
  'creative_lab_canvas',
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

const isCreativeLabViewType = (view: string | null | undefined): view is ViewType => (
  typeof view === 'string' && CREATIVE_LAB_VIEWS.includes(view as ViewType)
);

const readLastCreativeLabView = (): ViewType => {
  if (typeof window === 'undefined') return 'creative_lab_replay';
  try {
    const savedView = window.localStorage.getItem(CREATIVE_LAB_LAST_VIEW_STORAGE_KEY);
    return isCreativeLabViewType(savedView) ? savedView : 'creative_lab_replay';
  } catch {
    return 'creative_lab_replay';
  }
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  isDebugModeEnabled,
  theme,
  setTheme,
  collapsed = false,
  onToggleCollapse,
}) => {
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
  const creationGroupLabel = (t as any).wb_nav_group_creation || 'Creation';
  const personalGroupLabel = (t as any).wb_nav_group_personal || 'Personal';

  const isProductImagesView = PRODUCT_IMAGE_VIEWS.includes(activeView);
  const isCreativeLabView = CREATIVE_LAB_VIEWS.includes(activeView);
  const [isProductImagesSectionOpen, setIsProductImagesSectionOpen] = React.useState(isProductImagesView);
  const [isCreativeLabSectionOpen, setIsCreativeLabSectionOpen] = React.useState(isCreativeLabView);
  const [productImagesSubnavWidth, setProductImagesSubnavWidth] = React.useState(PRODUCT_IMAGES_SUBNAV_MIN_WIDTH);
  const productImageLabelRefs = React.useRef<Array<HTMLSpanElement | null>>([]);
  const suppressNextClickRef = React.useRef(false);
  const suppressClickResetTimerRef = React.useRef<number | null>(null);

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

  React.useEffect(() => {
    if (isCreativeLabView) {
      setIsCreativeLabSectionOpen(true);
      try {
        window.localStorage.setItem(CREATIVE_LAB_LAST_VIEW_STORAGE_KEY, activeView);
      } catch {
        // ignore storage write failures
      }
    }
  }, [activeView, isCreativeLabView]);

  const navigateToView = React.useCallback((view: ViewType) => {
    setActiveView(view);
    if (!PRODUCT_IMAGE_VIEWS.includes(view)) {
      setIsProductImagesSectionOpen(false);
    }
    if (!CREATIVE_LAB_VIEWS.includes(view)) {
      setIsCreativeLabSectionOpen(false);
    }
  }, [setActiveView]);

  const suppressNextClick = React.useCallback(() => {
    suppressNextClickRef.current = true;
    if (suppressClickResetTimerRef.current) {
      window.clearTimeout(suppressClickResetTimerRef.current);
    }
    suppressClickResetTimerRef.current = window.setTimeout(() => {
      suppressNextClickRef.current = false;
      suppressClickResetTimerRef.current = null;
    }, 500);
  }, []);

  const handlePrimaryPointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>, view: ViewType) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    suppressNextClick();
    navigateToView(view);
  }, [navigateToView, suppressNextClick]);

  const productSectionOpen = isProductImagesSectionOpen && !collapsed;
  const creativeSectionOpen = isCreativeLabSectionOpen && !collapsed;

  React.useEffect(() => () => {
    if (suppressClickResetTimerRef.current) {
      window.clearTimeout(suppressClickResetTimerRef.current);
    }
  }, []);

  const productImageOptions: Array<{ view: ViewType; label: string; icon: any }> = [
    { view: 'product_images_clothing_swap', label: t.wb_nav_product_clothing_swap, icon: Shirt },
    { view: 'product_images_first_frame', label: t.wb_nav_product_first_frame, icon: Clapperboard },
    { view: 'product_images_smart_repair', label: t.wb_nav_product_smart_repair, icon: Wrench },
    { view: 'product_images_gallery', label: t.wb_nav_product_gallery, icon: LayoutGrid },
    { view: 'product_images_text_separation', label: t.wb_nav_product_text_separation, icon: PencilLine },
    { view: 'product_images_ai_model', label: t.wb_nav_product_ai_model, icon: UserRound },
  ];

  const creativeLabOptions: Array<{ view: ViewType; label: string; icon: any; disabled?: boolean }> = [
    { view: 'creative_lab_replay', label: (t as any).wb_nav_creative_replay || '爆款复刻', icon: Flame },
    { view: 'creative_lab_script_extract', label: (t as any).wb_nav_creative_script_extract || '脚本提取', icon: Clapperboard },
    { view: 'creative_lab_canvas', label: (t as any).wb_nav_creative_canvas || '无限画布', icon: LayoutDashboard, disabled: true },
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
      onPointerDown={(event) => handlePrimaryPointerDown(event, view)}
      onClick={() => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        navigateToView(view);
      }}
      title={label}
      className={`wb-sidebar-nav-item group ${activeView === view ? 'wb-sidebar-nav-item--active' : 'wb-sidebar-nav-item--inactive'}`}
    >
      <div className="wb-sidebar-nav-icon">
        <Icon className={`w-5 h-5 ${activeView === view ? 'stroke-[2.5px]' : ''}`} />
      </div>
      <span className="wb-sidebar-nav-label">{label}</span>
      {activeView === view && <div className="wb-sidebar-nav-indicator" />}
    </button>
  );

  const ProductImagesNav = () => {
    const active = isProductImagesView;

    return (
      <button
        type="button"
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.preventDefault();
          suppressNextClick();
          if (active) {
            setIsProductImagesSectionOpen((prev) => !prev);
            return;
          }
          setIsProductImagesSectionOpen(true);
          setIsCreativeLabSectionOpen(false);
          try {
            window.sessionStorage.removeItem(PRODUCT_GALLERY_GUIDE_TRIGGER_KEY);
          } catch {
            // ignore storage write failures
          }
          setActiveView(readLastProductImageView());
        }}
        onClick={() => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          if (active) {
            setIsProductImagesSectionOpen((prev) => !prev);
            return;
          }
          setIsProductImagesSectionOpen(true);
          setIsCreativeLabSectionOpen(false);
          try {
            window.sessionStorage.removeItem(PRODUCT_GALLERY_GUIDE_TRIGGER_KEY);
          } catch {
            // ignore storage write failures
          }
          setActiveView(readLastProductImageView());
        }}
        title={t.wb_nav_product_images}
        className={`wb-sidebar-nav-item group ${active ? 'wb-sidebar-nav-item--active' : 'wb-sidebar-nav-item--inactive'}`}
        aria-expanded={productSectionOpen}
        aria-controls="product-images-subnav"
      >
        <div className="wb-sidebar-nav-icon">
          <ImageIcon className={`w-5 h-5 ${active ? 'stroke-[2.5px]' : ''}`} />
        </div>
        <span className="wb-sidebar-nav-label">{t.wb_nav_product_images}</span>
        {active && <div className="wb-sidebar-nav-indicator" />}
      </button>
    );
  };

  const CreativeLabNav = () => {
    const active = isCreativeLabView;

    return (
      <button
        type="button"
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.preventDefault();
          suppressNextClick();
          if (active) {
            setIsCreativeLabSectionOpen((prev) => !prev);
            return;
          }
          setIsCreativeLabSectionOpen(true);
          setIsProductImagesSectionOpen(false);
          setActiveView(readLastCreativeLabView());
        }}
        onClick={() => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          if (active) {
            setIsCreativeLabSectionOpen((prev) => !prev);
            return;
          }
          setIsCreativeLabSectionOpen(true);
          setIsProductImagesSectionOpen(false);
          setActiveView(readLastCreativeLabView());
        }}
        title={(t as any).wb_nav_creative_lab || '创意实验室'}
        className={`wb-sidebar-nav-item group ${active ? 'wb-sidebar-nav-item--active' : 'wb-sidebar-nav-item--inactive'}`}
        aria-expanded={creativeSectionOpen}
        aria-controls="creative-lab-subnav"
      >
        <div className="wb-sidebar-nav-icon">
          <FlaskConical className={`w-5 h-5 ${active ? 'stroke-[2.5px]' : ''}`} />
        </div>
        <span className="wb-sidebar-nav-label">{(t as any).wb_nav_creative_lab || '创意实验室'}</span>
        {active && <div className="wb-sidebar-nav-indicator" />}
      </button>
    );
  };

  return (
    <aside className={`relative bg-zinc-950 border-r border-white/5 flex z-[300] shrink-0 ${collapsed ? 'wb-sidebar--collapsed' : ''}`}>
      <div className={`${collapsed ? 'w-16' : 'w-44'} flex flex-col items-stretch py-6 gap-6 shrink-0 transition-[width] duration-300 ease-out`}>
        <div className={`flex flex-col mb-2 gap-2 ${collapsed ? 'items-center px-0' : 'px-4'}`}>
          <div className={`flex h-10 w-full items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            <img
              src="/vflow-logo.svg"
              alt="VFlow"
              className="w-10 h-10 rounded-xl bg-white object-contain shadow-lg shadow-blue-500/20 shrink-0"
            />
            {!collapsed ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                disabled={!onToggleCollapse}
                title={language.startsWith('zh') ? '收回侧边栏' : 'Collapse sidebar'}
                aria-label={language.startsWith('zh') ? '收回侧边栏' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-colors disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:border-white/10"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : null}
          </div>
          {collapsed ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              disabled={!onToggleCollapse}
              title={language.startsWith('zh') ? '展开侧边栏' : 'Expand sidebar'}
              aria-label={language.startsWith('zh') ? '展开侧边栏' : 'Expand sidebar'}
              aria-expanded={!collapsed}
              className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition-colors disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:border-white/10"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-5 w-full">
          <nav className="wb-sidebar-nav-section" aria-label={creationGroupLabel}>
            <div className="wb-sidebar-nav-section-title">{creationGroupLabel}</div>
            <div className="flex flex-col gap-1 w-full">
              <ProductImagesNav />
              <InternalNav icon={MessageSquare} view="ai_creator" label={t.wb_nav_ai_creator || 'AI Creator'} />
              <InternalNav icon={UsersRound} view="community" label={(t as any).wb_nav_community || 'Community'} />
              <InternalNav icon={Video} view="workbench" label={t.wb_nav_workbench} />
              <InternalNav icon={Wand2} view="seed_skill_studio" label="Skill 视频" />
              <CreativeLabNav />
            </div>
          </nav>

          <nav className="wb-sidebar-nav-section" aria-label={personalGroupLabel}>
            <div className="wb-sidebar-nav-section-title">{personalGroupLabel}</div>
            <div className="flex flex-col gap-1 w-full">
              <InternalNav icon={activeView === 'assets' ? FolderOpen : Folder} view="assets" label={t.wb_nav_assets} />
              <InternalNav icon={History} view="history" label={t.wb_nav_history} />
              {isDebugModeEnabled && <InternalNav icon={Sparkles} view="agent" label={t.wb_nav_agent} />}
              <InternalNav icon={CreditCard} view="billing" label={t.wb_nav_billing || 'Billing'} />
            </div>
          </nav>
        </div>

        <div className="mt-auto pb-6 w-full flex flex-col gap-1">
          <button
            type="button"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              event.preventDefault();
              suppressNextClick();
              handleCycleTheme();
            }}
            onClick={() => {
              if (suppressNextClickRef.current) {
                suppressNextClickRef.current = false;
                return;
              }
              handleCycleTheme();
            }}
            title={themeButtonLabel}
            className="wb-sidebar-nav-item group wb-sidebar-nav-item--inactive"
          >
            <div className="wb-sidebar-nav-icon">
              <SunMoon className="w-5 h-5" />
            </div>
            <span className="wb-sidebar-nav-label">{themeButtonLabel}</span>
          </button>

          <button
            type="button"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              event.preventDefault();
              suppressNextClick();
              if (!user) {
                navigate('/login?returnUrl=/app');
                return;
              }
              navigateToView('profile');
            }}
            onClick={() => {
              if (suppressNextClickRef.current) {
                suppressNextClickRef.current = false;
                return;
              }
              if (!user) {
                navigate('/login?returnUrl=/app');
                return;
              }
              navigateToView('profile');
            }}
            title={!user ? ((t as any).guest_login_button || 'Log In') : t.profile_title}
            className={`wb-sidebar-nav-item group ${user && activeView === 'profile' ? 'wb-sidebar-nav-item--active' : 'wb-sidebar-nav-item--inactive'}`}
          >
            <div className="wb-sidebar-nav-icon">
              {!user ? (
                <LogIn className="w-5 h-5" />
              ) : user.avatar ? (
                <img src={user.avatar} className="w-5 h-5 rounded-md object-cover" alt="Profile" />
              ) : (
                <UserIcon className="w-5 h-5" />
              )}
            </div>
            <span className="wb-sidebar-nav-label">{!user ? ((t as any).guest_login_button || 'Log In') : t.profile_title}</span>
            {user && activeView === 'profile' && <div className="wb-sidebar-nav-indicator" />}
          </button>
        </div>
      </div>

      <div
        id="product-images-subnav"
        className={`shrink-0 overflow-hidden bg-zinc-960/100 transition-[width,opacity,border-color] ${
          productSectionOpen
            ? 'border-l border-white/5 opacity-100 pointer-events-auto'
            : 'border-l border-transparent opacity-0 pointer-events-none'
        }`}
        style={{
          width: productSectionOpen ? `${productImagesSubnavWidth}px` : '0rem',
          transitionDuration: `${PRODUCT_IMAGES_SECTION_ANIMATION_MS}ms`,
          transitionTimingFunction: PRODUCT_IMAGES_SECTION_EASING,
        }}
        aria-hidden={!productSectionOpen}
      >
        <div
          className="px-3 py-6"
          style={{ width: `${productImagesSubnavWidth}px` }}
        >
          <div
            className={`flex flex-col gap-1 transition-opacity ${
              productSectionOpen
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
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse' && event.button !== 0) return;
                    event.preventDefault();
                    suppressNextClick();
                    setIsCreativeLabSectionOpen(false);
                    try {
                      if (opt.view === 'product_images_gallery') {
                        window.sessionStorage.setItem(PRODUCT_GALLERY_GUIDE_TRIGGER_KEY, '1');
                      } else {
                        window.sessionStorage.removeItem(PRODUCT_GALLERY_GUIDE_TRIGGER_KEY);
                      }
                    } catch {
                      // ignore storage write failures
                    }
                    setActiveView(opt.view);
                  }}
                  onClick={() => {
                    if (suppressNextClickRef.current) {
                      suppressNextClickRef.current = false;
                      return;
                    }
                    setIsCreativeLabSectionOpen(false);
                    try {
                      if (opt.view === 'product_images_gallery') {
                        window.sessionStorage.setItem(PRODUCT_GALLERY_GUIDE_TRIGGER_KEY, '1');
                      } else {
                        window.sessionStorage.removeItem(PRODUCT_GALLERY_GUIDE_TRIGGER_KEY);
                      }
                    } catch {
                      // ignore storage write failures
                    }
                    setActiveView(opt.view);
                  }}
                  className={`wb-product-subnav-item relative h-12 w-full rounded-xl flex items-center px-5 text-left text-sm font-bold transition group ${
                    selected
                      ? 'wb-product-subnav-item--active text-violet-300 bg-violet-500/10'
                      : 'wb-product-subnav-item--inactive text-zinc-500 hover:text-violet-300'
                  }`}
                  role="menuitem"
                  aria-current={selected ? 'page' : undefined}
                  tabIndex={productSectionOpen ? 0 : -1}
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

      <div
        id="creative-lab-subnav"
        className={`shrink-0 overflow-hidden bg-zinc-950/70 transition-[width,opacity,border-color] ${
          creativeSectionOpen
            ? 'border-l border-white/5 opacity-100 pointer-events-auto'
            : 'border-l border-transparent opacity-0 pointer-events-none'
        }`}
        style={{
          width: creativeSectionOpen ? `${productImagesSubnavWidth}px` : '0rem',
          transitionDuration: `${PRODUCT_IMAGES_SECTION_ANIMATION_MS}ms`,
          transitionTimingFunction: PRODUCT_IMAGES_SECTION_EASING,
        }}
        aria-hidden={!creativeSectionOpen}
      >
        <div className="px-3 py-6" style={{ width: `${productImagesSubnavWidth}px` }}>
          <div
            className={`flex flex-col gap-1 transition-opacity ${
              creativeSectionOpen ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transitionDuration: `${PRODUCT_IMAGES_SECTION_ANIMATION_MS}ms`,
              transitionTimingFunction: PRODUCT_IMAGES_SECTION_EASING,
            }}
            role="menu"
            aria-label={(t as any).wb_nav_creative_lab || '创意实验室'}
          >
            {creativeLabOptions.map((opt) => {
              const selected = activeView === opt.view;
              const ItemIcon = opt.icon;
              return (
                <button
                  key={opt.view}
                  type="button"
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse' && event.button !== 0) return;
                    event.preventDefault();
                    suppressNextClick();
                    setIsProductImagesSectionOpen(false);
                    setActiveView(opt.view);
                  }}
                  onClick={() => {
                    if (suppressNextClickRef.current) {
                      suppressNextClickRef.current = false;
                      return;
                    }
                    setIsProductImagesSectionOpen(false);
                    setActiveView(opt.view);
                  }}
                  className={`wb-product-subnav-item relative h-12 w-full rounded-xl flex items-center px-4 pl-9 text-left text-sm font-bold transition group ${opt.disabled ? 'opacity-40 ' : ''}${
                    selected
                      ? 'wb-product-subnav-item--active text-orange-300 bg-orange-500/10'
                      : 'wb-product-subnav-item--inactive text-zinc-500 hover:text-orange-300'
                  }`}
                  role="menuitem"
                  aria-current={selected ? 'page' : undefined}
                  tabIndex={creativeSectionOpen ? 0 : -1}
                >
                  <ItemIcon className={`mr-3 h-4 w-4 shrink-0 ${selected ? 'text-orange-300' : 'text-zinc-400 group-hover:text-orange-300'}`} />
                  {selected ? <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-orange-400" /> : null}
                  <span className="whitespace-nowrap">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
};
