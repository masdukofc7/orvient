'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ORDER = ['light', 'dark', 'system'] as const;

export function ThemeToggle({
  className,
  showLabel = false,
  size = 'default',
}: {
  className?: string;
  showLabel?: boolean;
  size?: 'default' | 'icon';
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = (mounted ? theme : 'system') as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system';

  const icon =
    !mounted || current === 'system' ? (
      <Monitor className="h-4 w-4" />
    ) : current === 'dark' ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Sun className="h-4 w-4" />
    );

  const label =
    !mounted || current === 'system' ? 'System' : current === 'dark' ? 'Dark' : 'Light';

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={cn(showLabel && 'w-full justify-start', className)}
      aria-label={`Theme: ${label}. Click for ${next}`}
      title={`Theme: ${label}`}
      onClick={() => setTheme(next)}
    >
      <span className="relative inline-flex h-4 w-4 items-center justify-center">{icon}</span>
      {showLabel ? label : null}
    </Button>
  );
}
