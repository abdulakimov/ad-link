'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatCurrency, formatNumber, formatRoas } from '@adlink/core';
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
import { useAuthToken } from '@/lib/use-auth-token';
import { cn } from '@/lib/utils';

const DIMENSIONS: Array<[string, string]> = [
  ['hook', 'Hook'],
  ['concept', 'Concept'],
  ['angle', 'Angle'],
  ['format', 'Format'],
  ['video', 'Video'],
];

export default function CreativesPage() {
  const token = useAuthToken();
  const [dimension, setDimension] = useState('hook');
  const { data, isLoading } = useQuery({
    queryKey: ['creatives', dimension],
    enabled: !!token,
    queryFn: () => api.creativeInsights(token as string, dimension),
  });
  const currency = data?.currency ?? 'USD';

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Creative insights</h1>
          <p className="text-sm text-muted-foreground">
            Which creative ideas actually make money — ranked by ROAS.
          </p>
        </div>
        <Select value={dimension} onValueChange={setDimension}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIMENSIONS.map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="capitalize">{dimension}</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">QL</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Cost/QL</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data?.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No tagged creatives yet.
                </TableCell>
              </TableRow>
            )}
            {data?.rows.map((row) => (
              <TableRow key={row.value}>
                <TableCell className="font-medium">{row.value}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(row.spend, currency)}</TableCell>
                <TableCell className="text-right font-mono">{formatNumber(row.leads)}</TableCell>
                <TableCell className="text-right font-mono">{formatNumber(row.qualifiedLeads)}</TableCell>
                <TableCell className="text-right font-mono">{formatNumber(row.sales)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(row.revenue, currency)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(row.costPerQl, currency)}</TableCell>
                <TableCell className="text-right">
                  <span className={cn('rounded-sm px-2 py-0.5 font-mono', roasCellClass(row.roas))}>
                    {formatRoas(row.roas)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
