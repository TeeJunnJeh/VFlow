import React, { useState, useEffect } from 'react';
import { LayoutTemplate, Image, Star, Plus } from 'lucide-react';
import { api } from '../services/api';
import { Asset } from '../types';
import { useNavigate } from 'react-router-dom';

const AssetsPage = () => {
  const [activeTab, setActiveTab] = useState<'template' | 'media'>('template');
  const [assets, setAssets] = useState<Asset[]>([]);
  const navigate = useNavigate();

  // Helper: Convert path to displayable URL
  const getDisplayUrl = (path: string | undefined): string => {
    if (!path) return 'https://via.placeholder.com/300x400?text=No+Image';
    // If it's already a full URL (http/https), use as-is
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    // If it's a relative path (/media/...), prepend API base URL
    if (path.startsWith('/')) {
      // In production, relative paths work directly with nginx
      // In development, use env variable or default to localhost
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
      return baseUrl ? `${baseUrl}${path}` : path;
    }
    // Otherwise (blob:..., data:...), use as-is
    return path;
  };

  useEffect(() => {
    setAssets([]); // Clear while loading new tab
    api.getAssets(activeTab).then(data => setAssets(data));
  }, [activeTab]);

  const handleUseAsset = (asset: Asset) => {
    // Navigate to workbench and pass the asset
    navigate('/app', { 
      state: { 
        selectedAsset: asset,
        fromAssetLibrary: true
      } 
    });
  };

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Asset Library</h2>
          <p className="text-slate-400 text-sm">Manage templates and uploaded media.</p>
        </div>
        <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-700 transition-colors">
          <Plus size={18} />
          <span>Upload Asset</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 mb-6">
        <TabButton 
          active={activeTab === 'template'} 
          onClick={() => setActiveTab('template')} 
          icon={<LayoutTemplate size={18} />} 
          label="Templates" 
        />
        <TabButton 
          active={activeTab === 'media'} 
          onClick={() => setActiveTab('media')} 
          icon={<Image size={18} />} 
          label="Media Assets" 
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {assets.map((asset) => (
          <div key={asset.id} className="group relative bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-slate-500 transition-all">
            <div className="aspect-square bg-slate-900 overflow-hidden">
              <img src={getDisplayUrl(asset.previewUrl)} alt={asset.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x400?text=Error'; }} />
              
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4">
                <button 
                  onClick={() => handleUseAsset(asset)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium mb-2 w-full"
                >
                  Use This
                </button>
              </div>

              <button className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md ${asset.isFavorite ? 'text-yellow-400 bg-black/40' : 'text-slate-300 bg-black/20 hover:text-white'}`}>
                <Star size={14} fill={asset.isFavorite ? "currentColor" : "none"} />
              </button>
            </div>
            
            <div className="p-3">
              <h3 className="font-medium text-slate-200 text-sm truncate">{asset.name}</h3>
              <div className="flex gap-1 mt-2 flex-wrap">
                {asset.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-colors ${
      active 
        ? 'border-blue-500 text-blue-400' 
        : 'border-transparent text-slate-400 hover:text-slate-200'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

export default AssetsPage;