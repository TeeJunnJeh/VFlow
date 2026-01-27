import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { 
  Video, History, FolderOpen, Wand2, Sparkles, 
  Settings2, ChevronRight, LayoutTemplate, Zap, LogOut
} from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { LanguageSwitcher } from './components/common/LanguageSwitcher';
import LoginPage from './pages/Login';
import LandingPage from './pages/Landing'; // Import the new page

// --- 1. Sidebar (Same as before) ---
const Sidebar = () => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 border-r border-white/5 bg-slate-950/50 backdrop-blur-xl flex flex-col z-50">
      <div className="p-6 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            {t.app_name}
          </h1>
        </div>
        <p className="text-xs text-slate-500 font-medium pl-10">{t.pro_version}</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {/* Note: Updated paths to be relative or absolute to /app */}
        <NavLink to="/app" end className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${isActive ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
          <Video size={20} /> <span className="font-medium">{t.nav_generate}</span>
        </NavLink>
        <NavLink to="/app/history" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${isActive ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
          <History size={20} /> <span className="font-medium">{t.nav_history}</span>
        </NavLink>
        <NavLink to="/app/assets" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${isActive ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
          <FolderOpen size={20} /> <span className="font-medium">{t.nav_assets}</span>
        </NavLink>
      </nav>
      
      <div className="p-4 border-t border-white/5">
        <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5 flex items-center gap-3 mb-2">
          <img src={user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=fallback"} alt="User" className="w-9 h-9 rounded-full bg-slate-700 border border-white/10" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name || "User"}</p>
            <p className="text-slate-500 text-xs truncate capitalize">
              {user?.plan === 'pro' ? t.plan_pro : t.plan_free}
            </p>
          </div>
        </div>
        <button onClick={logout} className="w-full flex items-center justify-center gap-2 p-2 text-xs text-slate-500 hover:text-red-400 transition-colors">
          <LogOut size={14} /> {t.sign_out}
        </button>
      </div>
    </aside>
  );
};

// --- 2. Components (SettingCard, GeneratePage) ---
// [Keep your existing SettingCard and GeneratePage components exactly as they were]
// For brevity, I am assuming they are here. 
// Just ensure GeneratePage uses "absolute top-6 right-8" for the LanguageSwitcher if needed, 
// OR remove the switcher from GeneratePage if you prefer it only on the Sidebar/Landing.
// Below I included GeneratePage for completeness:

const SettingCard = ({ icon, label, value, active, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 w-full ${active ? 'bg-violet-500/20 border-violet-500/50 text-white shadow-lg shadow-violet-500/10' : 'bg-slate-900/50 border-white/5 text-slate-400 hover:bg-slate-800 hover:border-white/10'}`}>
    <div className={`mb-2 ${active ? 'text-violet-400' : 'text-slate-500'}`}>{icon}</div>
    <span className="text-xs font-medium">{label}</span>
    <span className="text-[10px] opacity-60 mt-1">{value}</span>
  </button>
);

const GeneratePage = () => {
  const { t } = useLanguage(); 
  const [prompt, setPrompt] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [ratio, setRatio] = React.useState('16:9');

  const handleGenerate = () => {
    if (!prompt) return;
    setIsProcessing(true);
    setTimeout(() => { setIsProcessing(false); alert('Video Generated!'); }, 2000);
  };

  return (
    <div className="max-w-5xl mx-auto py-12 px-8 relative">
      <div className="absolute top-6 right-8">
        <LanguageSwitcher />
      </div>

      <div className="mb-10 text-center space-y-4 pt-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-2">
          <Zap size={14} fill="currentColor" />
          <span>{t.new_model_available}</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
          {t.header_title_prefix} <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">{t.header_title_highlight}</span> {t.header_title_suffix}
        </h2>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">{t.header_subtitle}</p>
      </div>

      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
        <div className="relative bg-slate-950/80 backdrop-blur-xl border border-white/10 rounded-2xl p-1 overflow-hidden">
          <div className="p-6 md:p-8">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-4">
              <Sparkles size={16} className="text-violet-400" />
              <span>{t.enter_prompt}</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t.prompt_placeholder}
              className="w-full h-32 bg-transparent text-lg text-white placeholder-slate-600 border-none outline-none resize-none focus:ring-0"
            />
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-6" />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">{t.aspect_ratio}</span>
                <div className="grid grid-cols-3 gap-3">
                  <SettingCard active={ratio === '16:9'} onClick={() => setRatio('16:9')} icon={<LayoutTemplate size={18} />} label={t.landscape} value="16:9" />
                  <SettingCard active={ratio === '9:16'} onClick={() => setRatio('9:16')} icon={<div className="h-4 w-2.5 border-2 border-current rounded-sm" />} label={t.mobile} value="9:16" />
                  <SettingCard active={ratio === '1:1'} onClick={() => setRatio('1:1')} icon={<div className="h-4 w-4 border-2 border-current rounded-sm" />} label={t.square} value="1:1" />
                </div>
              </div>

              <div className="flex flex-col justify-end">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-slate-500">{t.est_cost}</span>
                  <button className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300">
                    <Settings2 size={14} /> {t.advanced_settings}
                  </button>
                </div>
                <button onClick={handleGenerate} disabled={!prompt || isProcessing} className={`group relative w-full py-4 rounded-xl font-bold text-lg shadow-xl overflow-hidden transition-all ${!prompt ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:scale-[1.02] hover:shadow-violet-500/25 text-white'}`}>
                  <div className="relative flex items-center justify-center gap-2">
                    {isProcessing ? t.btn_processing : <><Wand2 className="w-5 h-5" /> {t.btn_generate}</>}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 3. Protected Layout (Wraps the App Dashboard) ---
const ProtectedLayout = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-violet-500">Loading...</div>;
  }

  if (!user) {
    // If trying to access /app without logging in, go to login
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen text-slate-100 font-sans selection:bg-violet-500/30">
      <Sidebar />
      <main className="flex-1 ml-64 overflow-y-auto h-screen custom-scrollbar relative">
         <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[20%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[100px]" />
        </div>
        <Routes>
          {/* Note: Paths here are relative to /app */}
          <Route path="/" element={<GeneratePage />} />
          <Route path="/history" element={<div className="p-10 text-slate-500">History</div>} />
          <Route path="/assets" element={<div className="p-10 text-slate-500">Assets</div>} />
        </Routes>
      </main>
    </div>
  );
};

// --- 4. Main App Routing ---
function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            {/* Route 1: Landing Page (Default) */}
            <Route path="/" element={<LandingPage />} />
            
            {/* Route 2: Login Page */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* Route 3: Protected App Dashboard */}
            {/* The /* allows nested routes inside ProtectedLayout to work */}
            <Route path="/app/*" element={<ProtectedLayout />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;