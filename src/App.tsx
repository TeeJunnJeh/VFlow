import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { tiktokApi } from './services/tiktok';
import { AnimatePresence } from 'framer-motion';
import { AppDialog } from './components/common/AppDialog';
import { LanguageSwitcher } from './components/common/LanguageSwitcher';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider } from './context/TaskContext';
import { LanguageProvider } from './context/LanguageContext';
import { useLanguage } from './context/LanguageContext';
import LoginPage from './pages/Login';
import LandingPage from './pages/Landing';
import Workbench from './pages/Workbench';
import TermsOfServicePage from './pages/TermsOfService';
import PrivacyPolicyPage from './pages/PrivacyPolicy';
import { debugLog, debugError } from './services/debugMode';

const MobileBlockedApp = () => {
    const { t } = useLanguage();
    const [isMobileBlocked, setIsMobileBlocked] = React.useState(false);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const media = window.matchMedia('(max-width: 768px)');
        const coarsePointerMedia = window.matchMedia('(pointer: coarse)');
        const sync = () => {
            const ua = navigator.userAgent || '';
            const isMobileUa = /Android|iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
            const viewportWidth = window.visualViewport?.width || window.innerWidth || 0;
            setIsMobileBlocked(Boolean(
                media.matches
                || isMobileUa
                || (coarsePointerMedia.matches && viewportWidth <= 1024)
            ));
        };
        sync();
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', sync);
            coarsePointerMedia.addEventListener('change', sync);
            window.addEventListener('resize', sync);
            return () => {
                media.removeEventListener('change', sync);
                coarsePointerMedia.removeEventListener('change', sync);
                window.removeEventListener('resize', sync);
            };
        }
        media.addListener(sync);
        coarsePointerMedia.addListener(sync);
        window.addEventListener('resize', sync);
        return () => {
            media.removeListener(sync);
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
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center text-orange-500 font-mono tracking-widest">
                LOADING...
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
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

    // 1. 修复：必须将 useState 移到 useEffect 之前，防止 ReferenceError
    const [isInfoOpen, setIsInfoOpen] = React.useState(false);
    const [infoTitle, setInfoTitle] = React.useState('');
    const [infoMessage, setInfoMessage] = React.useState<string | null>(null);

    React.useEffect(() => {
        const parseErrorMessage = (value: unknown) => {
            if (value instanceof Error) return value.message || '未知错误';
            if (typeof value === 'string') return value;
            if (value && typeof value === 'object' && 'message' in (value as any)) {
                return String((value as any).message || '未知错误');
            }
            return '未知错误';
        };

        const onUnhandledRejection = (event: PromiseRejectionEvent) => {
            const msg = parseErrorMessage(event.reason);
            if (!msg) return;
            setInfoTitle(t.ui_dialog_error);
            setInfoMessage(`${t.app_error_unhandled}：${msg}`);
            setIsInfoOpen(true);
        };

        const onWindowError = (event: ErrorEvent) => {
            const msg = parseErrorMessage(event.error || event.message);
            if (!msg) return;
            setInfoTitle(t.ui_dialog_error);
            setInfoMessage(`${t.app_error_runtime}：${msg}`);
            setIsInfoOpen(true);
        };

        const onAppError = (event: Event) => {
            const custom = event as CustomEvent<{ title?: string; message?: string }>;
            const title = custom?.detail?.title || t.ui_dialog_error;
            const message = custom?.detail?.message || '发生未知错误';
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
    }, []);

    React.useEffect(() => {
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

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

                // 显示成功消息，告知用户视频已上传到哪个账号
                if (result?.message) {
                    setInfoTitle(t.ui_dialog_success);
                    setInfoMessage(String(result.message));
                    setIsInfoOpen(true);
                } else {
                    setInfoTitle(t.ui_dialog_success);
                    setInfoMessage(t.app_tiktok_auth_success_default);
                    setIsInfoOpen(true);
                }
            } catch (err: any) {
                debugError('[TikTok OAuth] Error:', err);
                setInfoTitle(t.ui_dialog_error);
                setInfoMessage(`${t.app_tiktok_auth_failed}：${err?.message || '未知错误'}`);
                setIsInfoOpen(true);
            } finally {
                (window as any).__tiktok_callback_processing = false;
            }
        })();
    }, [location.pathname, location.search]);

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
                    <Route
                        path="/app/*"
                        element={
                            <ProtectedRoute>
                                <Workbench />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
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
