import { useState, useCallback } from 'react';
import { parseUserScript, type UserScriptMeta } from '@/lib/parser';
import { transformScript, type ShimLogEntry } from '@/lib/transformer';
import { buildBackgroundScript } from '@/lib/background';
import { buildManifest, normalizeManifestForPackaging } from '@/lib/manifest';
import { buildZip } from '@/lib/zipper';
import { fetchFromGreasyFork, isGreasyForkUrl } from '@/lib/fetcher';
import {
  convertWithAgent,
  type AgentStep,
  type AgentProgressEvent,
  type GeneratedFile,
  type CheckReport,
  type StreamEvent,
} from '@/lib/agentConverter';

export interface StreamingBlock {
  toolName: string;
  content: string;
  filePath?: string;
}

const API_KEY_STORAGE = 'script2extension_openrouter_key';
const SCRIPT_STORAGE = 'script2extension_script';
const HISTORY_STORAGE = 'script2extension_history';
const MAX_HISTORY = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AgentStepState {
  step: AgentStep;
  label: string;
  content: string;
  done: boolean;
  filePath?: string;
  round?: number;
}

export type TimelineStatus = 'pending' | 'active' | 'done' | 'error';

export interface TimelineItem {
  id: string;
  title: string;
  detail?: string;
  status: TimelineStatus;
  filePath?: string;
  round?: number;
}

export interface TimelineStage {
  id: 'analysis' | 'architecture' | 'build' | 'verify';
  title: string;
  status: TimelineStatus;
  startedAt: number | null;
  endedAt: number | null;
  items: TimelineItem[];
}

export interface ConversionResult {
  meta: UserScriptMeta;
  files: GeneratedFile[];
  checks: CheckReport[];
  manifestJson: string;
  contentJs: string;
  backgroundJs: string | null;
  shimLog: ShimLogEntry[];
  warnings: string[];
  requireFileNames: string[];
  analysis?: string;
  mode: 'ai' | 'simple';
}

export interface HistoryEntry {
  id: string;
  name: string;
  timestamp: number;
  mode: 'ai' | 'simple';
}

export type ConverterStatus = 'idle' | 'fetching' | 'converting' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildRequireFileNames(requires: string[]): string[] {
  return requires.map((url, i) => {
    try {
      const path = new URL(url).pathname;
      const base = path.split('/').pop() || `require_${i}.js`;
      return `require_${i}_${base.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    } catch {
      return `require_${i}.js`;
    }
  });
}

const STEP_LABELS: Partial<Record<AgentStep, string>> = {
  analysis: '分析脚本意图',
  plan_files: '规划扩展文件结构',
  write_file: '写入文件',
  delete_file: '删除文件',
  check: '检查',
  fix: '修复',
  note: '添加备注',
  done: '完成',
  // legacy
  manifest: '生成 manifest.json',
  content_js: '生成 content.js',
  background_js: '生成 background.js',
};

function labelForEvent(event: AgentProgressEvent): string {
  if (event.step === 'write_file' && event.filePath) return `生成 ${event.filePath}`;
  if (event.step === 'delete_file' && event.filePath) return `删除 ${event.filePath}`;
  if (event.step === 'check') return `检查 #${event.round ?? 1}`;
  if (event.step === 'fix') return `修复 #${event.round ?? 1}`;
  return STEP_LABELS[event.step] || event.step;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(history: HistoryEntry[]) {
  localStorage.setItem(HISTORY_STORAGE, JSON.stringify(history));
}

function createInitialTimeline(): TimelineStage[] {
  return [
    {
      id: 'analysis',
      title: '获取并理解原脚本功能/依赖',
      status: 'pending',
      startedAt: null,
      endedAt: null,
      items: [{ id: 'analysis-intent', title: '分析脚本意图', status: 'pending' }],
    },
    {
      id: 'architecture',
      title: '设计 Chrome 扩展架构（MV3 权限与通信）',
      status: 'pending',
      startedAt: null,
      endedAt: null,
      items: [{ id: 'plan-files', title: '规划动态文件结构', status: 'pending' }],
    },
    {
      id: 'build',
      title: '实现扩展代码与打包产物',
      status: 'pending',
      startedAt: null,
      endedAt: null,
      items: [],
    },
    {
      id: 'verify',
      title: '检查与修复（Agent 循环）',
      status: 'pending',
      startedAt: null,
      endedAt: null,
      items: [],
    },
  ];
}

function touchStage(stage: TimelineStage, status: TimelineStatus): TimelineStage {
  const now = Date.now();
  const next: TimelineStage = { ...stage, status };
  if (status !== 'pending' && next.startedAt == null) next.startedAt = now;
  if ((status === 'done' || status === 'error') && next.endedAt == null) next.endedAt = now;
  return next;
}

function upsertItem(stage: TimelineStage, item: TimelineItem): TimelineStage {
  const items = [...stage.items];
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...item };
  } else {
    items.push(item);
  }
  return { ...stage, items };
}

function withStage(
  stages: TimelineStage[],
  id: TimelineStage['id'],
  updater: (stage: TimelineStage) => TimelineStage
): TimelineStage[] {
  return stages.map(stage => (stage.id === id ? updater(stage) : stage));
}

function applyStreamToTimeline(stages: TimelineStage[], event: StreamEvent): TimelineStage[] {
  if (event.toolName === 'set_analysis') {
    return withStage(stages, 'analysis', stage => {
      let next = touchStage(stage, 'active');
      next = upsertItem(next, {
        id: 'analysis-intent',
        title: '分析脚本意图',
        detail: event.content,
        status: 'active',
      });
      return next;
    });
  }

  if (event.toolName === 'plan_files') {
    return withStage(stages, 'architecture', stage => {
      let next = touchStage(stage, 'active');
      next = upsertItem(next, {
        id: 'plan-files',
        title: '规划动态文件结构',
        detail: event.content,
        status: 'active',
      });
      return next;
    });
  }

  if (event.toolName === 'write_file') {
    const path = event.filePath || 'unknown file';
    return withStage(stages, 'build', stage => {
      let next = touchStage(stage, 'active');
      next = upsertItem(next, {
        id: `write-${path}`,
        title: `生成 ${path}`,
        detail: event.content,
        status: 'active',
        filePath: path,
      });
      return next;
    });
  }

  if (event.toolName === 'run_check') {
    return withStage(stages, 'verify', stage => {
      let next = touchStage(stage, 'active');
      next = upsertItem(next, {
        id: 'check-active',
        title: '检查',
        detail: event.content,
        status: 'active',
      });
      return next;
    });
  }

  if (event.toolName === 'apply_fix') {
    return withStage(stages, 'verify', stage => {
      let next = touchStage(stage, 'active');
      next = upsertItem(next, {
        id: 'fix-active',
        title: '修复',
        detail: event.content,
        status: 'active',
      });
      return next;
    });
  }

  return stages;
}

function applyProgressToTimeline(stages: TimelineStage[], event: AgentProgressEvent): TimelineStage[] {
  if (event.step === 'analysis') {
    const activated = withStage(stages, 'analysis', stage => {
      let next = touchStage(stage, 'done');
      next = upsertItem(next, {
        id: 'analysis-intent',
        title: '分析脚本意图',
        detail: event.content,
        status: 'done',
      });
      return next;
    });
    return withStage(activated, 'architecture', stage => touchStage(stage, 'active'));
  }

  if (event.step === 'plan_files') {
    const activated = withStage(stages, 'architecture', stage => {
      let next = touchStage(stage, 'done');
      next = upsertItem(next, {
        id: 'plan-files',
        title: '规划动态文件结构',
        detail: event.content,
        status: 'done',
      });
      return next;
    });
    return withStage(activated, 'build', stage => touchStage(stage, 'active'));
  }

  if (event.step === 'write_file') {
    const path = event.filePath || 'unknown file';
    return withStage(stages, 'build', stage => {
      let next = touchStage(stage, 'active');
      next = upsertItem(next, {
        id: `write-${path}`,
        title: `生成 ${path}`,
        detail: event.content,
        status: 'done',
        filePath: path,
      });
      return next;
    });
  }

  if (event.step === 'delete_file') {
    const path = event.filePath || 'unknown file';
    return withStage(stages, 'build', stage => {
      let next = touchStage(stage, 'active');
      next = upsertItem(next, {
        id: `delete-${path}`,
        title: `删除 ${path}`,
        detail: event.content,
        status: 'done',
        filePath: path,
      });
      return next;
    });
  }

  if (event.step === 'check') {
    const afterBuild = withStage(stages, 'build', stage => {
      if (stage.items.length === 0) return stage;
      if (stage.status === 'done') return stage;
      return touchStage(stage, 'done');
    });

    return withStage(afterBuild, 'verify', stage => {
      const id = `check-${event.round ?? stage.items.filter(i => i.id.startsWith('check-')).length + 1}`;
      const pass = Boolean(event.passed);
      let next = touchStage(stage, pass ? 'done' : 'active');
      next = upsertItem(next, {
        id,
        title: `检查 #${event.round ?? 1}`,
        detail: event.content,
        status: pass ? 'done' : 'active',
        round: event.round,
      });
      return next;
    });
  }

  if (event.step === 'fix') {
    return withStage(stages, 'verify', stage => {
      let next = touchStage(stage, 'active');
      next = upsertItem(next, {
        id: `fix-${event.round ?? stage.items.filter(i => i.id.startsWith('fix-')).length + 1}`,
        title: `修复 #${event.round ?? 1}`,
        detail: event.content,
        status: 'done',
        round: event.round,
      });
      return next;
    });
  }

  if (event.step === 'note') {
    return withStage(stages, 'verify', stage => {
      let next = touchStage(stage, 'active');
      next = upsertItem(next, {
        id: `note-${stage.items.filter(i => i.id.startsWith('note-')).length + 1}`,
        title: '提示',
        detail: event.content,
        status: 'done',
      });
      return next;
    });
  }

  return stages;
}

function finalizeTimeline(stages: TimelineStage[], success: boolean, errorMsg?: string): TimelineStage[] {
  if (success) {
    return stages.map(stage => {
      if (stage.status === 'done') return stage;
      if (stage.status === 'active') return touchStage(stage, 'done');
      return stage;
    });
  }

  let marked = false;
  const next = stages.map(stage => {
    if (!marked && stage.status === 'active') {
      marked = true;
      return touchStage(stage, 'error');
    }
    return stage;
  });

  if (marked) return next;

  return withStage(next, 'verify', stage => {
    let updated = touchStage(stage, 'error');
    if (errorMsg) {
      updated = upsertItem(updated, {
        id: `error-${Date.now()}`,
        title: '失败',
        detail: errorMsg,
        status: 'error',
      });
    }
    return updated;
  });
}

function normalizeAiFiles(files: GeneratedFile[]): {
  files: GeneratedFile[];
  manifestJson: string;
  contentJs: string;
  backgroundJs: string | null;
  notes: string[];
} {
  const notes: string[] = [];
  const map = new Map(files.map(file => [file.path, { ...file }]));

  let manifestPath = 'manifest.json';
  if (!map.has(manifestPath)) {
    const fallback = files.find(file => file.kind === 'manifest');
    if (fallback) {
      manifestPath = fallback.path;
    }
  }

  if (manifestPath !== 'manifest.json' && map.has(manifestPath)) {
    const manifestFile = map.get(manifestPath)!;
    map.delete(manifestPath);
    map.set('manifest.json', { ...manifestFile, path: 'manifest.json', kind: 'manifest', required: true });
    notes.push(`Manifest file path was normalized from ${manifestPath} to manifest.json.`);
    manifestPath = 'manifest.json';
  }

  const manifestFile = map.get('manifest.json');
  let manifestJson = '{}';
  if (manifestFile) {
    try {
      const parsed = JSON.parse(manifestFile.content) as unknown;
      const normalized = normalizeManifestForPackaging(parsed);
      manifestJson = JSON.stringify(normalized.manifest, null, 2);
      map.set('manifest.json', { ...manifestFile, content: manifestJson, kind: 'manifest', required: true });
      notes.push(...normalized.notes);
    } catch {
      manifestJson = manifestFile.content;
      notes.push('AI manifest.json 解析失败，保留原始内容。');
    }
  }

  const contentFile =
    Array.from(map.values()).find(file => file.kind === 'content') ||
    map.get('content.js') ||
    null;

  const backgroundFile =
    Array.from(map.values()).find(file => file.kind === 'background') ||
    map.get('background.js') ||
    null;

  return {
    files: Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path)),
    manifestJson,
    contentJs: contentFile?.content ?? '',
    backgroundJs: backgroundFile?.content ?? null,
    notes,
  };
}

function buildSimpleTimeline(hasBackground: boolean): TimelineStage[] {
  const now = Date.now();
  const buildItems: TimelineItem[] = [
    { id: 'manifest', title: '生成 manifest.json', status: 'done', filePath: 'manifest.json' },
    { id: 'content', title: '生成 content.js', status: 'done', filePath: 'content.js' },
  ];
  if (hasBackground) {
    buildItems.push({
      id: 'background',
      title: '生成 background.js',
      status: 'done',
      filePath: 'background.js',
    });
  }

  return [
    {
      id: 'analysis',
      title: '获取并理解原脚本功能/依赖',
      status: 'done',
      startedAt: now,
      endedAt: now,
      items: [{ id: 'analysis-intent', title: '解析脚本元信息', status: 'done' }],
    },
    {
      id: 'architecture',
      title: '设计 Chrome 扩展架构（MV3 权限与通信）',
      status: 'done',
      startedAt: now,
      endedAt: now,
      items: [{ id: 'plan-files', title: '规划固定文件结构（shim）', status: 'done' }],
    },
    {
      id: 'build',
      title: '实现扩展代码与打包产物',
      status: 'done',
      startedAt: now,
      endedAt: now,
      items: buildItems,
    },
    {
      id: 'verify',
      title: '检查与修复（Agent 循环）',
      status: 'done',
      startedAt: now,
      endedAt: now,
      items: [{ id: 'verify-skip', title: 'shim 模式跳过 Agent 检查循环', status: 'done' }],
    },
  ];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useConverter() {
  const [scriptText, setScriptTextState] = useState(() => localStorage.getItem(SCRIPT_STORAGE) || '');
  const [urlInput, setUrlInput] = useState('');
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '');
  const [agentSteps, setAgentSteps] = useState<AgentStepState[]>([]);
  const [timelineStages, setTimelineStages] = useState<TimelineStage[]>(() => createInitialTimeline());
  const [status, setStatus] = useState<ConverterStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [streamingBlock, setStreamingBlock] = useState<StreamingBlock | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  const setScriptText = useCallback((text: string) => {
    setScriptTextState(text);
    if (text) {
      localStorage.setItem(SCRIPT_STORAGE, text);
    } else {
      localStorage.removeItem(SCRIPT_STORAGE);
    }
  }, []);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
  }, []);

  const addHistoryEntry = useCallback((name: string, mode: 'ai' | 'simple') => {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      timestamp: Date.now(),
      mode,
    };
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_STORAGE);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setAgentSteps([]);
    setStreamingBlock(null);
    setTimelineStages(createInitialTimeline());
    setStatus('idle');
    setHasStarted(false);
  }, []);

  const importFromUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!isGreasyForkUrl(url)) {
      setError('Only Greasy Fork URLs are supported (greasyfork.org/scripts/...)');
      return;
    }
    setStatus('fetching');
    setError(null);
    try {
      const code = await fetchFromGreasyFork(url);
      setScriptText(code);
      setStatus('idle');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [urlInput, setScriptText]);

  const convert = useCallback(async () => {
    if (!scriptText.trim()) {
      setError('Please paste a UserScript or import one from Greasy Fork.');
      return;
    }

    setHasStarted(true);
    setStatus('converting');
    setError(null);
    setAgentSteps([]);
    setResult(null);
    setTimelineStages(createInitialTimeline());

    const meta = parseUserScript(scriptText);

    // ── AI mode (OpenRouter Agent) ─────────────────────────────────────────
    if (apiKey.trim()) {
      try {
        const aiResult = await convertWithAgent(
          scriptText,
          apiKey.trim(),
          event => {
            if (event.step === 'done') {
              setStreamingBlock(null);
              return;
            }

            setAgentSteps(prev => {
              const updated = prev.map(s => (!s.done ? { ...s, done: true } : s));
              const entry: AgentStepState = {
                step: event.step,
                label: labelForEvent(event),
                content: event.content,
                done: event.step === 'note' ? true : event.step !== 'check' || Boolean(event.passed),
                filePath: event.filePath,
                round: event.round,
              };
              return [...updated, entry];
            });

            setTimelineStages(prev => applyProgressToTimeline(prev, event));
          },
          stream => {
            setStreamingBlock({
              toolName: stream.toolName,
              content: stream.content,
              filePath: stream.filePath,
            });
            setTimelineStages(prev => applyStreamToTimeline(prev, stream));
          }
        );

        setStreamingBlock(null);
        setAgentSteps(prev => prev.map(s => ({ ...s, done: true })));

        const normalized = normalizeAiFiles(aiResult.files);
        const requireFileNames = buildRequireFileNames(meta.requires);
        const checkWarnings = aiResult.checks.flatMap((check, index) =>
          check.issues.map(issue =>
            `[Check #${index + 1}] ${issue.severity.toUpperCase()}: ${issue.message}${
              issue.file ? ` (${issue.file})` : ''
            }`
          )
        );

        const convResult: ConversionResult = {
          meta,
          files: normalized.files,
          checks: aiResult.checks,
          manifestJson: normalized.manifestJson,
          contentJs: normalized.contentJs,
          backgroundJs: normalized.backgroundJs,
          shimLog: [],
          warnings: [...meta.warnings, ...aiResult.notes, ...normalized.notes, ...checkWarnings],
          requireFileNames,
          analysis: aiResult.analysis,
          mode: 'ai',
        };

        setResult(convResult);
        setTimelineStages(prev => finalizeTimeline(prev, true));
        setStatus('done');
        addHistoryEntry(meta.name || 'Untitled', 'ai');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setTimelineStages(prev => finalizeTimeline(prev, false, message));
        setStatus('error');
      }
      return;
    }

    // ── Simple (shim) mode ─────────────────────────────────────────────────
    try {
      const { contentJs, needsBackground, shimLog } = transformScript(scriptText, meta);
      const backgroundJs = needsBackground ? buildBackgroundScript(meta) : null;
      const requireFileNames = buildRequireFileNames(meta.requires);
      const manifest = buildManifest(meta, {
        hasBackground: backgroundJs !== null,
        requireFiles: requireFileNames,
      });

      const files: GeneratedFile[] = [
        {
          path: 'manifest.json',
          content: JSON.stringify(manifest, null, 2),
          kind: 'manifest',
          required: true,
          reason: 'Generated from parser metadata in shim mode.',
        },
        {
          path: 'content.js',
          content: contentJs,
          kind: 'content',
          required: true,
          reason: 'Transformed script output in shim mode.',
        },
        ...(backgroundJs
          ? [
              {
                path: 'background.js',
                content: backgroundJs,
                kind: 'background' as const,
                required: false,
                reason: 'Required by transformed GM APIs in shim mode.',
              },
            ]
          : []),
      ];

      const convResult: ConversionResult = {
        meta,
        files,
        checks: [],
        manifestJson: JSON.stringify(manifest, null, 2),
        contentJs,
        backgroundJs,
        shimLog,
        warnings: meta.warnings,
        requireFileNames,
        mode: 'simple',
      };
      setResult(convResult);
      setTimelineStages(buildSimpleTimeline(backgroundJs !== null));
      setStatus('done');
      addHistoryEntry(meta.name || 'Untitled', 'simple');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setTimelineStages(prev => finalizeTimeline(prev, false, message));
      setStatus('error');
    }
  }, [scriptText, apiKey, addHistoryEntry]);

  const download = useCallback(async () => {
    if (!result) return;
    const prevStatus = status;
    setStatus('converting');
    try {
      const blob = await buildZip(
        {
          files: result.files,
          requireUrls: result.meta.requires,
          iconUrl: result.meta.icon,
        },
        result.meta.name
      );
      const safe = result.meta.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `${safe}.zip`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(prevStatus);
    }
  }, [result, status]);

  return {
    scriptText,
    setScriptText,
    urlInput,
    setUrlInput,
    apiKey,
    setApiKey,
    agentSteps,
    timelineStages,
    streamingBlock,
    status,
    error,
    result,
    hasStarted,
    history,
    clearHistory,
    importFromUrl,
    convert,
    download,
    reset,
  };
}
