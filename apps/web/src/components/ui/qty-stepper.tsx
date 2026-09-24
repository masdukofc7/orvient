'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function QtyStepper({
  value,
  onChange,
  min = 0,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  className?: string;
}) {
  function commit(next: number) {
    if (!Number.isFinite(next)) {
      onChange(min);
      return;
    }
    onChange(Math.max(min, next));
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        aria-label="Decrease quantity"
        onClick={() => commit(Number(value) - 1)}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Input
        className="h-8 w-14 text-center"
        type="number"
        min={min}
        value={Number.isFinite(value) ? value : min}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(min);
            return;
          }
          commit(Number(raw));
        }}
        aria-label="Quantity"
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        aria-label="Increase quantity"
        onClick={() => commit(Number(value) + 1)}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
