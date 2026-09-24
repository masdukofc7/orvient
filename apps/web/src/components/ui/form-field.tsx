'use client';

import { Children, cloneElement, isValidElement, useId } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

function hasRequiredControl(node: React.ReactNode): boolean {
  let found = false;
  Children.forEach(node, (child) => {
    if (found || !isValidElement(child)) return;
    const props = child.props as { required?: boolean; children?: React.ReactNode };
    if (props.required) {
      found = true;
      return;
    }
    if (props.children != null) found = hasRequiredControl(props.children);
  });
  return found;
}

export function FormField({
  label,
  htmlFor,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  /** Force asterisk; otherwise inferred from a nested control with `required`. */
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const autoId = useId();
  const fieldId = htmlFor ?? autoId;
  const showRequired = required ?? hasRequiredControl(children);

  const enhanced = Children.map(children, (child, index) => {
    if (index !== 0 || !isValidElement<{ id?: string }>(child)) return child;
    if (child.props.id) return child;
    return cloneElement(child, { id: fieldId });
  });

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={fieldId}>
          {label}
          {showRequired ? (
            <>
              <span className="ml-0.5 text-destructive" aria-hidden>
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </Label>
      ) : null}
      {enhanced}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
