/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

type ThemeContextType = {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
};

const STORAGE_KEY = 'vflow_theme_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const normalizeTheme = (value: string | null): ThemeMode => {
    if (value === 'light') return 'light';
    if (value === 'dark') return 'dark';
    return 'system'; // 默认跟随系统
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [theme, setTheme] = useState<ThemeMode>(() => normalizeTheme(localStorage.getItem(STORAGE_KEY)));

    useEffect(() => {
        // 1. 保存到本地缓存
        localStorage.setItem(STORAGE_KEY, theme);

        // 2. 动态向 HTML 根节点注入 Tailwind 需要的 class
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');

        if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.classList.add(systemTheme);
        } else {
            root.classList.add(theme);
        }
    }, [theme]);

    const value = useMemo(() => ({ theme, setTheme }), [theme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within a ThemeProvider');
    return context;
};