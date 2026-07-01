'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  deriveMetrics,
  formatCurrency,
  formatNumber,
  formatRoas,
  type MetricRow,
} from '@adlink/core';
import { DateRangePicker, type DateRange } from '@/components/date-range-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { roasCellClass } from '@/lib/heatmap';
import { getToken } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function PerformancePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const t = getToken();
    if (!t) router.replace('/login');
    else setToken(t);
  }, [router]);

  const [model, setModel] = useState<'FIRST_TOUCH' | 'LAST_TOUCH'>('LAST_TOUCH');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [range, setRange] = useState<DateRange>({ label: 'Last 30 days' });
  const { data, isLoading, error } = useQuery({
    queryKey: ['performance', model, range.from, range.to],
    enabled: !!token,
    queryFn: () =>
      api.performance(token as string, { model, from: range.from, to: range.to }),
  });

  const currency = data?.currency ?? 'USD';

  // Flat rows → drill-in levels: roots (campaigns) and a parent→children index.
  const { roots, childrenOf } = useMemo(() => {
    const rows = data?.rows ?? [];
    const childrenOf = new Map<string, MetricRow[]>();
    for (const r of rows) {
      if (r.level === 'campaign' || !r.parentId) continue;
      const arr = childrenOf.get(r.parentId);
      if (arr) arr.push(r);
      else childrenOf.set(r.parentId, [r]);
    }
    return { roots: rows.filter((r) => r.level === 'campaign'), childrenOf };
  }, [data]);

  // Breadcrumb path of the ancestors we've drilled into ([] = top-level campaigns).
  const [path, setPath] = useState<MetricRow[]>([]);
  const current = path.at(-1) ?? null;
  const hasChildren = (id: string) => (childrenOf.get(id)?.length ?? 0) > 0;
  const visibleRows = useMemo(() => {
    const rows = current ? (childrenOf.get(current.id) ?? []) : roots;
    if (statusFilter === 'ALL') return rows;
    return rows.filter((r) => (r.status === 'ACTIVE') === (statusFilter === 'ACTIVE'));
  }, [current, childrenOf, roots, statusFilter]);

  const levelLabel = !current ? 'campaigns' : current.level === 'campaign' ? 'ad sets' : 'ads';

  // Totals footer (Ads Manager-style "Results from N campaigns" summary row).
  const totals = useMemo(() => {
    const sums = visibleRows.reduce(
      (acc, r) => {
        acc.spend += r.spend;
        acc.impressions += r.impressions;
        acc.clicks += r.clicks;
        acc.leads += r.leads;
        acc.qualifiedLeads += r.qualifiedLeads;
        acc.sales += r.sales;
        acc.revenue += r.revenue;
        return acc;
      },
      { spend: 0, impressions: 0, clicks: 0, leads: 0, qualifiedLeads: 0, sales: 0, revenue: 0 },
    );
    return { ...sums, ...deriveMetrics(sums) };
  }, [visibleRows]);

  const columns = useMemo<ColumnDef<MetricRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Campaign / Ad set / Ad',
        cell: ({ row }) => (
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{row.original.name}</span>
            {hasChildren(row.original.id) && (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        ),
      },
      {
        id: 'delivery',
        header: 'Delivery',
        cell: ({ row }) => {
          const { label, dotClass } = deliveryInfo(row.original.status, row.original.effectiveStatus);
          return (
            <div className="flex items-center justify-end gap-1.5">
              <span className={cn('size-2 shrink-0 rounded-full', dotClass)} />
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
          );
        },
      },
      money('spend', 'Spend', currency),
      plain('leads', 'Leads'),
      plain('qualifiedLeads', 'QL'),
      money('cpl', 'CPL', currency),
      money('costPerQl', 'Cost/QL', currency),
      plain('sales', 'Sales'),
      money('cac', 'CAC', currency),
      money('revenue', 'Revenue', currency),
      {
        accessorKey: 'roas',
        header: 'ROAS',
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return (
            <div className="flex justify-end">
              <span className={cn('rounded-sm px-2 py-0.5 font-mono', roasCellClass(v))}>
                {formatRoas(v)}
              </span>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hasChildren reads the latest childrenOf each render
    [currency, childrenOf],
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: visibleRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
            <p className="text-sm text-muted-foreground">
              Spend vs real revenue, down to the ad.
            </p>
          </div>
          <Select value={model} onValueChange={(v) => setModel(v as typeof model)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LAST_TOUCH">Last-touch</SelectItem>
              <SelectItem value="FIRST_TOUCH">First-touch</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All campaigns</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* Breadcrumb — only when drilled into a campaign/ad set. */}
      {path.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-4 py-2.5 text-sm shadow-sm">
          <button
            type="button"
            onClick={() => setPath([])}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            All campaigns
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setPath(path.slice(0, i + 1))}
                className={cn(
                  'transition-colors',
                  i === path.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {p.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      <Table containerClassName="max-h-[calc(100dvh-260px)] overflow-auto rounded-lg bg-card shadow-sm">
        <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-b bg-secondary hover:bg-secondary">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted(); // 'asc' | 'desc' | false
                  const isName = h.column.id === 'name';
                  return (
                    <TableHead
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      className={cn(
                        'sticky top-0 cursor-pointer select-none bg-secondary transition-colors hover:bg-primary/5',
                        isName ? 'z-30 left-0' : 'z-10',
                        sorted && 'bg-primary/10',
                      )}
                    >
                      <span className={cn('flex items-center gap-1', isName ? 'justify-start' : 'justify-end')}>
                        {h.isPlaceholder
                          ? null
                          : flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === 'asc' && <ArrowUp className="size-3.5 text-primary" />}
                        {sorted === 'desc' && <ArrowDown className="size-3.5 text-primary" />}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-destructive">
                  Failed to load performance.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !error && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  No data yet — connect Meta and a CRM to see performance.
                </TableCell>
              </TableRow>
            )}
            {table.getRowModel().rows.map((row) => {
              const drill = hasChildren(row.original.id);
              return (
                <TableRow
                  key={row.id}
                  onClick={drill ? () => setPath((p) => [...p, row.original]) : undefined}
                  className={cn('group', drill && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        cell.column.id === 'name' && 'sticky left-0 z-20 bg-card group-hover:bg-muted/50',
                        cell.column.id === 'delivery' && 'text-right',
                        cell.column.id !== 'name' && cell.column.id !== 'delivery' && 'text-right font-mono',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
          {!isLoading && !error && visibleRows.length > 0 && (
            <TableFooter>
              <TableRow className="border-t bg-muted/50 hover:bg-muted/50">
                <TableCell className="sticky bottom-0 left-0 z-30 bg-muted/50 font-medium">
                  Results from {visibleRows.length} {levelLabel}
                </TableCell>
                <TableCell className="sticky bottom-0 z-10 bg-muted/50" />
                <TableCell className="sticky bottom-0 z-10 bg-muted/50 text-right font-mono">
                  {formatCurrency(totals.spend, currency)}
                </TableCell>
                <TableCell className="sticky bottom-0 z-10 bg-muted/50 text-right font-mono">
                  {formatNumber(totals.leads)}
                </TableCell>
                <TableCell className="sticky bottom-0 z-10 bg-muted/50 text-right font-mono">
                  {formatNumber(totals.qualifiedLeads)}
                </TableCell>
                <TableCell className="sticky bottom-0 z-10 bg-muted/50 text-right font-mono">
                  {formatCurrency(totals.cpl, currency)}
                </TableCell>
                <TableCell className="sticky bottom-0 z-10 bg-muted/50 text-right font-mono">
                  {formatCurrency(totals.costPerQl, currency)}
                </TableCell>
                <TableCell className="sticky bottom-0 z-10 bg-muted/50 text-right font-mono">
                  {formatNumber(totals.sales)}
                </TableCell>
                <TableCell className="sticky bottom-0 z-10 bg-muted/50 text-right font-mono">
                  {formatCurrency(totals.cac, currency)}
                </TableCell>
                <TableCell className="sticky bottom-0 z-10 bg-muted/50 text-right font-mono">
                  {formatCurrency(totals.revenue, currency)}
                </TableCell>
                <TableCell className="sticky bottom-0 z-10 bg-muted/50 text-right font-mono">
                  {formatRoas(totals.roas)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
    </main>
  );
}

function money(key: keyof MetricRow, header: string, currency: string): ColumnDef<MetricRow> {
  return {
    accessorKey: key,
    header,
    cell: ({ getValue }) => formatCurrency(getValue<number | null>(), currency),
  };
}

function plain(key: keyof MetricRow, header: string): ColumnDef<MetricRow> {
  return {
    accessorKey: key,
    header,
    cell: ({ getValue }) => formatNumber(getValue<number | null>()),
  };
}

const EFFECTIVE_STATUS_LABELS: Record<string, string> = {
  PENDING_BILLING_INFO: 'Payment error',
  CAMPAIGN_PAUSED: 'Paused (parent)',
  ADSET_PAUSED: 'Paused (parent)',
  DISAPPROVED: 'Disapproved',
  WITH_ISSUES: 'Delivery issue',
  PENDING_REVIEW: 'In review',
  IN_PROCESS: 'In review',
};

/**
 * Mirrors Meta's own Delivery column: the on/off toggle (`status`) can say "on" while
 * the account/ad actually isn't delivering (`effectiveStatus`) — e.g. a payment error.
 */
function deliveryInfo(
  status: string | null | undefined,
  effectiveStatus: string | null | undefined,
): { label: string; dotClass: string } {
  if (status !== 'ACTIVE') return { label: 'Off', dotClass: 'bg-muted-foreground/40' };
  if (!effectiveStatus || effectiveStatus === 'ACTIVE') {
    return { label: 'Active', dotClass: 'bg-emerald-500' };
  }
  return { label: EFFECTIVE_STATUS_LABELS[effectiveStatus] ?? 'Not delivering', dotClass: 'bg-destructive' };
}
