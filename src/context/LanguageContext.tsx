import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../i18n/translations';

// 1. Define Valid Language Types
type Language = 'en' | 'zh' | 'ms' | 'vi' | 'ko';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations['en']; // Use English structure for type hints
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  // 2. Load from LocalStorage or default to 'en'
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    // Simple validation to ensure saved lang is valid
    if (saved && ['en', 'zh', 'ms', 'vi', 'ko'].includes(saved)) {
      return saved as Language;
    }
    return 'en';
  });

  // 3. Save change to LocalStorage
  useEffect(() => {
    localStorage.setItem('app_language', language);
  }, [language]);

  const value = {
    language,
    setLanguage,
    t: { ...(translations['en'] as any), ...((translations as any)[language] || {}) } as typeof translations['en'] // Fallback per-key to EN
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};
