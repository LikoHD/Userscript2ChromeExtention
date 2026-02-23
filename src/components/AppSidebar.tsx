import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Key, Zap, Trash2, Clock, Settings, ChevronRight } from 'lucide-react';
import type { HistoryEntry } from '@/hooks/useConverter';

interface AppSidebarProps {
  apiKey: string;
  setApiKey: (v: string) => void;
  history: HistoryEntry[];
  onClearHistory: () => void;
}

type Panel = 'history' | 'settings';

const COLLAPSED_KEY = 'script2extension_sidebar_collapsed';
const PANEL_KEY     = 'script2extension_sidebar_panel';

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (diffMins < 1)  return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7)  return `${diffDays}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function AppSidebar({ apiKey, setApiKey, history, onClearHistory }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === 'true'
  );
  const [activePanel, setActivePanel] = useState<Panel>(
    () => (localStorage.getItem(PANEL_KEY) as Panel) || 'history'
  );
  const [showKey, setShowKey] = useState(false);
  const isKeySet = apiKey.trim().startsWith('sk-or-');

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  }

  function openPanel(panel: Panel) {
    setActivePanel(panel);
    localStorage.setItem(PANEL_KEY, panel);
    if (collapsed) {
      setCollapsed(false);
      localStorage.setItem(COLLAPSED_KEY, 'false');
    }
  }

  // ── Collapsed: icon-only strip ──────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="w-12 shrink-0 flex flex-col bg-stone-50 border-r border-stone-200 overflow-hidden">
        {/* Logo / expand button */}
        <button
          onClick={toggleCollapse}
          title="展开侧边栏"
          className="h-14 flex items-center justify-center border-b border-stone-200 hover:bg-stone-100 transition-colors shrink-0"
        >
          <div className="h-7 w-7 rounded-lg bg-stone-900 flex items-center justify-center shadow-sm">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
        </button>

        {/* Nav icons */}
        <div className="flex flex-col items-center pt-2 gap-1">
          <button
            onClick={() => openPanel('history')}
            title="历史记录"
            className="h-9 w-9 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors relative"
          >
            <Clock className="h-4 w-4" />
            {history.length > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-stone-600" />
            )}
          </button>
          <button
            onClick={() => openPanel('settings')}
            title="设置"
            className="h-9 w-9 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors relative"
          >
            <Settings className="h-4 w-4" />
            {isKeySet && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Expanded ─────────────────────────────────────────────────────────────
  return (
    <div className="w-60 shrink-0 flex flex-col bg-stone-50 border-r border-stone-200 overflow-hidden">

      {/* ── Header ── */}
      <div className="h-14 px-3 border-b border-stone-200 flex items-center gap-2 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-stone-900 flex items-center justify-center shadow-sm shrink-0">
          <Zap className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold leading-none text-stone-900 truncate">script2extension</h1>
          <p className="text-[11px] text-stone-400 mt-0.5">UserScript → Chrome MV3</p>
        </div>
        {/* Collapse button */}
        <button
          onClick={toggleCollapse}
          title="折叠侧边栏"
          className="h-7 w-7 rounded-md flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors shrink-0"
        >
          <ChevronRight className="h-3.5 w-3.5 rotate-180" />
        </button>
      </div>

      {/* ── Panel tabs ── */}
      <div className="flex items-center px-3 pt-2.5 pb-1.5 gap-1 shrink-0">
        <button
          onClick={() => setActivePanel('history')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
            activePanel === 'history'
              ? 'bg-stone-200 text-stone-800'
              : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          历史记录
          {history.length > 0 && (
            <span className="ml-0.5 text-[10px] text-stone-500 font-normal">({history.length})</span>
          )}
        </button>
        <button
          onClick={() => setActivePanel('settings')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors relative ${
            activePanel === 'settings'
              ? 'bg-stone-200 text-stone-800'
              : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100'
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          设置
          {isKeySet && activePanel !== 'settings' && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
          )}
        </button>
      </div>

      {/* ── Panel content ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {/* History panel */}
        {activePanel === 'history' && (
          <>
            {history.length > 0 && (
              <div className="px-3 pb-1 flex justify-end shrink-0">
                <button
                  onClick={onClearHistory}
                  className="text-[11px] text-stone-400 hover:text-stone-600 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  清空
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 gap-2">
                  <Clock className="h-8 w-8 text-stone-200" />
                  <p className="text-[11px] text-stone-400 text-center leading-relaxed">
                    转换完成后<br />历史记录将显示在这里
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {history.map(entry => (
                    <div
                      key={entry.id}
                      className="px-2.5 py-2 rounded-lg hover:bg-stone-100 transition-colors cursor-default"
                    >
                      <div className="text-[12px] font-medium text-stone-700 truncate leading-snug">
                        {entry.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          entry.mode === 'ai'
                            ? 'bg-stone-200 text-stone-600'
                            : 'bg-stone-100 text-stone-500'
                        }`}>
                          {entry.mode === 'ai' ? 'AI' : 'Shim'}
                        </span>
                        <span className="text-[10px] text-stone-400">{formatDate(entry.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Settings panel */}
        {activePanel === 'settings' && (
          <div className="p-3 flex flex-col gap-3">
            <div className="space-y-1.5 rounded-lg border border-stone-200 bg-white p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600">
                <Key className="h-3 w-3" />
                <span>OpenRouter API Key</span>
                {isKeySet && (
                  <span className="ml-auto rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">
                    ✓ 已设置
                  </span>
                )}
              </div>

              <div className="flex gap-1">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-or-v1-..."
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="text-[11px] font-mono h-7 pr-1"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  className="h-7 w-7 shrink-0"
                >
                  {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>

              <p className="text-[10px] text-stone-400 leading-snug">
                {isKeySet
                  ? 'Claude Agent 将逐步生成原生 MV3 代码'
                  : <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer" className="underline">获取 OpenRouter Key →</a>
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
