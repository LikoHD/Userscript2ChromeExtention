import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiKeyInput } from './ApiKeyInput';
import {
  Link2, Loader2, Sparkles, Zap, Download,
  RotateCcw, CheckCircle2, Circle, FileCode2,
  AlertTriangle,
} from 'lucide-react';
import type { ConversionResult, ConverterStatus, AgentStepState } from '@/hooks/useConverter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ConversationPanelProps {
  scriptText: string;
  setScriptText: (v: string) => void;
  urlInput: string;
  setUrlInput: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  agentSteps: AgentStepState[];
  status: ConverterStatus;
  error: string | null;
  result: ConversionResult | null;
  hasStarted: boolean;
  onImport: () => void;
  onConvert: () => void;
  onDownload: () => void;
  onReset: () => void;
}

// ---------------------------------------------------------------------------
// Elapsed timer
// ---------------------------------------------------------------------------
function useElapsedSeconds(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);
  return elapsed;
}

function formatTime(s: number) {
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

// ---------------------------------------------------------------------------
// Placeholder
// ---------------------------------------------------------------------------
const PLACEHOLDER = `// ==UserScript==
// @name         My Script
// @description  Does something cool
// @version      1.0
// @match        https://example.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// ==/UserScript==

(function() {
  'use strict';
  // ...
})();`;

// ---------------------------------------------------------------------------
// InputView — idle state
// ---------------------------------------------------------------------------
function InputView({
  scriptText, setScriptText,
  urlInput, setUrlInput,
  apiKey, setApiKey,
  onImport, onConvert,
  status, error,
}: Pick<ConversationPanelProps,
  'scriptText' | 'setScriptText' | 'urlInput' | 'setUrlInput' |
  'apiKey' | 'setApiKey' | 'onImport' | 'onConvert' | 'status' | 'error'
>) {
  const isFetching = status === 'fetching';
  const hasKey = apiKey.trim().startsWith('sk-or-');

  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-4 gap-3">
      <ApiKeyInput value={apiKey} onChange={setApiKey} />

      <Separator />

      {/* URL import */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="https://greasyfork.org/scripts/..."
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onImport()}
            className="pl-8 text-xs font-mono h-8"
            disabled={isFetching}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onImport}
          disabled={!urlInput.trim() || isFetching}
          className="h-8 shrink-0 text-xs"
        >
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Import'}
        </Button>
      </div>

      {/* Fetch error */}
      {status === 'error' && error && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Script textarea */}
      <Textarea
        placeholder={PLACEHOLDER}
        value={scriptText}
        onChange={e => setScriptText(e.target.value)}
        className="flex-1 font-mono text-xs resize-none min-h-[240px] bg-gray-50/80"
        spellCheck={false}
      />

      {/* Convert button */}
      <Button
        onClick={onConvert}
        disabled={!scriptText.trim() || isFetching}
        className="w-full text-white gap-2 h-9"
        style={hasKey ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : undefined}
      >
        {hasKey
          ? <><Sparkles className="h-4 w-4" />Convert with AI</>
          : <><Zap className="h-4 w-4" />Convert (shim mode)</>
        }
      </Button>

      {!hasKey && (
        <p className="text-[10px] text-center text-muted-foreground -mt-1">
          Add an OpenRouter key above for smarter native MV3 code
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentView — converting / done state
// ---------------------------------------------------------------------------
const MAIN_STEPS = ['analysis', 'manifest', 'content_js', 'background_js'] as const;
const TOTAL = MAIN_STEPS.length;

const STEP_DISPLAY: Record<string, string> = {
  analysis:      '分析脚本意图',
  manifest:      '生成 manifest.json',
  content_js:    '生成 content.js',
  background_js: '生成 background.js',
};

function AgentView({
  result, agentSteps, status, error, onDownload, onReset,
}: Pick<ConversationPanelProps, 'result' | 'agentSteps' | 'status' | 'error' | 'onDownload' | 'onReset'>) {
  const isConverting = status === 'converting';
  const isDone = status === 'done';
  const isError = status === 'error';
  const elapsed = useElapsedSeconds(isConverting);

  const doneCount = agentSteps.filter(
    s => s.done && (MAIN_STEPS as readonly string[]).includes(s.step)
  ).length;

  const scriptName = result?.meta?.name ?? 'UserScript';

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* ── Input card ── */}
      <div className="mx-3 mt-4 rounded-xl border bg-white shadow-sm p-3 flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
          <FileCode2 className="h-4 w-4 text-violet-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate text-gray-900">{scriptName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isConverting ? '正在转换…' : isDone ? (result?.mode === 'ai' ? 'Claude Agent · Native MV3' : 'Shim 模式') : '转换失败'}
          </p>
        </div>
      </div>

      {/* ── Status row ── */}
      <div className="flex items-center gap-2 px-4 mt-3 text-sm">
        {isConverting && (
          <>
            <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin shrink-0" />
            <span className="font-semibold text-violet-700">Working</span>
            <span className="text-muted-foreground text-xs">· {formatTime(elapsed)}</span>
            <span className="text-muted-foreground text-xs">· {doneCount}/{TOTAL}</span>
          </>
        )}
        {isDone && (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span className="font-semibold text-green-700">Complete</span>
            <span className="text-muted-foreground text-xs">· {TOTAL}/{TOTAL}</span>
          </>
        )}
        {isError && (
          <>
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <span className="font-semibold text-red-600 text-sm">Error</span>
          </>
        )}
      </div>

      {/* ── Error message ── */}
      {isError && error && (
        <div className="mx-3 mt-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-mono whitespace-pre-wrap break-all">
          {error}
        </div>
      )}

      {/* ── Steps list ── */}
      <div className="px-4 mt-4 flex flex-col gap-2.5">
        {/* Planning (static header, always shown) */}
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground/50">
          <Circle className="h-3.5 w-3.5 shrink-0" />
          <span>Planning</span>
        </div>

        {MAIN_STEPS.map(step => {
          const stepState = agentSteps.find(s => s.step === step);
          const isDoneStep = stepState?.done ?? false;
          const isActive = stepState !== undefined && !stepState.done;

          return (
            <div key={step}>
              <div className={`flex items-center gap-2.5 text-sm ${
                isDoneStep ? 'text-gray-800'
                  : isActive ? 'text-violet-700'
                  : 'text-muted-foreground/40'
              }`}>
                {isDoneStep
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  : isActive
                  ? <Loader2 className="h-4 w-4 text-violet-500 animate-spin shrink-0" />
                  : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/25" />
                }
                <span className={isDoneStep ? 'font-medium' : ''}>{STEP_DISPLAY[step]}</span>
              </div>

              {/* Analysis snippet */}
              {step === 'analysis' && stepState?.content && (
                <p className="ml-[26px] mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {stepState.content}
                </p>
              )}
            </div>
          );
        })}

        {/* Notes (warnings from agent) */}
        {agentSteps.filter(s => s.step === 'note').map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="leading-snug">{s.content}</span>
          </div>
        ))}
      </div>

      {/* ── File chips (done) ── */}
      {isDone && result && (
        <div className="px-4 mt-4 flex flex-wrap gap-1.5">
          {[
            { name: 'manifest.json', show: true },
            { name: 'content.js', show: true },
            { name: 'background.js', show: !!result.backgroundJs },
          ].filter(f => f.show).map(f => (
            <div
              key={f.name}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 border border-gray-200 text-[11px] font-mono text-gray-600"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              {f.name}
            </div>
          ))}
        </div>
      )}

      {/* Warnings from parser */}
      {isDone && result && result.warnings.length > 0 && (
        <div className="px-3 mt-3 flex flex-col gap-1.5">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="leading-snug">{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-4" />

      {/* ── Bottom actions ── */}
      <div className="p-3 flex flex-col gap-2 border-t bg-white/60 backdrop-blur-sm">
        {isDone && (
          <Button
            onClick={onDownload}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2 h-9"
          >
            <Download className="h-4 w-4" />
            Download Extension (.zip)
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="w-full text-muted-foreground gap-2 h-8 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {isDone ? 'New conversion' : 'Cancel & start over'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConversationPanel — root
// ---------------------------------------------------------------------------
export function ConversationPanel(props: ConversationPanelProps) {
  const { hasStarted, status, agentSteps, result, error } = props;

  // Show input form while not yet started (or if fetching/import-error with no progress)
  const showInput = !hasStarted;

  return (
    <div className="flex flex-col h-full bg-gray-50/80 overflow-hidden">
      {/* Panel header */}
      <div className="px-4 h-14 border-b bg-white/80 backdrop-blur-sm flex items-center gap-2 shrink-0">
        <div>
          <h1 className="text-sm font-bold leading-none">script2extension</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">UserScript → Chrome MV3</p>
        </div>
      </div>

      {showInput ? (
        <InputView
          scriptText={props.scriptText}
          setScriptText={props.setScriptText}
          urlInput={props.urlInput}
          setUrlInput={props.setUrlInput}
          apiKey={props.apiKey}
          setApiKey={props.setApiKey}
          onImport={props.onImport}
          onConvert={props.onConvert}
          status={status}
          error={error}
        />
      ) : (
        <AgentView
          result={result}
          agentSteps={agentSteps}
          status={status}
          error={error}
          onDownload={props.onDownload}
          onReset={props.onReset}
        />
      )}
    </div>
  );
}
