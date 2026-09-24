'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SelectOption } from '@inventory/shared';

export type SelectProps = Omit<React.ComponentProps<'select'>, 'children'> & {
  options?: ReadonlyArray<SelectOption>;
  placeholder?: string;
  children?: React.ReactNode;
  containerClassName?: string;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, options, placeholder, children, ...props }, ref) => (
    <div className={cn('relative w-full', containerClassName)}>
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-base text-foreground shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'sm:h-9 sm:text-sm',
          className,
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        ) : null}
        {options?.map((option) => (
          <option key={option.value} value={option.value} title={option.description}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);
Select.displayName = 'Select';
