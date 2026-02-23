import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Key } from 'lucide-react';

interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function ApiKeyInput({ value, onChange }: ApiKeyInputProps) {
  const [show, setShow] = useState(false);
  const isSet = value.trim().startsWith('sk-or-');

  return (
    <div className="space-y-1.5 rounded-lg border border-stone-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
        <Key className="h-3.5 w-3.5" />
        <span>OpenRouter API Key</span>
        {isSet && (
          <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
            ✓ key set
          </span>
        )}
      </div>

      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Key className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <Input
            type={show ? 'text' : 'password'}
            placeholder="sk-or-v1-..."
            value={value}
            onChange={e => onChange(e.target.value)}
            className="pl-8 text-xs font-mono h-8"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => setShow(s => !s)}
          className="h-8 w-8 shrink-0"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <p className="text-[10px] leading-snug text-stone-500">
        {isSet
          ? 'Claude Agent will analyze intent and generate native MV3 code step by step.'
          : (
            <>
              No key? Falls back to shim-based conversion.{' '}
              <a
                href="https://openrouter.ai/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                Get an OpenRouter key →
              </a>
            </>
          )
        }
      </p>
    </div>
  );
}
