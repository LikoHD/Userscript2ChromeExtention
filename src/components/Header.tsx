import { Button } from '@/components/ui/button';
import { Download, Zap } from 'lucide-react';

interface HeaderProps {
  onDownload: () => void;
  canDownload: boolean;
  isLoading: boolean;
}

export function Header({ onDownload, canDownload, isLoading }: HeaderProps) {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-violet-500" />
          <span className="font-bold text-lg tracking-tight">script2extension</span>
          <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">
            UserScript → Chrome MV3
          </span>
        </div>
        <Button
          onClick={onDownload}
          disabled={!canDownload || isLoading}
          className="bg-violet-600 hover:bg-violet-700 text-white"
          size="sm"
        >
          <Download className="h-4 w-4 mr-2" />
          Download Extension
        </Button>
      </div>
    </header>
  );
}
