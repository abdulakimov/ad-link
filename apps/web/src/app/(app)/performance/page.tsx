'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  formatCurrency,
  formatNumber,
  formatRoas,
  type MetricRow,
} from '@adlink/core';
import { Button } from '@/components/ui/button';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { roasCellClass } from '@/lib/heatmap';
import { getToken } from '@/lib/session';
import { cn } from '@/lib/utils';

type TreeRow = MetricRow & { subRows?: TreeRow[] };

function buildTree(rows: MetricRow[]): TreeRow[] {
  const byId = new Map<string, TreeRow>(rows.map((r) => [r.id, { ...r, subRows: [] }]));
  const roots: TreeRow[] = [];
  for (const r of byId.values()) {
    if (r.level === 'campaign') {
      roots.push(r);
    } else {
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      if (parent) parent.subRows!.push(r);
      else roots.push(r);
    }
  }
  return roots;
}

export default function PerformancePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const t = getToken();
    if (!t) router.replace('/login');
    else setToken(t);
  }, [router]);

  const [model, setModel] = useState<'FIRST_TOUCH' | 'LAST_TOUCH'>('LAST_TOUCH');
  const { data, isLoading, error } = useQuery({
    queryKey: ['performance', model],
    enabled: !!token,
    queryFn: () => api.performance(token as string, { model }),
  });

  const currency = data?.currency ?? 'USD';
  const tree = useMemo(() => (data ? buildTree(data.rows) : []), [data]);

  const columns = useMemo<ColumnDef<TreeRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Campaign / Ad set / Ad',
        cell: ({ row }) => (
          <div className="flex items-center gap-1" style={{ paddingLeft: `${row.depth * 16}px` }}>
            {row.getCanExpand() ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="Toggle row"
                onClick={row.getToggleExpandedHandler()}
              >
                <ChevronRight
                  className={cn('size-4 transition-transform', row.getIsExpanded() && 'rotate-90')}
                />
              </Button>
            ) : (
              <span className="inline-block w-6" />
            )}
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
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
        header: () => <div className="text-right">ROAS</div>,
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
    [currency],
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const table = useReactTable({
    data: tree,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
          <p className="text-sm text-muted-foreground">
            Last 30 days · spend vs real revenue, down to the ad.
          </p>
        </div>
        <Select value={model} onValueChange={(v) => setModel(v as typeof model)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LAST_TOUCH">Last-touch</SelectItem>
            <SelectItem value="FIRST_TOUCH">First-touch</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-hidden rounded-lg bg-card shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={h.column.id === 'name' ? '' : 'text-right'}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
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
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cell.column.id === 'name' ? '' : 'text-right font-mono'}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}

function money(key: keyof MetricRow, header: string, currency: string): ColumnDef<TreeRow> {
  return {
    accessorKey: key,
    header: () => <div className="text-right">{header}</div>,
    cell: ({ getValue }) => formatCurrency(getValue<number | null>(), currency),
  };
}

function plain(key: keyof MetricRow, header: string): ColumnDef<TreeRow> {
  return {
    accessorKey: key,
    header: () => <div className="text-right">{header}</div>,
    cell: ({ getValue }) => formatNumber(getValue<number | null>()),
  };
}
