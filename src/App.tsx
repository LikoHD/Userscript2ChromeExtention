import { AppSidebar } from '@/components/AppSidebar';
import { LeftPanel } from '@/components/LeftPanel';
import { RightPanel } from '@/components/RightPanel';
import { useConverter } from '@/hooks/useConverter';

export default function App() {
  const conv = useConverter();

  return (
    <div className="flex h-screen overflow-hidden bg-white">

      {/* Sidebar — logo, history, settings */}
      <AppSidebar
        apiKey={conv.apiKey}
        setApiKey={conv.setApiKey}
        history={conv.history}
        onClearHistory={conv.clearHistory}
      />

      {/* Left — input & controls */}
      <div className="w-[380px] min-w-[320px] flex flex-col overflow-hidden shrink-0">
        <LeftPanel
          scriptText={conv.scriptText}
          urlInput={conv.urlInput}
          setUrlInput={conv.setUrlInput}
          hasAiKey={conv.apiKey.trim().startsWith('sk-or-')}
          timelineStages={conv.timelineStages}
          status={conv.status}
          error={conv.error}
          onImport={conv.importFromUrl}
          onConvert={conv.convert}
          onReset={conv.reset}
        />
      </div>

      {/* Right — Steps / Code / Files tabs */}
      <RightPanel
        result={conv.result}
        agentSteps={conv.agentSteps}
        status={conv.status}
        streamingBlock={conv.streamingBlock}
        onDownload={conv.download}
        sourceText={conv.scriptText}
      />
    </div>
  );
}
