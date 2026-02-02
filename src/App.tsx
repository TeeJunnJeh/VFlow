import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider } from './context/TaskContext';
import { LanguageProvider } from './context/LanguageContext';
import LoginPage from './pages/Login';
import LandingPage from './pages/Landing';
import Workbench from './pages/Workbench';

/**
 * [新增] 访客路由封装 (GuestRoute)
 * 作用：限制已登录用户访问游客页面（如首页、登录页）
 * 逻辑：
 * 1. 等待 AuthContext 初始化 (isLoading)
 * 2. 如果已登录 (user 存在) -> 重定向到工作台 (/app)
 * 3. 如果未登录 -> 允许访问 (Landing/Login)
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

    return (
        /**
         * mode="wait":
         * 1. 当 navigate('/login') 被触发时，LandingPage 的 exit 动画开始。
         * 2. 只有当 LandingPage 完全卸载后，LoginPage 才会入场。
         * 3. 这配合 TransitionOverlay 的全屏闪光，可以实现无缝的视觉“白转暗”或“光影穿梭”感。
         */
        <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
                {/* 
                   首页：使用 GuestRoute 包裹。
                   效果：如果已登录访问首页，直接跳去 /app；未登录则显示首页。
                */}
                <Route 
                    path="/" 
                    element={
                        <GuestRoute>
                            <LandingPage />
                        </GuestRoute>
                    } 
                />

                {/* 
                   登录页：不使用 GuestRoute 包裹。
                   原因：我们需要在 Login 页面内部控制跳转时机，以免打断登录成功的动画。
                */}
                <Route path="/login" element={<LoginPage />} />

                {/* 受保护的工作台 */}
                <Route
                    path="/app/*"
                    element={
                        <ProtectedRoute>
                            <Workbench />
                        </ProtectedRoute>
                    }
                />

                {/* 兜底重定向 */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </AnimatePresence>
    );
};

function App() {
    return (
        <AuthProvider>
            <TaskProvider>
                <LanguageProvider>
                    <BrowserRouter>
                        <AnimatedRoutes />
                    </BrowserRouter>
                </LanguageProvider>
            </TaskProvider>
        </AuthProvider>
    );
}

export default App;
