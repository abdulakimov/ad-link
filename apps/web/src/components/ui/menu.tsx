'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Minimal accessible dropdown: button trigger + click-outside / Esc to close. */
export function Menu({
  trigger,
  triggerClassName,
  ariaLabel,
  align = 'end',
  contentClassName,
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  ariaLabel: string;
  align?: 'start' | 'end';
  contentClassName?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-2 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
            contentClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
