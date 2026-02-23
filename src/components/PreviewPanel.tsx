import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle, CheckCircle2, FileCode2, Info,
  Sparkles, Brain, Circle, Loader2,
} from 'lucide-react';
import type { ConversionResult, ConverterStatus, AgentStepState } from '@/hooks/useConverter';

interface PreviewPanelProps {
  result: ConversionResult | null;
  error: string | null;
  agentSteps: AgentStepState[];
  status: ConverterStatus;
}

const BADGE_COLORS: Record<string, string> = {
  GM_xmlhttpRequest:   'bg-blue-100 text-blue-800 border-blue-200',
  'GM.xmlHttpRequest': 'bg-blue-100 text-blue-800 border-blue-200',
  GM_setValue:         'bg-green-100 text-green-800 border-green-200',
  GM_getValue:         'bg-green-100 text-green-800 border-green-200',
  'GM.setValue':       'bg-green-100 text-green-800 border-green-200',
  'GM.getValue':       'bg-green-100 text-green-800 border-green-200',
  GM_deleteValue:      'bg-green-100 text-green-800 border-green-200',
  GM_listValues:       'bg-green-100 text-green-800 border-green-200',
  GM_addStyle:         'bg-purple-100 text-purple-800 border-purple-200',
  'GM.addStyle':       'bg-purple-100 text-purple-800 border-purple-200',
  GM_notification:     'bg-yellow-100 text-yellow-800 border-yellow-200',
  GM_setClipboard:     'bg-orange-100 text-orange-800 border-orange-200',
  GM_openInTab:        'bg-pink-100 text-pink-800 border-pink-200',
};

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="text-xs font-mono bg-muted/50 rounded-md p-4 overflow-auto max-h-[440px] whitespace-pre-wrap break-all leading-relaxed">
      {code}
    </pre>
  );
}

/** Step-by-step agent progress view */
function AgentProgressView({ steps }: { steps: AgentStepState[] }) {
  // Pending steps we expect but haven't received yet
  const receivedSteps = new Set(steps.map(s => s.step));
  const pendingOrder = ['analysis', 'manifest', 'content_js', 'background_js'] as const;
  const pending = pendingOrder.filter(s => !receivedSteps.has(s));

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-700">
        <Brain className="h-4 w-4 animate-pulse" />
        Claude Agent 正在处理…
      </div>

      <div className="flex flex-col gap-2">
        {/* Completed / in-progress steps */}
        {steps.map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm">
              {s.done
                ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                : <Loader2 className="h-4 w-4 text-violet-500 animate-spin shrink-0" />
              }
              <span className={s.done ? 'text-foreground font-medium' : 'text-violet-700 font-semibold'}>
                {s.label}
              </span>
            </div>
            {/* Show snippet of content for analysis step */}
            {s.step === 'analysis' && s.content && (
              <p className="ml-6 text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {s.content}
              </p>
            )}
            {/* Show note content */}
            {s.step === 'note' && s.content && (
              <p className="ml-6 text-xs text-amber-700 leading-relaxed">
                ⚠ {s.content}
              </p>
            )}
          </div>
        ))}

        {/* Pending steps */}
        {pending.map(step => (
          <div key={step} className="flex items-center gap-2 text-sm text-muted-foreground/50">
            <Circle className="h-4 w-4 shrink-0" />
            <span>
              {step === 'analysis' ? '分析脚本意图'
                : step === 'manifest' ? '生成 manifest.json'
                : step === 'content_js' ? '生成 content.js'
                : '生成 background.js'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PreviewPanel({ result, error, agentSteps, status }: PreviewPanelProps) {
  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full p-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="font-mono text-xs whitespace-pre-wrap">{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Agent converting state
  if (status === 'converting') {
    return <AgentProgressView steps={agentSteps} />;
  }

  // Empty state
  if (!result) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-muted-foreground p-8">
        <FileCode2 className="h-12 w-12 opacity-20" />
        <p className="text-sm text-center leading-relaxed">
          Paste a UserScript or import from Greasy Fork,<br />
          then click <strong>Convert</strong> to preview the extension files.
        </p>
      </div>
    );
  }

  // Build result tabs
  const tabs: Array<{ id: string; label: string; content: string; isAnalysis?: boolean }> = [];

  if (result.analysis) {
    tabs.push({ id: 'analysis', label: 'Analysis', content: result.analysis, isAnalysis: true });
  }
  tabs.push({ id: 'manifest', label: 'manifest.json', content: result.manifestJson });
  tabs.push({ id: 'content',  label: 'content.js',    content: result.contentJs });
  if (result.backgroundJs) {
    tabs.push({ id: 'background', label: 'background.js', content: result.backgroundJs });
  }

  return (
    <Card className="flex flex-col h-full rounded-none border-0">
      <CardHeader className="pb-2 pt-4 px-4 space-y-2">

        {/* Mode badge + script info */}
        <div className="flex items-center gap-2 flex-wrap">
          {result.mode === 'ai' ? (
            <Badge className="bg-violet-100 text-violet-800 border-violet-200 text-xs gap-1.5">
              <Sparkles className="h-3 w-3" />
              Claude Agent · Native MV3
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Shim mode
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
            <Info className="h-3 w-3" />
            {result.meta.name} v{result.meta.version}
            {result.meta.matches.length > 0 &&
              ` · ${result.meta.matches.length} match pattern${result.meta.matches.length > 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Shim badges (simple mode only) */}
        {result.shimLog.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {result.shimLog.map((entry, i) => (
              <Badge
                key={i}
                variant="outline"
                className={`text-xs font-mono ${BADGE_COLORS[entry.original] ?? ''}`}
              >
                {entry.original} → {entry.replacement}
              </Badge>
            ))}
          </div>
        )}

        {/* Warnings / notes */}
        {result.warnings.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {result.warnings.map((w, i) => (
              <Alert key={i} className="py-2 px-3 border-yellow-200 bg-yellow-50">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
                <AlertDescription className="text-xs text-yellow-800">{w}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Success line (no shims, no warnings) */}
        {result.shimLog.length === 0 && result.warnings.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Converted successfully.
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 px-4 pb-4 overflow-hidden flex flex-col">
        <Tabs defaultValue={tabs[0].id} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="mb-3 w-full justify-start bg-muted/50 h-8 shrink-0">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs px-3 h-7">
                {tab.isAnalysis && <Sparkles className="h-3 w-3 mr-1.5 text-violet-500" />}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="flex-1 mt-0 overflow-auto">
              {tab.isAnalysis ? (
                <div className="rounded-md border border-violet-200 bg-violet-50/40 p-4 text-sm leading-relaxed text-violet-900">
                  {tab.content}
                </div>
              ) : (
                <CodeBlock code={tab.content} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
