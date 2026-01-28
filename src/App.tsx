import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import LoginPage from './pages/Login';
import LandingPage from './pages/Landing';
import Workbench from './pages/Workbench';

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
                {/* 首页 */}
                <Route path="/" element={<LandingPage />} />

                {/* 登录页 */}
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
            <LanguageProvider>
                <BrowserRouter basename="/VFlow">
                    <AnimatedRoutes />
                </BrowserRouter>
            </LanguageProvider>
        </AuthProvider>
    );
}

export default App;