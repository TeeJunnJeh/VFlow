import React, { useEffect, useState } from 'react';
import { Play, Repeat, Trash2, Loader2, Maximize2 } from 'lucide-react';
import { api } from '../services/api';
import { VideoTask } from '../types';
import { useNavigate } from 'react-router-dom';

const HistoryPage = () => {
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      const data = await api.getHistory();
      setTasks(data);
      setLoading(false);
    };
    loadData();
  }, []);

  const handleReuse = (prompt: string) => {
    navigate('/', { state: { prompt } });
  };

  if (loading) return <HistorySkeleton />;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-white mb-6">Generation History</h2>
      
      {tasks.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p>No videos generated yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {tasks.map((task) => (
            <div key={task.id} className="group bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-slate-500 transition-all shadow-sm hover:shadow-xl">
              {/* Thumbnail Area */}
              <div className="relative aspect-video bg-slate-900">
                <img src={task.thumbnailUrl} alt="Video thumbnail" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                
                {/* Status Overlay */}
                {task.status === 'processing' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2 text-blue-400">
                      <Loader2 className="animate-spin" size={24} />
                      <span className="text-xs font-medium uppercase tracking-wider">Processing</span>
                    </div>
                  </div>
                )}

                {/* Hover Actions (Only if completed) */}
                {task.status === 'completed' && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-transform hover:scale-110">
                      <Play size={20} fill="currentColor" />
                    </button>
                    <button className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-transform hover:scale-110">
                      <Maximize2 size={20} />
                    </button>
                  </div>
                )}
                
                <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-xs text-white font-mono">
                  {task.duration}s
                </div>
              </div>

              {/* Info Area */}
              <div className="p-4">
                <p className="text-sm text-slate-300 line-clamp-2 h-10 mb-3" title={task.prompt}>
                  {task.prompt}
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                  <span className="text-xs text-slate-500">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleReuse(task.prompt)}
                      className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors" 
                      title="Reuse Prompt"
                    >
                      <Repeat size={16} />
                    </button>
                    <button className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Simple Skeleton Loader Component for internal use
const HistorySkeleton = () => (
  <div className="p-8">
    <div className="h-8 w-48 bg-slate-800 rounded mb-6 animate-pulse" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1, 2, 3].map(i => (
        <div key={i} className="aspect-video bg-slate-800 rounded-xl animate-pulse" />
      ))}
    </div>
  </div>
);

export default HistoryPage;