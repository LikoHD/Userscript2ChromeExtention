import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  FolderOpen,
  Download,
} from 'lucide-react';
import type {
  ConversionResult,
  ConverterStatus,
  AgentStepState,
  StreamingBlock,
} from '@/hooks/useConverter';

interface RightPanelProps {
  result: ConversionResult | null;
  agentSteps: AgentStepState[];
  status: ConverterStatus;
  streamingBlock: StreamingBlock | null;
  onDownload: () => void;
  sourceText: string;
}

type MainTab = 'code' | 'files' | 'notes';
type CodeFileId = string;

interface CodeEntry {
  id: CodeFileId;
  label: string;
  isCode: boolean;
}

function formatBytes(size: number) {
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
}

function AnalysisViewer({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-stone-400">No content yet</p>
      </div>
    );
  }

  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      if (currentHeading || currentLines.length > 0) {
        sections.push({ heading: currentHeading, body: currentLines.join('\n').trim() });
      }
      currentHeading = line.slice(3).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentHeading || currentLines.length > 0) {
    sections.push({ heading: currentHeading, body: currentLines.join('\n').trim() });
  }

  if (sections.length === 1 && !sections[0].heading) {
    return <div className="p-5 text-[13px] leading-relaxed text-stone-700 font-sans whitespace-pre-wrap">{text}</div>;
  }

  return (
    <div className="p-5 flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={i}>
          {section.heading && <h3 className="text-[13px] font-semibold text-stone-900 mb-1.5">{section.heading}</h3>}
          <p className="text-[13px] leading-relaxed text-stone-600 whitespace-pre-wrap">{section.body}</p>
        </div>
      ))}
    </div>
  );
}

function CodeViewer({ code, isCode, isStreaming }: { code: string; isCode: boolean; isStreaming?: boolean }) {
  const displayCode = isStreaming ? `${code}▋` : code;

  if (!displayCode) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-stone-400">No content yet</p>
      </div>
    );
  }

  if (!isCode) {
    return <AnalysisViewer text={displayCode} />;
  }

  const lines = displayCode.split('\n');
  return (
    <div className="flex text-[12px] font-mono leading-6 min-w-0">
      <div className="select-none text-right pr-3 text-stone-300 shrink-0 min-w-[2.5rem] pt-4 pb-4 pl-4 border-r border-stone-100">
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <pre className="flex-1 text-stone-800 overflow-x-auto pt-4 pb-4 px-4 whitespace-pre">{displayCode}</pre>
    </div>
  );
}

function codeFileEntries(
  result: ConversionResult | null,
  sourceText: string,
  streamingBlock: StreamingBlock | null
): CodeEntry[] {
  const entries: CodeEntry[] = [];
  if (sourceText.trim()) entries.push({ id: 'source', label: 'source', isCode: true });

  const liveAnalysis = streamingBlock?.toolName === 'set_analysis';
  if (result?.analysis || liveAnalysis) entries.push({ id: 'analysis', label: 'Analysis', isCode: false });

  const resultFiles = result?.files ?? [];
  for (const file of resultFiles) {
    entries.push({ id: `file:${file.path}`, label: file.path, isCode: true });
  }

  if (streamingBlock?.toolName === 'write_file' && streamingBlock.filePath) {
    const id = `file:${streamingBlock.filePath}`;
    if (!entries.some(item => item.id === id)) {
      entries.push({ id, label: streamingBlock.filePath, isCode: true });
    }
  }

  return entries;
}

function codeForId(
  id: CodeFileId,
  result: ConversionResult | null,
  sourceText: string,
  streamingBlock: StreamingBlock | null
): string {
  if (id === 'source') return sourceText;

  if (id === 'analysis') {
    if (streamingBlock?.toolName === 'set_analysis') return streamingBlock.content;
    return result?.analysis ?? '';
  }

  if (!id.startsWith('file:')) return '';
  const path = id.slice('file:'.length);

  if (streamingBlock?.toolName === 'write_file' && streamingBlock.filePath === path) {
    return streamingBlock.content;
  }

  return result?.files.find(file => file.path === path)?.content ?? '';
}

function CodeTab({
  result,
  sourceText,
  streamingBlock,
  status,
  activeFile,
  onActiveFileChange,
}: {
  result: ConversionResult | null;
  sourceText: string;
  streamingBlock: StreamingBlock | null;
  status: ConverterStatus;
  activeFile: CodeFileId;
  onActiveFileChange: (file: CodeFileId) => void;
}) {
  const entries = useMemo(() => codeFileEntries(result, sourceText, streamingBlock), [result, sourceText, streamingBlock]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <FileCode2 className="h-10 w-10 text-stone-200" />
        <p className="text-sm text-stone-400">Generated code will appear here</p>
      </div>
    );
  }

  const selected = entries.find(file => file.id === activeFile) ?? entries[0];
  const code = codeForId(selected.id, result, sourceText, streamingBlock);

  const isStreaming =
    (selected.id === 'analysis' && streamingBlock?.toolName === 'set_analysis') ||
    (selected.id.startsWith('file:') && streamingBlock?.toolName === 'write_file' && selected.id === `file:${streamingBlock.filePath}`);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-stone-100 bg-stone-50 shrink-0 overflow-x-auto">
        {entries.map(file => (
          <button
            key={file.id}
            onClick={() => onActiveFileChange(file.id)}
            className={`px-3 py-1 text-[11px] rounded font-mono whitespace-nowrap transition-colors ${
              selected.id === file.id
                ? 'bg-white text-stone-900 border border-stone-200 shadow-sm'
                : 'text-stone-400 hover:text-stone-700 hover:bg-white/60'
            }`}
          >
            {file.label}
          </button>
        ))}

        {status === 'converting' && isStreaming && (
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-stone-500 font-mono animate-pulse">Streaming...</div>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <CodeViewer code={code} isCode={selected.isCode} isStreaming={isStreaming} />
      </div>

      <div className="h-7 bg-stone-50 border-t border-stone-100 flex items-center px-4 gap-4 shrink-0">
        <span className="text-[10px] text-stone-400 font-mono">{selected.label}</span>
        {selected.isCode && code && (
          <span className="text-[10px] text-stone-400 font-mono">{code.split('\n').length} lines</span>
        )}
      </div>
    </div>
  );
}

function FilesTab({
  result,
  sourceText,
  onOpenCodeFile,
}: {
  result: ConversionResult | null;
  sourceText: string;
  onOpenCodeFile: (fileId: CodeFileId) => void;
}) {
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <FolderOpen className="h-10 w-10 text-stone-200" />
        <p className="text-sm text-stone-400">Files will appear here after conversion</p>
      </div>
    );
  }

  const files = [
    ...(sourceText.trim() ? [{ id: 'source', name: 'source.user.js', size: sourceText.length }] : []),
    ...result.files.map(file => ({ id: `file:${file.path}`, name: file.path, size: file.content.length })),
  ];

  return (
    <div className="p-4 flex flex-col gap-1">
      <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wide mb-2">Extension contents</p>
      {files.map((file, i) => (
        <button
          type="button"
          key={i}
          onClick={() => onOpenCodeFile(file.id)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-stone-50 text-left group"
        >
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-stone-500" />
          <span className="text-[12px] font-mono text-stone-700 flex-1 truncate">{file.name}</span>
          <span className="text-[10px] text-stone-400 font-mono">{formatBytes(file.size)}</span>
          <span className="text-[10px] text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity">跳转代码</span>
        </button>
      ))}
    </div>
  );
}

function NotesTab({
  result,
  agentSteps,
  onOpenCodeFile,
}: {
  result: ConversionResult | null;
  agentSteps: AgentStepState[];
  onOpenCodeFile: (fileId: CodeFileId) => void;
}) {
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <FileCode2 className="h-10 w-10 text-stone-200" />
        <p className="text-sm text-stone-400">转换完成后会显示说明与提示</p>
      </div>
    );
  }

  const noteSet = new Set<string>();
  for (const warning of result.warnings) {
    if (warning.trim()) noteSet.add(warning.trim());
  }
  for (const step of agentSteps) {
    if (step.step === 'note' && step.content.trim()) noteSet.add(step.content.trim());
  }

  const openable = [
    ...(result.analysis ? [{ id: 'analysis', label: 'analysis' }] : []),
    ...result.files.map(file => ({ id: `file:${file.path}`, label: file.path })),
  ];

  return (
    <div className="p-5 flex flex-col gap-5 overflow-y-auto h-full">
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-900">1. 转换完成说明</h3>
        <p className="mt-2 text-xs text-stone-600 leading-relaxed">
          已完成 <span className="font-mono">{result.meta.name}</span> 的 Chrome MV3 转换，当前模式为
          <span className="font-medium"> {result.mode === 'ai' ? 'AI 原生模式' : 'Shim 模式'} </span>。
          当前共生成 <span className="font-medium">{result.files.length}</span> 个文件。
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {openable.slice(0, 8).map(file => (
            <button
              type="button"
              key={file.id}
              onClick={() => onOpenCodeFile(file.id)}
              className="px-2.5 py-1 rounded-md bg-stone-100 text-[11px] font-mono text-stone-700 hover:bg-stone-200"
            >
              {file.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-900">2. 检查结果</h3>
        {result.checks.length === 0 ? (
          <p className="mt-2 text-xs text-stone-600">当前没有 Agent 检查记录（可能是 shim 模式）。</p>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            {result.checks.map((check, index) => (
              <div key={index} className="rounded-md border border-stone-200 p-3 bg-stone-50">
                <div className="flex items-center gap-2 text-xs">
                  {check.pass ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  )}
                  <span className="font-medium text-stone-700">检查 #{index + 1}</span>
                </div>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">{check.summary}</p>
                {check.issues.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {check.issues.map(issue => (
                      <div key={issue.id} className="text-[11px] text-stone-600 leading-snug">
                        <span className="font-mono text-stone-700">[{issue.severity}]</span> {issue.message}
                        {issue.file ? <span className="text-stone-500"> ({issue.file})</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h3 className="text-sm font-semibold text-amber-900">3. 重要提示</h3>

        {result.analysis && (
          <div className="mt-2 rounded-md border border-amber-200 bg-white/70 p-3 text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">
            {result.analysis}
          </div>
        )}

        {noteSet.size > 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            {Array.from(noteSet).map((note, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="leading-snug">{note}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-800">当前没有额外的重要提示。</p>
        )}
      </section>
    </div>
  );
}

export function RightPanel({
  result,
  agentSteps,
  status,
  streamingBlock,
  onDownload,
  sourceText,
}: RightPanelProps) {
  const [mainTab, setMainTab] = useState<MainTab>('code');
  const [activeCodeFile, setActiveCodeFile] = useState<CodeFileId>('source');

  function openCodeFile(file: CodeFileId) {
    setActiveCodeFile(file);
    setMainTab('code');
  }

  const tabs: Array<{ id: MainTab; label: string }> = [
    { id: 'code', label: '代码' },
    { id: 'files', label: '文件' },
    { id: 'notes', label: '提示' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      <div className="h-14 border-b border-stone-200 flex items-center px-4 gap-1 shrink-0 bg-white">
        <div className="flex items-center bg-stone-100 rounded-lg p-1 gap-0.5 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                mainTab === tab.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {status === 'converting' && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-stone-500 font-mono animate-pulse">Live</span>
          </div>
        )}

        {status === 'done' && (
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-green-600 font-mono">
              <CheckCircle2 className="h-3 w-3" />
              {result?.mode === 'ai' ? 'Claude Agent' : 'Shim'}
            </div>
            <button
              onClick={onDownload}
              className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 bg-stone-900 text-white hover:bg-stone-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              下载 .zip
            </button>
          </div>
        )}

        {status !== 'converting' && status !== 'done' && (
          <button
            disabled
            className="ml-auto px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 bg-stone-900 text-white opacity-40 cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            下载 .zip
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {mainTab === 'code' && (
          <CodeTab
            result={result}
            sourceText={sourceText}
            streamingBlock={streamingBlock}
            status={status}
            activeFile={activeCodeFile}
            onActiveFileChange={setActiveCodeFile}
          />
        )}

        {mainTab === 'files' && (
          <div className="h-full overflow-y-auto">
            <FilesTab result={result} sourceText={sourceText} onOpenCodeFile={openCodeFile} />
          </div>
        )}

        {mainTab === 'notes' && (
          <div className="h-full overflow-y-auto bg-stone-50/60">
            <NotesTab result={result} agentSteps={agentSteps} onOpenCodeFile={openCodeFile} />
          </div>
        )}
      </div>
    </div>
  );
}
