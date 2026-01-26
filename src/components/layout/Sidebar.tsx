import React from 'react';
import { NavLink } from 'react-router-dom';
import { Video, History, FolderOpen, Settings } from 'lucide-react';

const Sidebar = () => {
  const navItems = [
    { name: 'Generate', path: '/', icon: <Video size={20} /> },
    { name: 'History', path: '/history', icon: <History size={20} /> },
    { name: 'Assets', path: '/assets', icon: <FolderOpen size={20} /> },
  ];

  return (
    <aside className="w-64 h-screen bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          AI Studio
        </h1>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' 
                  : 'hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            {item.icon}
            <span className="font-medium">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button className="flex items-center gap-3 px-4 py-2 w-full text-slate-400 hover:text-white transition-colors">
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;