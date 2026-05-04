import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { tiktokApi } from './services/tiktok';
import { ApiError } from './services/errors';
import { AnimatePresence } from 'framer-motion';
import { AppDialog } from './components/common/AppDialog';
import { LanguageSwitcher } from './components/common/LanguageSwitcher';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider } from './context/TaskContext';
import { LanguageProvider } from './context/LanguageContext';
import { useLanguage } from './context/LanguageContext';
import { ErrorModal } from './components/workbench/workflow/ErrorModal';
import { buildErrorModalData, type ErrorI18n, type ErrorModalData } from './utils/errorModalHelper';
import { setMetaDescription } from './utils/seo';
import LoginPage from './pages/Login';
import LandingPage from './pages/Landing';
import Workbench from './pages/Workbench';
import TermsOfServicePage from './pages/TermsOfService';
import PrivacyPolicyPage from './pages/PrivacyPolicy';
import HelpPage from './pages/Help';
import { debugLog, debugError } from './services/debugMode';
import {
    TIKTOK_AUTH_RESULT_STORAGE_KEY,
    broadcastTikTokAuthResult,
    emitTikTokAuthComplete,
    isTikTokAuthPopupWindow,
    parseTikTokAuthResult,
    type TikTokAuthResult,
} from './utils/tiktokAuthPopup';

const MobileBlockedApp = () => {
    const { t } = useLanguage();
    const [isMobileBlocked, setIsMobileBlocked] = React.useState(false);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const coarsePointerMedia = window.matchMedia('(pointer: coarse)');
        const sync = () => {
            const ua = navigator.userAgent || '';
            const isPhoneUa =
                /iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)
                || (/Android/i.test(ua) && /Mobile/i.test(ua));
            const viewportWidth = window.visualViewport?.width || window.innerWidth || 0;
            const screenShortSide = Math.min(window.screen.width || 0, window.screen.height || 0);
            const isTouchDevice = coarsePointerMedia.matches || (navigator.maxTouchPoints || 0) > 0;
            setIsMobileBlocked(Boolean(
                isPhoneUa
                || (isTouchDevice && viewportWidth <= 768 && screenShortSide <= 820)
            ));
        };
        sync();
        if (typeof coarsePointerMedia.addEventListener === 'function') {
            coarsePointerMedia.addEventListener('change', sync);
            window.addEventListener('resize', sync);
            return () => {
                coarsePointerMedia.removeEventListener('change', sync);
                window.removeEventListener('resize', sync);
            };
        }
        coarsePointerMedia.addListener(sync);
        window.addEventListener('resize', sync);
        return () => {
            coarsePointerMedia.removeListener(sync);
            window.removeEventListener('resize', sync);
        };
    }, []);

    if (isMobileBlocked) {
        return (
            <div className="relative min-h-screen flex items-center justify-center px-6 bg-[radial-gradient(circle_at_50%_0%,#2e1065_0%,#1e1b4b_42%,#3b0a45_100%)] text-white">
                <div className="absolute right-4 top-4 z-10">
                    <LanguageSwitcher />
                </div>
                <div className="w-full max-w-sm text-center">
                    <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-[28px] border border-white/20 bg-white/8 shadow-[0_20px_60px_rgba(15,23,42,0.35)] backdrop-blur-sm">
                        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-orange-400 to-violet-400" />
                    </div>
                    <div className="mb-6 text-5xl font-black italic tracking-tight text-violet-200">VFLOW AI</div>
                    <div className="text-xl font-bold text-white">{t.mobile_unsupported_title || '暂不支持手机端使用'}</div>
                    <div className="mt-3 text-sm leading-6 text-violet-100/80">{t.mobile_unsupported_desc || '请使用桌面端访问'}</div>
                </div>
            </div>
        );
    }

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/terms-of-service" element={<TermsOfServicePage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route
                    path="/*"
                    element={
                        <AuthProvider>
                            <TaskProvider>
                                <AnimatedRoutes />
                            </TaskProvider>
                        </AuthProvider>
                    }
                />
            </Routes>
        </BrowserRouter>
    );
};

/**
 * 访客路由封装 (GuestRoute)
 * 作用：限制已登录用户访问游客页面（如首页、登录页）
 */
const GuestRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isLoading } = useAuth();

    // 防止在检查 Session 时页面闪烁，显示与背景色一致的空状态
    if (isLoading) {
        return <div className="min-h-screen bg-[#050505]" />;
    }

    if (user) {
        // 已登录用户访问首页/登录页，直接跳到内部应用
        return <Navigate to="/app" replace />;
    }

    return <>{children}</>;
};

/**
 * 受保护路由封装
 * 确保只有登录用户可以访问工作台
 * 游客模式：允许未登录用户进入工作台，具体功能由各组件自行拦截
 */
const OptionalAuthRoute = ({ children }: { children: React.ReactNode }) => {
    const { isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center text-orange-500 font-mono tracking-widest">
                LOADING...
            </div>
        );
    }

    return <>{children}</>;
};

/**
 * 动画路由容器
 * 核心逻辑：使用 AnimatePresence 监听 location 变化
 */
const AnimatedRoutes = () => {
    const location = useLocation();
    const { t } = useLanguage();

    React.useEffect(() => {
        const pathname = location.pathname || '/';
        const base = 'VFLOW AI';
        let suffix = '';
        let desc = '';
        if (pathname === '/') suffix = '首页';
        else if (pathname === '/login') suffix = '登录';
        else if (pathname.startsWith('/app')) suffix = '工作台';
        const nextTitle = suffix ? `${base} - ${suffix}` : base;
        if (typeof document !== 'undefined' && document.title !== nextTitle) {
            document.title = nextTitle;
        }
        if (pathname === '/') {
            desc =
                'VFLOW AI helps ecommerce sellers and creators turn product links or images into TikTok/Reels videos, with templates, scenes, captions, and one-click export.';
        } else if (pathname === '/login') {
            desc =
                'Sign in to VFLOW AI to access your workspace, manage assets, generate product images and videos, review history, and control billing and settings securely.';
        } else if (pathname.startsWith('/app')) {
            desc =
                'Use the VFLOW AI workspace to generate product videos and images, manage assets and templates, monitor tasks in real time, and export results for publishing.';
        }
        if (desc) setMetaDescription(desc);
    }, [location.pathname]);

    // 1. 修复：必须将 useState 移到 useEffect 之前，防止 ReferenceError
    const [isInfoOpen, setIsInfoOpen] = React.useState(false);
    const [infoTitle, setInfoTitle] = React.useState('');
    const [infoMessage, setInfoMessage] = React.useState<string | null>(null);

    // ── ErrorModal 状态（统一异常处理） ──
    const [errorModalData, setErrorModalData] = React.useState<ErrorModalData | null>(null);
    const closeErrorModal = () => setErrorModalData(null);

    const errorI18n: ErrorI18n = {
      err_title_generation: t.err_title_generation,
      err_title_script: t.err_title_script,
      err_title_parse: t.err_title_parse,
      err_title_recognize: t.err_title_recognize,
      err_title_upload: t.err_title_upload,
      err_title_network: t.err_title_network,
      err_title_auth: t.err_title_auth,
      err_title_unknown: t.err_title_unknown,
      err_msg_generation: t.err_msg_generation,
      err_msg_script: t.err_msg_script,
      err_msg_parse: t.err_msg_parse,
      err_msg_recognize: t.err_msg_recognize,
      err_msg_upload: t.err_msg_upload,
      err_msg_network: t.err_msg_network,
      err_msg_auth: t.err_msg_auth,
      err_msg_unknown: t.err_msg_unknown,
      err_sug_retry: t.err_sug_retry,
      err_sug_check_network: t.err_sug_check_network,
      err_sug_check_params: t.err_sug_check_params,
      err_sug_relogin: t.err_sug_relogin,
      err_sug_contact_support: t.err_sug_contact_support,
      err_sug_try_later: t.err_sug_try_later,
      err_sug_manual_fill: t.err_sug_manual_fill,
      err_btn_retry: t.err_btn_retry,
      err_btn_feedback: t.err_btn_feedback,
    };

    /** 将 ApiError 或普通 Error 转为 ErrorModal 弹窗 */
    const openErrorModalFromError = React.useCallback((err: unknown) => {
      const data = buildErrorModalData({ error: err, i18n: errorI18n });
      setErrorModalData(data);
    }, [t]);

    const showTikTokAuthResult = React.useCallback((result: TikTokAuthResult) => {
        setInfoTitle(result.status === 'success' ? t.ui_dialog_success : t.ui_dialog_error);
        setInfoMessage(result.message || (result.status === 'success' ? t.app_tiktok_auth_success_default : t.app_tiktok_auth_failed));
        setIsInfoOpen(true);
        emitTikTokAuthComplete(result);
    }, [
        t.app_tiktok_auth_failed,
        t.app_tiktok_auth_success_default,
        t.ui_dialog_error,
        t.ui_dialog_success,
    ]);

    React.useEffect(() => {
        const onUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (event.reason instanceof ApiError) {
                openErrorModalFromError(event.reason);
                event.preventDefault();
                return;
            }
            // 非 ApiError 仍走旧的 AppDialog
            const msg = event.reason instanceof Error ? event.reason.message : String(event.reason || '未知错误');
            if (!msg) return;
            setInfoTitle(t.ui_dialog_error);
            setInfoMessage(`${t.app_error_unhandled}：${msg}`);
            setIsInfoOpen(true);
        };

        const onWindowError = (event: ErrorEvent) => {
            const raw = event.error || event.message;
            if (raw instanceof ApiError) {
                openErrorModalFromError(raw);
                event.preventDefault();
                return;
            }
            const msg = raw instanceof Error ? raw.message : String(raw || '未知错误');
            if (!msg) return;
            setInfoTitle(t.ui_dialog_error);
            setInfoMessage(`${t.app_error_runtime}：${msg}`);
            setIsInfoOpen(true);
        };

        const onAppError = (event: Event) => {
            const custom = event as CustomEvent<{ apiError?: ApiError; title?: string; message?: string }>;
            const detail = custom?.detail;

            // ── 新路径：TaskContext 派发的 ApiError ──
            if (detail?.apiError instanceof ApiError) {
                openErrorModalFromError(detail.apiError);
                return;
            }

            // ── 旧路径兼容：纯文本 title + message ──
            const title = detail?.title || t.ui_dialog_error;
            const message = detail?.message || '发生未知错误';
            setInfoTitle(title);
            setInfoMessage(message);
            setIsInfoOpen(true);
        };

        window.addEventListener('unhandledrejection', onUnhandledRejection);
        window.addEventListener('error', onWindowError);
        window.addEventListener('vflow-app-error', onAppError as EventListener);
        return () => {
            window.removeEventListener('unhandledrejection', onUnhandledRejection);
            window.removeEventListener('error', onWindowError);
            window.removeEventListener('vflow-app-error', onAppError as EventListener);
        };
    }, [openErrorModalFromError]);

    React.useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key !== TIKTOK_AUTH_RESULT_STORAGE_KEY) return;
            const result = parseTikTokAuthResult(event.newValue);
            if (!result) return;
            showTikTokAuthResult(result);
        };

        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [showTikTokAuthResult]);

    // 裂变：把 ?invite_code=XXXX 捕获到 sessionStorage，随后清掉 URL，
    // 避免刷新/分享时把邀请码暴露出去。登录/注册路径会从 sessionStorage 回读。
    React.useEffect(() => {
        const params = new URLSearchParams(location.search);
        const inviteCode = params.get('invite_code');
        if (!inviteCode) return;
        try {
            sessionStorage.setItem('vflow_pending_invite_code', inviteCode.trim());
        } catch (err) {
            debugError('[invite] failed to persist invite code:', err);
        }
        params.delete('invite_code');
        const nextSearch = params.toString();
        const nextUrl = nextSearch
            ? `${location.pathname}?${nextSearch}`
            : location.pathname;
        window.history.replaceState({}, document.title, nextUrl);
    }, [location.pathname, location.search]);

    React.useEffect(() => {
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        const errorDescription = params.get('error_description');
        const isPopupWindow = isTikTokAuthPopupWindow();

        // Only process if we have an OAuth callback (code or error present)
        if (!code && !error) return;

        // 防止重复处理 - 使用 ref 标记
        if ((window as any).__tiktok_callback_processing) {
            debugLog('[TikTok OAuth] Already processing callback, skipping...');
            return;
        }
        (window as any).__tiktok_callback_processing = true;

        // Log for debugging
        debugLog('[TikTok OAuth] Detected callback params:', { code: !!code, state: !!state, error });

        // 立即清除URL参数，防止多次触发
        window.history.replaceState({}, document.title, location.pathname);

        (async () => {
            try {
                // Validate required params before calling API
                if (error) {
                    throw new Error(errorDescription || error || t.app_tiktok_auth_rejected);
                }
                if (!code || !state) {
                    throw new Error(t.app_tiktok_auth_incomplete);
                }

                debugLog('[TikTok OAuth] Calling completeAuth...');
                const result = await tiktokApi.completeAuth({
                    code,
                    state,
                    error: error || undefined,
                    error_description: errorDescription || undefined,
                });
                debugLog('[TikTok OAuth] completeAuth success:', result);

                const payload: TikTokAuthResult = {
                    status: 'success',
                    message: result?.message ? String(result.message) : t.app_tiktok_auth_success_default,
                    ts: Date.now(),
                };

                if (isPopupWindow) {
                    broadcastTikTokAuthResult(payload);
                    window.setTimeout(() => window.close(), 80);
                    return;
                }

                showTikTokAuthResult(payload);
            } catch (err: any) {
                debugError('[TikTok OAuth] Error:', err);
                const payload: TikTokAuthResult = {
                    status: 'error',
                    message: `${t.app_tiktok_auth_failed}：${err?.message || '未知错误'}`,
                    ts: Date.now(),
                };

                if (isPopupWindow) {
                    broadcastTikTokAuthResult(payload);
                    window.setTimeout(() => window.close(), 80);
                    return;
                }

                showTikTokAuthResult(payload);
            } finally {
                (window as any).__tiktok_callback_processing = false;
            }
        })();
    }, [
        location.pathname,
        location.search,
        showTikTokAuthResult,
        t.app_tiktok_auth_failed,
        t.app_tiktok_auth_incomplete,
        t.app_tiktok_auth_rejected,
        t.app_tiktok_auth_success_default,
    ]);

    return (
        // 2. 修复：将 AppDialog 移出 AnimatePresence，并根据你的注释将 mode 改为 wait 以实现无缝光影穿梭动画
        <>
            <AnimatePresence mode="wait" initial={false}>
                <Routes location={location} key={location.pathname}>
                    <Route
                        path="/"
                        element={
                            <GuestRoute>
                                <LandingPage />
                            </GuestRoute>
                        }
                    />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/doc/*" element={<HelpPage />} />
                    <Route
                        path="/app/*"
                        element={
                            <OptionalAuthRoute>
                                <Workbench />
                            </OptionalAuthRoute>
                        }
                    />
                    <Route path="*" element={<Navigate to="/app" replace />} />
                </Routes>
            </AnimatePresence>

            {/* 弹窗独立渲染，避免阻断页面路由的 Exit 动画 */}
            {isInfoOpen && (
                <AppDialog
                    isOpen={isInfoOpen}
                    title={infoTitle || t.ui_dialog_notice}
                    onClose={() => setIsInfoOpen(false)}
                    footer={
                        <>
                            <button
                                className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
                                onClick={() => setIsInfoOpen(false)}
                            >
                                {t.ui_dialog_ok}
                            </button>
                        </>
                    }
                >
                    <div className="whitespace-pre-line text-sm text-zinc-300">{infoMessage}</div>
                </AppDialog>
            )}

            {/* 统一异常处理 ErrorModal（来自全局错误事件） */}
            {errorModalData && (
                <ErrorModal
                    isOpen={true}
                    onClose={closeErrorModal}
                    title={errorModalData.title}
                    code={errorModalData.code}
                    message={errorModalData.message}
                    details={errorModalData.details}
                    suggestions={errorModalData.suggestions}
                    actions={errorModalData.actions}
                />
            )}
        </>
    );
};

function App() {
    return (
        <LanguageProvider>
            <MobileBlockedApp />
        </LanguageProvider>
    );
}

export default App;
