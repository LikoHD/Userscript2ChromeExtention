import { useState, useEffect } from 'react';
import { Terminal, FileCode2 } from 'lucide-react';
import type { ConversionResult, ConverterStatus, AgentStepState } from '@/hooks/useConverter';

interface CodePanelProps {
  result: ConversionResult | null;
  agentSteps: AgentStepState[];
  status: ConverterStatus;
}

type TabId = 'analysis' | 'manifest' | 'content_js' | 'background_js';

interface FileTab {
  id: TabId;
  label: string;
  content: string;
  isCode: boolean;
}

// Line-number rendering for code files
function CodeContent({ code, isCode }: { code: string; isCode: boolean }) {
  if (!isCode) {
    return (
      <div className="p-5 text-[13px] leading-relaxed text-violet-300 font-sans">
        {code}
      </div>
    );
  }

  const lines = code.split('\n');
  return (
    <div className="flex text-[12px] font-mono leading-6 min-w-0">
      {/* Line numbers */}
      <div className="select-none text-right pr-4 text-gray-600 shrink-0 min-w-[2.5rem] pt-4 pb-4 pl-4">
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      {/* Code */}
      <pre className="flex-1 text-gray-300 overflow-x-auto pt-4 pb-4 pr-4 whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

export function CodePanel({ result, agentSteps, status }: CodePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('manifest');
  const isLive = status === 'converting';

  // Build available tabs from result OR live agent steps
  const files: FileTab[] = [];

  if (result) {
    if (result.analysis) {
      files.push({ id: 'analysis', label: 'Analysis', content: result.analysis, isCode: false });
    }
    files.push({ id: 'manifest', label: 'manifest.json', content: result.manifestJson, isCode: true });
    files.push({ id: 'content_js', label: 'content.js', content: result.contentJs, isCode: true });
    if (result.backgroundJs) {
      files.push({ id: 'background_js', label: 'background.js', content: result.backgroundJs, isCode: true });
    }
  } else {
    const analysisStep = agentSteps.find(s => s.step === 'analysis');
    const manifestStep = agentSteps.find(s => s.step === 'manifest');
    const contentStep  = agentSteps.find(s => s.step === 'content_js');
    const bgStep       = agentSteps.find(s => s.step === 'background_js');

    if (analysisStep) files.push({ id: 'analysis', label: 'Analysis', content: analysisStep.content, isCode: false });
    if (manifestStep) files.push({ id: 'manifest', label: 'manifest.json', content: manifestStep.content, isCode: true });
    if (contentStep)  files.push({ id: 'content_js', label: 'content.js', content: contentStep.content, isCode: true });
    if (bgStep && bgStep.content !== '(not needed)') {
      files.push({ id: 'background_js', label: 'background.js', content: bgStep.content, isCode: true });
    }
  }

  // Auto-jump to latest file while agent is writing
  useEffect(() => {
    if (isLive && files.length > 0) {
      setActiveTab(files[files.length - 1].id);
    }
  }, [files.length, isLive]);

  // Switch to first file on initial result
  useEffect(() => {
    if (result && files.length > 0) {
      setActiveTab(files[0].id);
    }
  }, [!!result]);

  const activeFile = files.find(f => f.id === activeTab) ?? files[0];

  // ── Empty state ──────────────────────────────────────────────────────────
  if (files.length === 0) {
    return (
      <div className="flex-1 bg-[#0d1117] flex flex-col items-center justify-center gap-3">
        <Terminal className="h-10 w-10 text-gray-700" />
        <p className="text-sm text-gray-600">Generated files will appear here</p>
        {isLive && (
          <div className="flex items-center gap-1.5 text-xs text-violet-400 font-mono">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Waiting for Claude Agent…
          </div>
        )}
      </div>
    );
  }

  // ── Main panel ───────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center h-10 bg-[#161b22] border-b border-white/5 px-2 shrink-0">

        {/* Header label */}
        <div className="flex items-center gap-1.5 text-gray-500 pr-3 border-r border-white/5 mr-2">
          <span className="font-mono text-xs">{'>'}_</span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-none">
          {files.map(file => (
            <button
              key={file.id}
              onClick={() => setActiveTab(file.id)}
              className={`px-3 py-1 text-[11px] rounded font-mono whitespace-nowrap transition-colors ${
                activeTab === file.id
                  ? 'bg-[#0d1117] text-gray-100 border border-white/10'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {file.label}
            </button>
          ))}
        </div>

        {/* Live indicator */}
        {isLive && (
          <div className="flex items-center gap-1.5 text-[11px] text-green-400 font-mono shrink-0 ml-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
        )}

        {/* Done indicator */}
        {status === 'done' && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-mono shrink-0 ml-2">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
            {result?.mode === 'ai' ? 'AI' : 'Shim'}
          </div>
        )}
      </div>

      {/* ── Code content ── */}
      <div className="flex-1 overflow-auto">
        {activeFile && <CodeContent code={activeFile.content} isCode={activeFile.isCode} />}
      </div>

      {/* ── Footer ── */}
      <div className="h-7 bg-[#161b22] border-t border-white/5 flex items-center px-4 gap-4 shrink-0">
        <span className="text-[10px] text-gray-600 font-mono">
          {activeFile?.label}
        </span>
        {activeFile?.isCode && (
          <span className="text-[10px] text-gray-600 font-mono">
            {activeFile.content.split('\n').length} lines
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <FileCode2 className="h-3 w-3 text-gray-600" />
          <span className="text-[10px] text-gray-600 font-mono">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
