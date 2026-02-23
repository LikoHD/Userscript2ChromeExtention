import { Zap, FileCode2, History, Settings } from 'lucide-react';

export function Sidebar() {
  return (
    <div className="flex flex-col w-12 bg-gray-950 border-r border-white/5 shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center justify-center h-14 border-b border-white/5">
        <div className="h-7 w-7 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
          <Zap className="h-3.5 w-3.5 text-white" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col items-center gap-1 p-1.5 flex-1 pt-2">
        <button
          title="Convert"
          className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-violet-400 shadow-sm"
        >
          <FileCode2 className="h-4 w-4" />
        </button>
        <button
          title="History"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 hover:text-gray-400 hover:bg-gray-800/60 transition-colors"
        >
          <History className="h-4 w-4" />
        </button>
      </nav>

      {/* Bottom */}
      <div className="flex flex-col items-center p-1.5 pb-4">
        <button
          title="Settings"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 hover:text-gray-400 hover:bg-gray-800/60 transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
