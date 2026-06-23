'use client';

import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Menu } from '@/components/ui/menu';
import { cn } from '@/lib/utils';

export interface DateRange {
  from?: string; // YYYY-MM-DD (omitted = backend default)
  to?: string;
  label: string;
}

// ---- date helpers (local time; app-side Date is fine) ----
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const sameDay = (a: Date, b: Date) => iso(a) === iso(b);
const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const PRESETS: Array<{ key: string; label: string; range: () => [Date, Date] }> = [
  { key: 'today', label: 'Today', range: () => [today(), today()] },
  { key: 'yesterday', label: 'Yesterday', range: () => [addDays(today(), -1), addDays(today(), -1)] },
  { key: 'l7', label: 'Last 7 days', range: () => [addDays(today(), -6), today()] },
  { key: 'l14', label: 'Last 14 days', range: () => [addDays(today(), -13), today()] },
  { key: 'l28', label: 'Last 28 days', range: () => [addDays(today(), -27), today()] },
  { key: 'l30', label: 'Last 30 days', range: () => [addDays(today(), -29), today()] },
  {
    key: 'thisMonth',
    label: 'This month',
    range: () => [monthStart(today()), today()],
  },
  {
    key: 'lastMonth',
    label: 'Last month',
    range: () => [addMonths(monthStart(today()), -1), addDays(monthStart(today()), -1)],
  },
  { key: 'max', label: 'Maximum', range: () => [new Date(2015, 0, 1), today()] },
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  return (
    <Menu
      ariaLabel="Select date range"
      align="end"
      triggerClassName="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:bg-accent"
      contentClassName="w-[700px] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      trigger={
        <>
          <Calendar className="size-4 text-muted-foreground" />
          <span>{value.label}</span>
          <ChevronLeft className="size-4 rotate-[-90deg] text-muted-foreground" />
        </>
      }
    >
      {(close) => <Panel value={value} onChange={onChange} close={close} />}
    </Menu>
  );
}

function Panel({
  value,
  onChange,
  close,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  close: () => void;
}) {
  const initialFrom = value.from ? new Date(`${value.from}T00:00:00`) : null;
  const initialTo = value.to ? new Date(`${value.to}T00:00:00`) : null;
  const [from, setFrom] = useState<Date | null>(initialFrom);
  const [to, setTo] = useState<Date | null>(initialTo);
  const [view, setView] = useState<Date>(addMonths(monthStart(initialFrom ?? today()), 0));

  const pickDay = (d: Date) => {
    if (!from || to) {
      setFrom(d);
      setTo(null);
    } else if (d < from) {
      setFrom(d);
    } else {
      setTo(d);
    }
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    const [f, t] = p.range();
    onChange({ from: iso(f), to: iso(t), label: p.label });
    close();
  };

  const applyCustom = () => {
    if (!from) return;
    const t = to ?? from;
    onChange({ from: iso(from), to: iso(t), label: `${fmt(from)} – ${fmt(t)}` });
    close();
  };

  return (
    <div className="flex">
      {/* presets */}
      <div className="w-40 shrink-0 border-r border-border p-2">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Presets</p>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p)}
            className={cn(
              'block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
              value.label === p.label && 'bg-accent font-medium',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* calendar */}
      <div className="flex-1 p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setView((v) => addMonths(v, -1))}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setView((v) => addMonths(v, 1))}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex gap-4">
          <MonthGrid month={view} from={from} to={to} onPick={pickDay} />
          <MonthGrid month={addMonths(view, 1)} from={from} to={to} onPick={pickDay} />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">
            {from ? `${fmt(from)} – ${to ? fmt(to) : '…'}` : 'Pick a start date'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-input px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!from}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  month,
  from,
  to,
  onPick,
}: {
  month: Date;
  from: Date | null;
  to: Date | null;
  onPick: (d: Date) => void;
}) {
  const first = monthStart(month);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = first.getDay(); // 0 = Sunday
  const cells: Array<Date | null> = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];

  return (
    <div className="w-[15rem]">
      <p className="mb-1 text-center text-sm font-medium">
        {first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </p>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-xs text-muted-foreground">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const isFrom = from && sameDay(d, from);
          const isTo = to && sameDay(d, to);
          const inRange = from && to && d > from && d < to;
          const isToday = sameDay(d, today());
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(d)}
              className={cn(
                'mx-auto grid size-8 place-items-center rounded-md text-sm transition-colors hover:bg-accent',
                inRange && 'bg-accent',
                (isFrom || isTo) && 'bg-primary text-primary-foreground hover:bg-primary',
                isToday && !isFrom && !isTo && 'ring-1 ring-inset ring-border',
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
