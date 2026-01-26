import React, { useState } from 'react';
import { Wand2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../services/api';
import { useLocation } from 'react-router-dom';

const GeneratePage = () => {
  // Check if we are reusing a prompt from history
  const location = useLocation();
  const initialPrompt = location.state?.prompt || '';

  const [prompt, setPrompt] = useState(initialPrompt);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState({ duration: 5, ratio: '16:9', style: 'realistic' });

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsProcessing(true);
    try {
      await api.generateVideo(prompt, options);
      // In a real app, you'd probably redirect to history or show a success toast here
      setPrompt(''); 
      alert('Task started successfully!');
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Create New Video</h2>
        <p className="text-slate-400">Describe your vision and let AI bring it to life.</p>
      </header>

      {/* Main Input Area */}
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl backdrop-blur-sm">
        <label className="block text-sm font-medium text-slate-300 mb-2">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A cyberpunk street at night, neon rain, 4k cinematic lighting..."
          className="w-full h-40 bg-slate-900 border border-slate-700 rounded-xl p-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none transition-all"
        />

        {/* Advanced Options Toggle */}
        <div className="mt-4">
          <button 
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center text-sm text-slate-400 hover:text-white transition-colors"
          >
            {showOptions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span className="ml-1">Advanced Settings</span>
          </button>

          {showOptions && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Aspect Ratio</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500"
                  value={options.ratio}
                  onChange={(e) => setOptions({...options, ratio: e.target.value})}
                >
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="9:16">9:16 (Vertical)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Duration</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  value={options.duration}
                  onChange={(e) => setOptions({...options, duration: Number(e.target.value)})}
                >
                  <option value={5}>5 Seconds</option>
                  <option value={10}>10 Seconds</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Style Preset</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  value={options.style}
                  onChange={(e) => setOptions({...options, style: e.target.value})}
                >
                  <option value="realistic">Hyper Realistic</option>
                  <option value="anime">Anime Style</option>
                  <option value="3d">3D Render</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={isProcessing || !prompt}
            className={`
              flex items-center gap-2 px-8 py-3 rounded-full font-semibold transition-all duration-300
              ${isProcessing || !prompt 
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg hover:shadow-blue-500/25'}
            `}
          >
            {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
            <span>{isProcessing ? 'Dreaming...' : 'Generate Video'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeneratePage;