import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Link, Code2, Loader2, Sparkles, Zap } from 'lucide-react';
import { ApiKeyInput } from './ApiKeyInput';
import type { ConverterStatus } from '@/hooks/useConverter';

interface InputPanelProps {
  scriptText: string;
  onScriptChange: (v: string) => void;
  urlInput: string;
  onUrlChange: (v: string) => void;
  onImport: () => void;
  onConvert: () => void;
  status: ConverterStatus;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
}

const PLACEHOLDER = `// ==UserScript==
// @name         My Awesome Script
// @description  Does something cool
// @version      1.0
// @match        https://example.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
  'use strict';
  // Your script here...
})();`;

export function InputPanel({
  scriptText,
  onScriptChange,
  urlInput,
  onUrlChange,
  onImport,
  onConvert,
  status,
  apiKey,
  onApiKeyChange,
}: InputPanelProps) {
  const isFetching = status === 'fetching';
  const isConverting = status === 'converting';
  const hasApiKey = apiKey.trim().startsWith('sk-ant-');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onImport();
  };

  return (
    <Card className="flex flex-col h-full rounded-none border-0 border-r">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Link className="h-4 w-4 text-muted-foreground" />
          Import from Greasy Fork
        </CardTitle>
      </CardHeader>

      <CardContent className="px-4 pb-0 flex flex-col gap-3 flex-1">
        {/* URL import */}
        <div className="flex gap-2">
          <Input
            placeholder="https://greasyfork.org/scripts/12345-name/code"
            value={urlInput}
            onChange={e => onUrlChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-xs font-mono h-8"
            disabled={isFetching}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onImport}
            disabled={!urlInput.trim() || isFetching}
            className="shrink-0 h-8"
          >
            {isFetching
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><span>Import</span><ArrowRight className="h-3 w-3 ml-1" /></>
            }
          </Button>
        </div>

        <Separator />

        {/* API Key */}
        <ApiKeyInput value={apiKey} onChange={onApiKeyChange} />

        <Separator />

        {/* Script textarea */}
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Code2 className="h-3.5 w-3.5" />
          Paste Script
        </div>
        <Textarea
          placeholder={PLACEHOLDER}
          value={scriptText}
          onChange={e => onScriptChange(e.target.value)}
          className="flex-1 font-mono text-xs resize-none min-h-[280px]"
          spellCheck={false}
        />

        {/* Convert button */}
        <div className="pb-4">
          <Button
            className="w-full text-white"
            style={{ background: hasApiKey ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : undefined }}
            variant={hasApiKey ? 'default' : 'default'}
            onClick={onConvert}
            disabled={!scriptText.trim() || isConverting || isFetching}
          >
            {isConverting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {hasApiKey ? 'Claude is analyzing…' : 'Converting…'}
              </>
            ) : hasApiKey ? (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Convert with AI
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Convert (shim mode)
              </>
            )}
          </Button>
          {!hasApiKey && (
            <p className="text-[10px] text-center text-muted-foreground mt-1.5">
              Add an API key above for smarter, native MV3 code
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
