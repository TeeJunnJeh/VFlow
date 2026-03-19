import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { tiktokApi } from './services/tiktok';
import { AnimatePresence } from 'framer-motion';
import { AppDialog } from './components/common/AppDialog';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider } from './context/TaskContext';
import { LanguageProvider } from './context/LanguageContext';
import LoginPage from './pages/Login';
import LandingPage from './pages/Landing';
import Workbench from './pages/Workbench';
import TermsOfServicePage from './pages/TermsOfService';
import PrivacyPolicyPage from './pages/PrivacyPolicy';
import { debugLog, debugError } from './services/debugMode';

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

    // 1. 修复：必须将 useState 移到 useEffect 之前，防止 ReferenceError
    const [isInfoOpen, setIsInfoOpen] = React.useState(false);
    const [infoTitle, setInfoTitle] = React.useState('');
    const [infoMessage, setInfoMessage] = React.useState<string | null>(null);

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
                    throw new Error(errorDescription || error || '授权被拒绝');
                }
                if (!code || !state) {
                    throw new Error('授权参数不完整');
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
                    setInfoTitle('Success');
                    setInfoMessage(String(result.message));
                    setIsInfoOpen(true);
                } else {
                    setInfoTitle('Success');
                    setInfoMessage('TikTok 授权成功，视频已上传到草稿箱');
                    setIsInfoOpen(true);
                }
            } catch (err: any) {
                debugError('[TikTok OAuth] Error:', err);
                setInfoTitle('Error');
                setInfoMessage(`TikTok 授权失败：${err?.message || '未知错误'}`);
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
                    title={infoTitle || 'Notice'}
                    onClose={() => setIsInfoOpen(false)}
                    footer={
                        <>
                            <button
                                className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
                                onClick={() => setIsInfoOpen(false)}
                            >
                                OK
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
        </LanguageProvider>
    );
}

export default App;