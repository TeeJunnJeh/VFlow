import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { 
  Video, History, FolderOpen, Wand2, Sparkles, 
  Settings2, ChevronRight, LayoutTemplate, Zap, LogOut
} from 'lucide-react';

// --- NEW IMPORTS ---
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/Login';

// --- 1. Modern Sidebar (Updated with Auth Data) ---
const Sidebar = () => {
  const { user, logout } = useAuth(); // Get real user data

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 border-r border-white/5 bg-slate-950/50 backdrop-blur-xl flex flex-col z-50">
      <div className="p-6 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            AI Studio
          </h1>
        </div>
        <p className="text-xs text-slate-500 font-medium pl-10">PRO VERSION</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {[
          { path: '/', icon: <Video size={20} />, label: 'Generate' },
          { path: '/history', icon: <History size={20} />, label: 'History' },
          { path: '/assets', icon: <FolderOpen size={20} />, label: 'Assets' },
        ].map((item) => (
          <NavLink 
            key={item.path}
            to={item.path} 
            className={({ isActive }) => `
              flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group
              ${isActive 
                ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20 shadow-[0_0_20px_rgba(139,92,246,0.1)]' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'}
            `}
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
            {/* Subtle glow on hover */}
            <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight size={16} />
            </div>
          </NavLink>
        ))}
      </nav>
      
      {/* User Profile Section (Dynamic) */}
      <div className="p-4 border-t border-white/5">
        <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5 flex items-center gap-3 mb-2">
          {/* Use the dynamic avatar from AuthContext */}
          <img 
            src={user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=fallback"} 
            alt="User" 
            className="w-9 h-9 rounded-full bg-slate-700 border border-white/10" 
          />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name || "User"}</p>
            <p className="text-slate-500 text-xs truncate capitalize">{user?.plan || "Free"} Plan</p>
          </div>
        </div>
        
        {/* Logout Button */}
        <button 
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 p-2 text-xs text-slate-500 hover:text-red-400 transition-colors"
        >
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </aside>
  );
};

// --- 2. Advanced Settings Components ---
const SettingCard = ({ icon, label, value, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 w-full
      ${active 
        ? 'bg-violet-500/20 border-violet-500/50 text-white shadow-lg shadow-violet-500/10' 
        : 'bg-slate-900/50 border-white/5 text-slate-400 hover:bg-slate-800 hover:border-white/10'}
    `}
  >
    <div className={`mb-2 ${active ? 'text-violet-400' : 'text-slate-500'}`}>{icon}</div>
    <span className="text-xs font-medium">{label}</span>
    <span className="text-[10px] opacity-60 mt-1">{value}</span>
  </button>
);

// --- 3. Pro Generate Page ---
const GeneratePage = () => {
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ratio, setRatio] = useState('16:9');
  const [style, setStyle] = useState('Realistic');

  // "Inspiration Chips" to help users start
  const suggestions = [
    "Cyberpunk city with neon rain",
    "Peaceful zen garden, 4k",
    "Futuristic space station interior"
  ];

  const handleGenerate = () => {
    if (!prompt) return;
    setIsProcessing(true);
    setTimeout(() => { setIsProcessing(false); alert('Video Generated!'); }, 2000);
  };

  return (
    <div className="max-w-5xl mx-auto py-12 px-8">
      {/* Header */}
      <div className="mb-10 text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-2">
          <Zap size={14} fill="currentColor" />
          <span>New AI Model V2.0 Available</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
          What do you want to <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">create</span> today?
        </h2>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Transform your text into cinematic videos in seconds.
        </p>
      </div>

      {/* Main Creation Card */}
      <div className="relative group">
        {/* Glow effect behind the card */}
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
        
        <div className="relative bg-slate-950/80 backdrop-blur-xl border border-white/10 rounded-2xl p-1 overflow-hidden">
          
          {/* Input Area */}
          <div className="p-6 md:p-8">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-4">
              <Sparkles size={16} className="text-violet-400" />
              <span>Enter your prompt</span>
            </label>
            
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your imagination here..."
              className="w-full h-32 bg-transparent text-lg text-white placeholder-slate-600 border-none outline-none resize-none focus:ring-0"
            />

            {/* Suggestions */}
            <div className="flex flex-wrap gap-2 mt-4 mb-6">
              {suggestions.map((s) => (
                <button 
                  key={s} 
                  onClick={() => setPrompt(s)}
                  className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-6" />

            {/* Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Aspect Ratio Selector */}
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Aspect Ratio</span>
                <div className="grid grid-cols-3 gap-3">
                  <SettingCard 
                    active={ratio === '16:9'} 
                    onClick={() => setRatio('16:9')}
                    icon={<LayoutTemplate size={18} />} 
                    label="Landscape" 
                    value="16:9" 
                  />
                  <SettingCard 
                    active={ratio === '9:16'} 
                    onClick={() => setRatio('9:16')}
                    icon={<div className="h-4 w-2.5 border-2 border-current rounded-sm" />} 
                    label="Mobile" 
                    value="9:16" 
                  />
                  <SettingCard 
                    active={ratio === '1:1'} 
                    onClick={() => setRatio('1:1')}
                    icon={<div className="h-4 w-4 border-2 border-current rounded-sm" />} 
                    label="Square" 
                    value="1:1" 
                  />
                </div>
              </div>

              {/* Action Area */}
              <div className="flex flex-col justify-end">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-slate-500">Estimated cost: 5 credits</span>
                  <button className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300">
                    <Settings2 size={14} /> Advanced Settings
                  </button>
                </div>
                
                <button
                  onClick={handleGenerate}
                  disabled={!prompt || isProcessing}
                  className={`
                    group relative w-full py-4 rounded-xl font-bold text-lg shadow-xl overflow-hidden transition-all
                    ${!prompt 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:scale-[1.02] hover:shadow-violet-500/25 text-white'}
                  `}
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  <div className="relative flex items-center justify-center gap-2">
                    {isProcessing ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <Wand2 className="w-5 h-5" />
                        Generate Video
                      </>
                    )}
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

// --- 4. Protected Layout Wrapper (NEW) ---
// This ensures that Sidebar + Main Content ONLY show if you are logged in
const ProtectedLayout = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-violet-500"><div className="animate-spin">Loading...</div></div>;
  }

  if (!user) {
    // If not logged in, kick them to the login page
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen text-slate-100 font-sans selection:bg-violet-500/30">
      <Sidebar />
      <main className="flex-1 ml-64 overflow-y-auto h-screen custom-scrollbar relative">
         {/* Background decorative blobs */}
         <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[20%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[100px]" />
        </div>

        <Routes>
          <Route path="/" element={<GeneratePage />} />
          <Route path="/history" element={<div className="p-10 text-slate-500">History Placeholder</div>} />
          <Route path="/assets" element={<div className="p-10 text-slate-500">Assets Placeholder</div>} />
        </Routes>
      </main>
    </div>
  );
};

// --- 5. Main App Layout (Updated with Routing) ---
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<LoginPage />} />
          
          {/* Protected Routes (Everything else) */}
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;