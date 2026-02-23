import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Zap,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Circle,
  Link2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ConverterStatus, TimelineItem, TimelineStage } from '@/hooks/useConverter';

interface LeftPanelProps {
  scriptText: string;
  urlInput: string;
  setUrlInput: (v: string) => void;
  hasAiKey: boolean;
  timelineStages: TimelineStage[];
  status: ConverterStatus;
  error: string | null;
  onImport: () => void;
  onConvert: () => void;
  onReset: () => void;
}

function useElapsedSeconds(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);
  return elapsed;
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function iconForStatus(status: TimelineItem['status']) {
  if (status === 'done') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  if (status === 'active') return <Loader2 className="h-3.5 w-3.5 text-stone-600 animate-spin shrink-0" />;
  if (status === 'error') return <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  return <Circle className="h-3.5 w-3.5 text-stone-300 shrink-0" />;
}

function stageDurationText(stage: TimelineStage): string {
  if (stage.startedAt == null) return '';
  const end = stage.endedAt ?? Date.now();
  const sec = Math.max(0, Math.floor((end - stage.startedAt) / 1000));
  return fmt(sec);
}

export function LeftPanel({
  scriptText,
  urlInput,
  setUrlInput,
  hasAiKey,
  timelineStages,
  status,
  error,
  onImport,
  onConvert,
  onReset,
}: LeftPanelProps) {
  const isFetching = status === 'fetching';
  const isConverting = status === 'converting';
  const isDone = status === 'done';
  const isError = status === 'error';
  const elapsed = useElapsedSeconds(isConverting);

  const doneStages = timelineStages.filter(s => s.status === 'done').length;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsed(prev => {
      const next = { ...prev };
      for (const stage of timelineStages) {
        if (!(stage.id in next)) next[stage.id] = false;
      }
      return next;
    });
  }, [timelineStages]);

  const stageList = useMemo(
    () =>
      timelineStages.map(stage => {
        const stageIcon =
          stage.status === 'done' ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : stage.status === 'active' ? (
            <Loader2 className="h-4 w-4 text-stone-600 animate-spin shrink-0" />
          ) : stage.status === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          ) : (
            <Circle className="h-4 w-4 text-stone-300 shrink-0" />
          );

        return {
          ...stage,
          stageIcon,
          duration: stageDurationText(stage),
          items: stage.items,
        };
      }),
    [timelineStages]
  );

  return (
    <div className="flex flex-col h-full bg-white border-r border-stone-200 overflow-hidden">
      <div className="px-5 h-14 border-b border-stone-200 flex items-center gap-2 shrink-0">
        <p className="text-xs text-stone-400">输入脚本</p>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto p-4 gap-3 min-h-0">
        <Separator />

        {isError && error && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
            <Input
              placeholder="https://greasyfork.org/scripts/..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onImport()}
              className="pl-8 text-xs font-mono h-8"
              disabled={isFetching || isConverting}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onImport}
            disabled={!urlInput.trim() || isFetching || isConverting}
            className="h-8 shrink-0 text-xs"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Import'}
          </Button>
        </div>

        {scriptText.trim() && (
          <div className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200 rounded-md px-2.5 py-2">
            已加载 source，代码在右侧 <span className="font-mono">source</span> 标签查看。
          </div>
        )}

        {!isDone && (
          <Button
            onClick={onConvert}
            disabled={!scriptText.trim() || isFetching || isConverting}
            className={`w-full text-white gap-2 h-9 shrink-0 ${
              hasAiKey ? 'bg-stone-900 hover:bg-stone-800' : 'bg-stone-600 hover:bg-stone-700'
            }`}
          >
            {isConverting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Converting... {fmt(elapsed)} · {doneStages}/4
              </>
            ) : hasAiKey ? (
              <>
                <Zap className="h-4 w-4" />Convert with AI
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />Convert (shim mode)
              </>
            )}
          </Button>
        )}

        {!hasAiKey && !isConverting && !isDone && (
          <p className="text-[10px] text-center text-stone-400 -mt-1 shrink-0">在左侧设置 OpenRouter key 以使用 AI 模式</p>
        )}

        {isDone && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 shrink-0">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="font-medium">转换完成</span>
          </div>
        )}

        <div className="mt-1 rounded-lg border border-stone-200 bg-stone-50 p-3 shrink-0">
          <p className="text-[11px] font-medium text-stone-500 uppercase tracking-wide mb-2">Steps</p>
          <div className="flex flex-col gap-2">
            {stageList.map(stage => {
              const isCollapsed = collapsed[stage.id] ?? false;
              return (
                <div key={stage.id} className="rounded-md border border-stone-200 bg-white/80">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
                    onClick={() => setCollapsed(prev => ({ ...prev, [stage.id]: !isCollapsed }))}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                    )}
                    {stage.stageIcon}
                    <span
                      className={`text-xs flex-1 ${
                        stage.status === 'done'
                          ? 'text-stone-800'
                          : stage.status === 'active'
                            ? 'text-stone-700'
                            : stage.status === 'error'
                              ? 'text-red-700'
                              : 'text-stone-400'
                      }`}
                    >
                      {stage.title}
                    </span>
                    {stage.duration && <span className="text-[10px] text-stone-400 font-mono">{stage.duration}</span>}
                  </button>

                  {!isCollapsed && stage.items.length > 0 && (
                    <div className="px-2.5 pb-2 flex flex-col gap-1.5">
                      {stage.items.map(item => (
                        <div key={item.id} className="flex items-start gap-2 text-[11px]">
                          {iconForStatus(item.status)}
                          <div className="min-w-0 flex-1">
                            <p
                              className={`leading-snug ${
                                item.status === 'done'
                                  ? 'text-stone-700'
                                  : item.status === 'active'
                                    ? 'text-stone-700'
                                    : item.status === 'error'
                                      ? 'text-red-700'
                                      : 'text-stone-400'
                              }`}
                            >
                              {item.title}
                            </p>
                            {item.detail && (
                              <p className="text-[10px] text-stone-500 leading-snug line-clamp-2 mt-0.5">{item.detail}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {(isDone || isConverting || isError) && (
        <div className="p-3 flex flex-col gap-2 border-t border-stone-200 bg-white shrink-0">
          <Button variant="ghost" size="sm" onClick={onReset} className="w-full text-stone-500 gap-2 h-8 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            {isDone ? 'New conversion' : 'Cancel & start over'}
          </Button>
        </div>
      )}
    </div>
  );
}
